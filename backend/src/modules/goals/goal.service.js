const Goal = require('../../models/Goal')
const Task = require('../../models/Task')
const logger = require('../../utils/logger')

const resolveDependencyName = (task, allTasks) => {
  if (!task.dependsOn || task.dependsOn.length === 0) return null
  const depOrderIndex = task.dependsOn[0]
  const depTask = allTasks.find(t => t.orderIndex === depOrderIndex)
  return depTask ? depTask.title : null
}

const sendToRL = async (userId, goal, savedTasks, redisClient) => {
  const totalMinutes = savedTasks.reduce((sum, task) => sum + task.baseDurationMin, 0)
  const estimatedTotalHours = Math.round((totalMinutes / 60) * 10) / 10

  const rlPayload = {
    goal_id:  goal._id.toString(),
    user_id:  userId.toString(),
    decomposition_metadata: {
      model_used:                process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      total_tasks:               savedTasks.length,
      estimated_total_hours:     estimatedTotalHours,
      decomposition_confidence:  0.87
    },
    tasks: savedTasks.map(task => ({
      task_id:             task._id.toString(),
      task_name:           task.title,
      task_type:           task.taskType,
      difficulty:          task.difficulty,
      base_duration_min:   task.baseDurationMin,
      deadline:            goal.deadline
                             ? new Date(goal.deadline).toISOString()
                             : null,
      dependency_task_name: resolveDependencyName(task, savedTasks),
      topic_name:          task.topicName || '',
      priority_hint:       task.priority,
      source:              'new',
      attempt_count:       0,
      priority_boost:      0,
      last_failed_reason:  null,
      llm_order:           task.orderIndex
    }))
  }

  await redisClient.lpush('rl_task_queue', JSON.stringify(rlPayload))
  logger.info(`RL payload sent — goal: ${goal._id}, tasks: ${savedTasks.length}, hours: ${estimatedTotalHours}`)
}

const confirmGoal = async (userId, goalData, tasks, redisClient) => {
  const goal = new Goal({
    userId,
    title:       goalData.title,
    goalType:    goalData.goalType || 'other',
    deadline:    goalData.deadline || null,
    hoursPerDay: goalData.hoursPerDay || 2,
    status:      'active',
    totalTasks:  tasks.length,
    completedTasks: 0,
    completionRate: 0
  })

  await goal.save()
  logger.info(`Goal saved: ${goal._id} — "${goal.title}"`)

  const taskDocs = tasks.map(task => ({
    goalId:          goal._id,
    userId,
    title:           task.title,
    description:     task.description || '',
    taskType:        task.task_type,
    difficulty:      task.difficulty,
    baseDurationMin: task.base_duration_min,
    priority:        task.priority,
    orderIndex:      task.order_index,
    frequency:       task.frequency,
    repeatDays:      task.repeat_days || [],
    phase:           task.phase,
    dependsOn:       task.depends_on || [],
    topicName:       task.topic_name || '',
    status:          'pending',
    source:          'new',
    attemptCount:    0,
    priorityBoost:   0,
    skipCount:       0
  }))

  const savedTasks = await Task.insertMany(taskDocs)
  logger.info(`${savedTasks.length} tasks saved for goal ${goal._id}`)

  if (redisClient) {
    await sendToRL(userId, goal, savedTasks, redisClient)
  } else {
    logger.warn('Redis client not available — RL payload not sent')
  }

  return { goal, tasks: savedTasks }
}

const getMyGoals = async (userId) => {
  const goals = await Goal.find({ userId }).sort({ createdAt: -1 }).lean()

  const goalsWithStats = await Promise.all(
    goals.map(async (goal) => {
      const totalTasks     = await Task.countDocuments({ goalId: goal._id })
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

const deleteGoal = async (goalId, userId) => {
  const goal = await Goal.findOne({ _id: goalId, userId })

  if (!goal) {
    const err = new Error('Goal not found')
    err.statusCode = 404
    throw err
  }

  const totalTasks     = await Task.countDocuments({ goalId })
  const completedTasks = await Task.countDocuments({ goalId, status: 'completed' })
  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0

  await Goal.findByIdAndUpdate(goalId, {
    completionRate,
    totalTasks,
    completedTasks,
    status: 'abandoned'
  })

  const deletedTasks = await Task.deleteMany({ goalId })
  logger.info(`Deleted ${deletedTasks.deletedCount} tasks for goal ${goalId}`)

  await Goal.findByIdAndDelete(goalId)
  logger.info(`Goal deleted: ${goalId}`)

  return { completionRate, tasksDeleted: deletedTasks.deletedCount }
}

const getWeeklyStats = async (userId) => {
  const now        = new Date()
  const dayOfWeek  = now.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart  = new Date(now)
  weekStart.setDate(now.getDate() - daysToMonday)
  weekStart.setHours(0, 0, 0, 0)

  const totalThisWeek = await Task.countDocuments({
    userId,
    createdAt:  { $gte: weekStart },
    frequency:  { $in: ['once', 'near_deadline'] }
  })

  const completedThisWeek = await Task.countDocuments({
    userId,
    completedAt: { $gte: weekStart },
    status:      'completed'
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