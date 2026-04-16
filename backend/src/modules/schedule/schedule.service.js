const Task = require('../../models/Task.js')
const ScheduledSession = require('../../models/ScheduleSession.js')
const Goal = require('../../models/Goal.js')
const logger = require('../../utils/logger.js')

const getTodaySchedule = async (userId) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const sessions = await ScheduledSession.find({
    userId,
    scheduledDate: { $gte: today, $lt: tomorrow },
    status: { $in: ['scheduled', 'in_progress', 'completed'] }
  })
    .populate({
      path: 'taskId',
      populate: {
        path: 'goalId',
        select: 'title'
      }
    })
    .sort({ startTime: 1 })
    .lean()

  const enrichedSessions = sessions.map(session => {
    const goalTitle = session.taskId?.goalId?.title || 'Unknown Goal'
    return {
      ...session,
      goalTitle: goalTitle
    }
  })

  return { date: today, sessions: enrichedSessions }
}

const regenerateSchedule = async (userId, redisClient) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const deleteResult = await ScheduledSession.deleteMany({
    userId,
    scheduledDate: { $gte: today },
    status: { $in: ['scheduled', 'in_progress'] }
  })
  logger.info(`Deleted ${deleteResult.deletedCount} future sessions for user ${userId}`)

  const incompleteTasks = await Task.find({
    userId,
    status: { $nin: ['completed'] }
  }).lean()

  const pendingTasks = incompleteTasks.filter(t => t.status === 'pending' || t.status === 'scheduled')
  const failedTasks = incompleteTasks.filter(t => t.status === 'failed' || t.status === 'skipped')

  logger.info(`Regenerate - User: ${userId}`)
  logger.info(`  Total incomplete tasks: ${incompleteTasks.length}`)
  logger.info(`  Pending: ${pendingTasks.length}`)
  logger.info(`  Failed/Skipped: ${failedTasks.length}`)

  const mapTask = (task, source) => ({
    task_id: task._id.toString(),
    task_name: task.title,
    task_type: task.taskType,
    difficulty: task.difficulty,
    base_duration_min: task.baseDurationMin,
    deadline: task.deadline
      ? new Date(task.deadline).toISOString()
      : null,
    source,
    attempt_count: task.attemptCount || 0,
    priority_boost: task.priorityBoost || 0,
    last_failed_reason: task.lastFailedReason || null,
    llm_order: task.orderIndex
  })

  const payload = {
    type: 'REGENERATE_SCHEDULE',
    user_id: userId.toString(),
    now: new Date().toISOString(),
    user_state: {
      fatigue_raw: 3,
      hours_per_day: 24
    },
    pending_tasks: pendingTasks.map(t => mapTask(t, 'pending')),
    failed_tasks: failedTasks.map(t => mapTask(t, 'failed'))
  }

  await redisClient.lpush('schedule_queue', JSON.stringify(payload))
  logger.info(`Schedule regeneration queued for user ${userId} with ${incompleteTasks.length} total tasks`)

  return {
    message: 'Schedule regeneration queued',
    totalTasks: incompleteTasks.length,
    failedSkippedCount: failedTasks.length
  }
}

const completeTask = async (taskId, userId, actualDurationMin) => {
  const task = await Task.findOne({ _id: taskId, userId })
  if (!task) {
    const err = new Error('Task not found')
    err.statusCode = 404
    throw err
  }

  const needsFeedback = ['once', 'near_deadline'].includes(task.frequency)

  task.status = 'completed'
  task.completedAt = new Date()
  task.actualDurationMin = actualDurationMin || task.baseDurationMin
  await task.save()

  await unblockDependents(task.goalId, task.orderIndex, userId)

  await ScheduledSession.findOneAndUpdate(
    { taskId, userId, status: { $in: ['scheduled', 'in_progress'] } },
    { status: 'completed', actualDurationMin: task.actualDurationMin }
  )

  logger.info(`Task completed: ${taskId}`)
  return { task, needsFeedback }
}

const missTask = async (taskId, userId) => {
  const task = await Task.findOne({ _id: taskId, userId })
  if (!task) {
    const err = new Error('Task not found')
    err.statusCode = 404
    throw err
  }

  if (task.frequency === 'daily' || task.frequency === 'weekly') {
    task.status = 'pending'
    await task.save()
    return { task, addedToBuffer: false }
  }

  task.status = 'failed'
  task.source = 'failed'
  task.attemptCount += 1
  task.priorityBoost = (task.priorityBoost || 0) + 1

  const cooldown = new Date()
  cooldown.setHours(cooldown.getHours() + 6)
  task.cooldownUntil = cooldown

  await task.save()
  await blockDependents(task.goalId, task.orderIndex, userId)

  await ScheduledSession.findOneAndUpdate(
    { taskId, userId, status: { $in: ['scheduled', 'in_progress'] } },
    { status: 'failed' }
  )

  logger.info(`Task failed: ${taskId}, priorityBoost: ${task.priorityBoost}`)
  return { task, addedToBuffer: true }
}

const skipTask = async (taskId, userId) => {
  const task = await Task.findOne({ _id: taskId, userId })
  if (!task) {
    const err = new Error('Task not found')
    err.statusCode = 404
    throw err
  }

  task.status = 'skipped'
  task.source = 'failed'
  task.attemptCount += 1
  task.priorityBoost = (task.priorityBoost || 0) + 2

  const cooldown = new Date()
  cooldown.setHours(cooldown.getHours() + 12)
  task.cooldownUntil = cooldown

  await task.save()
  await blockDependents(task.goalId, task.orderIndex, userId)

  await ScheduledSession.findOneAndUpdate(
    { taskId, userId, status: { $in: ['scheduled', 'in_progress'] } },
    { status: 'skipped' }
  )

  logger.info(`Task skipped: ${taskId}, priorityBoost: ${task.priorityBoost}`)
  return { task, addedToBuffer: true }
}

const blockDependents = async (goalId, skippedOrderIndex, userId) => {
  const dependentTasks = await Task.find({
    goalId,
    userId,
    dependsOn: skippedOrderIndex,
    status: { $in: ['pending', 'scheduled'] }
  })

  for (const task of dependentTasks) {
    task.status = 'blocked'
    await task.save()
    await blockDependents(goalId, task.orderIndex, userId)
  }

  logger.info(`Blocked ${dependentTasks.length} dependent tasks`)
}

const unblockDependents = async (goalId, completedOrderIndex, userId) => {
  const blockedTasks = await Task.find({
    goalId,
    userId,
    dependsOn: completedOrderIndex,
    status: 'blocked'
  })

  for (const task of blockedTasks) {
    const allDone = await checkAllDepsCompleted(task.dependsOn, goalId, userId)
    if (allDone) {
      task.status = 'pending'
      await task.save()
      logger.info(`Task unblocked: ${task._id} — "${task.title}"`)
    }
  }
}

const checkAllDepsCompleted = async (dependsOn, goalId, userId) => {
  if (!dependsOn || dependsOn.length === 0) return true

  for (const depOrderIndex of dependsOn) {
    const depTask = await Task.findOne({ goalId, userId, orderIndex: depOrderIndex })
    if (!depTask || depTask.status !== 'completed') return false
  }

  return true
}

module.exports = {
  getTodaySchedule,
  regenerateSchedule,
  completeTask,
  missTask,
  skipTask
}