const Goal = require('../../models/Goal')
const Task = require('../../models/Task')
const logger = require('../../utils/logger')

/**
 * Convert dependency orderIndex to the actual task name
 * RL wants task name string not the orderIndex number
 *
 * Example:
 *   Task "Implement BFS" has depends_on: [1]
 *   Task with orderIndex 1 is "Learn Graph Theory Basics"
 *   So dependency_task_name = "Learn Graph Theory Basics"
 */
const resolveDependencyName = (task, allTasks) => {
  // No dependencies — return null
  if (!task.dependsOn || task.dependsOn.length === 0) return null

  // Get first dependency orderIndex
  // Most tasks have one dependency — take the first one
  const depOrderIndex = task.dependsOn[0]

  // Find the task with that orderIndex in the saved tasks array
  const depTask = allTasks.find(t => t.orderIndex === depOrderIndex)

  // Return its title (task name) or null if not found
  return depTask ? depTask.title : null
}

/**
 * Transform saved MongoDB tasks into the format RL engine expects
 * Then push to Redis queue for Python to pick up instantly
 */
const sendToRL = async (userId, goal, savedTasks, redisClient) => {
  // Calculate total estimated hours across all tasks
  const totalMinutes = savedTasks.reduce(
    (sum, task) => sum + task.baseDurationMin,
    0
  )
  const estimatedTotalHours = Math.round((totalMinutes / 60) * 10) / 10

  // Build the exact payload RL engine expects
  const rlPayload = {
    goal_id: goal._id.toString(),
    user_id: userId.toString(),

    decomposition_metadata: {
      model_used: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      total_tasks: savedTasks.length,
      estimated_total_hours: estimatedTotalHours,
      // Fixed confidence for now
      // Can be made dynamic later based on LLM response quality
      decomposition_confidence: 0.87
    },

    tasks: savedTasks.map(task => ({
      task_name: task.title,
      task_type: task.taskType,
      difficulty: task.difficulty,
      base_duration_min: task.baseDurationMin,

      // Use goal deadline for all tasks
      // Individual task deadlines can be added later
      deadline: goal.deadline
        ? new Date(goal.deadline).toISOString()
        : null,

      // Convert orderIndex dependency to task name string
      dependency_task_name: resolveDependencyName(task, savedTasks),

      topic_name: task.topicName || '',
      priority_hint: task.priority
    }))
  }

  // Push to Redis queue
  // Python is blocking on this queue and wakes up instantly
  await redisClient.lpush(
    'rl_task_queue',
    JSON.stringify(rlPayload)
  )

  logger.info(
    `RL payload sent to queue — goal: ${goal._id}, tasks: ${savedTasks.length}, hours: ${estimatedTotalHours}`
  )
}

/**
 * Save confirmed goal and tasks to MongoDB
 * Then send RL payload to Redis queue
 */
const confirmGoal = async (userId, goalData, tasks, redisClient) => {
  // Step 1 — Save goal document
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

  // Step 2 — Save all tasks linked to this goal
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
    topicName: task.topic_name || '',   // NEW — save topic name
    status: 'pending',
    priorityBoost: 0,
    skipCount: 0
  }))

  const savedTasks = await Task.insertMany(taskDocs)
  logger.info(`${savedTasks.length} tasks saved for goal ${goal._id}`)

  // Step 3 — Send to RL engine via Redis queue
  // Only if redisClient is available
  if (redisClient) {
    await sendToRL(userId, goal, savedTasks, redisClient)
  } else {
    logger.warn('Redis client not available — RL payload not sent')
  }

  return { goal, tasks: savedTasks }
}

/**
 * Get all goals for a user with live task completion counts
 */
const getMyGoals = async (userId) => {
  const goals = await Goal.find({ userId })
    .sort({ createdAt: -1 })
    .lean()

  // For each goal get live task counts from tasks collection
  const goalsWithStats = await Promise.all(
    goals.map(async (goal) => {
      const totalTasks = await Task.countDocuments({ goalId: goal._id })
      const completedTasks = await Task.countDocuments({
        goalId: goal._id,
        status: 'completed'
      })
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

/**
 * Get single goal with all its tasks in order
 */
const getGoalById = async (goalId, userId) => {
  const goal = await Goal.findOne({ _id: goalId, userId }).lean()

  if (!goal) {
    const err = new Error('Goal not found')
    err.statusCode = 404
    throw err
  }

  const tasks = await Task.find({ goalId })
    .sort({ orderIndex: 1 })
    .lean()

  return { ...goal, tasks }
}

/**
 * Delete goal and all its tasks
 * Saves completion rate to goal document before deletion
 * so dashboard can still show historical stats
 */
const deleteGoal = async (goalId, userId) => {
  const goal = await Goal.findOne({ _id: goalId, userId })

  if (!goal) {
    const err = new Error('Goal not found')
    err.statusCode = 404
    throw err
  }

  // Calculate completion rate before deleting tasks
  const totalTasks = await Task.countDocuments({ goalId })
  const completedTasks = await Task.countDocuments({
    goalId,
    status: 'completed'
  })

  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0

  // Save stats to goal before deletion
  await Goal.findByIdAndUpdate(goalId, {
    completionRate,
    totalTasks,
    completedTasks,
    status: 'abandoned'
  })

  // Delete all tasks for this goal
  const deletedTasks = await Task.deleteMany({ goalId })
  logger.info(`Deleted ${deletedTasks.deletedCount} tasks for goal ${goalId}`)

  // Delete the goal itself
  await Goal.findByIdAndDelete(goalId)
  logger.info(`Goal deleted: ${goalId}`)

  return { completionRate, tasksDeleted: deletedTasks.deletedCount }
}

/**
 * Get overall weekly completion rate for dashboard
 */
const getWeeklyStats = async (userId) => {
  // Calculate start of current week (Monday)
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