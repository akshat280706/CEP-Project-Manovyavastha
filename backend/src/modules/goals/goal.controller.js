const goalService = require('./goal.service')
const logger = require('../../utils/logger')

/**
 * POST /api/goals/confirm
 * Save confirmed goal and tasks to MongoDB
 * Then sends RL payload to Redis queue
 */
const confirmGoal = async (req, res, next) => {
  try {
    const { goalData, tasks } = req.body
    const userId = req.userId

    // Get Redis client from Express app
    // This was set in server.js with app.set('redis', redisClient)
    const redisClient = req.app.get('redis')

    // Validate goal data
    if (!goalData || !goalData.title) {
      return res.status(400).json({
        success: false,
        message: 'Goal data with title is required'
      })
    }

    // Validate tasks
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one task is required'
      })
    }

    // Save to MongoDB and send to RL
    const result = await goalService.confirmGoal(
      userId,
      goalData,
      tasks,
      redisClient  // pass redis client so service can push to queue
    )

    res.status(201).json({
      success: true,
      message: `Goal saved with ${result.tasks.length} tasks. RL scheduling queued.`,
      goal: result.goal,
      tasks: result.tasks
    })

  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/goals/my
 * Get all goals for logged in user
 */
const getMyGoals = async (req, res, next) => {
  try {
    const goals = await goalService.getMyGoals(req.userId)

    res.status(200).json({
      success: true,
      count: goals.length,
      goals
    })

  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/goals/stats/weekly
 * Get weekly completion stats for dashboard
 * Must be BEFORE /:goalId route to avoid Express matching "stats" as goalId
 */
const getWeeklyStats = async (req, res, next) => {
  try {
    const stats = await goalService.getWeeklyStats(req.userId)

    res.status(200).json({
      success: true,
      stats
    })

  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/goals/:goalId
 * Get single goal with its tasks
 */
const getGoalById = async (req, res, next) => {
  try {
    const goal = await goalService.getGoalById(
      req.params.goalId,
      req.userId
    )

    res.status(200).json({
      success: true,
      goal
    })

  } catch (err) {
    next(err)
  }
}

/**
 * DELETE /api/goals/:goalId
 * Delete goal and all its tasks
 * Saves completion rate before deletion
 */
const deleteGoal = async (req, res, next) => {
  try {
    const result = await goalService.deleteGoal(
      req.params.goalId,
      req.userId
    )

    res.status(200).json({
      success: true,
      message: 'Goal deleted successfully',
      completionRate: result.completionRate,
      tasksDeleted: result.tasksDeleted
    })

  } catch (err) {
    next(err)
  }
}

module.exports = {
  confirmGoal,
  getMyGoals,
  getWeeklyStats,
  getGoalById,
  deleteGoal
}