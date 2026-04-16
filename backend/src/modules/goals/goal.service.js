const Goal = require('../../models/Goal.js')
const Task = require('../../models/Task.js')
const logger = require('../../utils/logger.js')

const resolveDependencyName = (task, allTasks) => {
  if (!task.dependsOn || task.dependsOn.length === 0) return null
  const depOrderIndex = task.dependsOn[0]
  const depTask = allTasks.find(t => t.orderIndex === depOrderIndex)
  return depTask ? depTask.title : null
}

const confirmGoal = async (userId, goalData, tasks, redisClient) => {
  const goal = new Goal({
    userId,
    title: goalData.title,
    goalType: goalData.goalType || 'other',
    deadline: goalData.deadline || null,
    hoursPerDay: goalData.hoursPerDay || 2,
    status: 'active',
    totalTasks: tasks.length,
    completedTasks: 0,
    completionRate: 0
  })

  await goal.save()
  logger.info(`Goal saved: ${goal._id} — "${goal.title}"`)

  const taskDocs = tasks.map(task => ({
    goalId: goal._id,
    userId,
    title: task.title,
    description: task.description || '',
    taskType: task.task_type,
    difficulty: task.difficulty,
    baseDurationMin: task.base_duration_min,
    priority: task.priority,
    orderIndex: task.order_index,
    frequency: task.frequency,
    repeatDays: task.repeat_days || [],
    phase: task.phase,
    dependsOn: task.depends_on || [],
    topicName: task.topic_name || '',
    status: 'pending',
    source: 'new',
    attemptCount: 0,
    priorityBoost: 0,
    skipCount: 0
  }))

  const savedTasks = await Task.insertMany(taskDocs)
  logger.info(`${savedTasks.length} tasks saved for goal ${goal._id}`)

  // Trigger full regenerate to merge with existing goals by deadline
  if (redisClient) {
    const scheduleService = require('../schedule/schedule.service.js')
    const result = await scheduleService.regenerateSchedule(userId, redisClient)
    logger.info(`Full schedule regeneration triggered after goal creation. Total tasks: ${result.totalTasks}`)
  } else {
    logger.warn('Redis client not available — schedule regeneration not triggered')
  }

  return { goal, tasks: savedTasks }
}

const getMyGoals = async (userId) => {
  const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean()

  const goalsWithStats = await Promise.all(
    goals.map(async (goal) => {
      const totalTasks = await Task.countDocuments({ goalId: goal._id })
      const completedTasks = await Task.countDocuments({ goalId: goal._id, status: 'completed' })
      return {
        ...goal,
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0
      }
    })
  )

  return goalsWithStats
}

const getGoalById = async (goalId, userId) => {
  const goal = await Goal.findOne({ _id: goalId, userId }).lean()

  if (!goal) {
    const err = new Error('Goal not found')
    err.statusCode = 404
    throw err
  }

  const tasks = await Task.find({ goalId }).sort({ orderIndex: 1 }).lean()
  return { ...goal, tasks }
}


const deleteGoal = async (goalId, userId, redisClient) => {
  const goal = await Goal.findOne({ _id: goalId, userId })

  if (!goal) {
    const err = new Error('Goal not found')
    err.statusCode = 404
    throw err
  }

  const totalTasks = await Task.countDocuments({ goalId })
  const completedTasks = await Task.countDocuments({ goalId, status: 'completed' })
  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0

  // SOFT DELETE: Update goal status to 'deleted'
  await Goal.findByIdAndUpdate(goalId, {
    completionRate,
    totalTasks,
    completedTasks,
    status: 'deleted'
  })

  // SOFT DELETE: Mark tasks as 'deleted'
  await Task.updateMany(
    { goalId },
    { $set: { status: 'deleted', source: 'deleted' } }
  )

  // DELETE all scheduled sessions for this goal
  const ScheduledSession = require('../../models/ScheduleSession.js')
  const deletedSessions = await ScheduledSession.deleteMany({ goalId })
  logger.info(`Deleted ${deletedSessions.deletedCount} scheduled sessions for goal ${goalId}`)

  logger.info(`Soft deleted goal: ${goalId} - "${goal.title}", ${totalTasks} tasks marked as deleted`)

  // Trigger schedule regeneration after deletion
  if (redisClient) {
    const scheduleService = require('../schedule/schedule.service.js')
    await scheduleService.regenerateSchedule(userId, redisClient)
    logger.info(`Schedule regeneration triggered after goal deletion`)
  }

  return {
    completionRate,
    tasksDeleted: totalTasks,
    sessionsDeleted: deletedSessions.deletedCount,
    message: 'Goal soft deleted successfully'
  }
}

const getWeeklyStats = async (userId) => {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysToMonday)
  weekStart.setHours(0, 0, 0, 0)

  const totalThisWeek = await Task.countDocuments({
    userId,
    createdAt: { $gte: weekStart },
    frequency: { $in: ['once', 'near_deadline'] }
  })

  const completedThisWeek = await Task.countDocuments({
    userId,
    completedAt: { $gte: weekStart },
    status: 'completed'
  })

  const weeklyRate = totalThisWeek > 0
    ? Math.round((completedThisWeek / totalThisWeek) * 100)
    : 0

  return {
    weeklyCompletionRate: weeklyRate,
    completedThisWeek,
    totalThisWeek,
    weekStart
  }
}

module.exports = {
  confirmGoal,
  getMyGoals,
  getGoalById,
  deleteGoal,
  getWeeklyStats
}