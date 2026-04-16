const goalService = require('./goal.service.js')
const logger = require('../../utils/logger.js')

const confirmGoal = async (req, res, next) => {
  try {
    const { goalData, tasks } = req.body
    const userId = req.userId
    const redisClient = req.app.get('redis')

    if (!goalData || !goalData.title) {
      return res.status(400).json({
        success: false,
        message: 'Goal data with title is required'
      })
    }

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one task is required'
      })
    }

    const result = await goalService.confirmGoal(userId, goalData, tasks, redisClient)

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

const getMyGoals = async (req, res, next) => {
  try {
    const goals = await goalService.getMyGoals(req.userId)
    res.status(200).json({ success: true, count: goals.length, goals })
  } catch (err) {
    next(err)
  }
}

const getWeeklyStats = async (req, res, next) => {
  try {
    const stats = await goalService.getWeeklyStats(req.userId)
    res.status(200).json({ success: true, stats })
  } catch (err) {
    next(err)
  }
}

const getGoalById = async (req, res, next) => {
  try {
    const goal = await goalService.getGoalById(req.params.goalId, req.userId)
    res.status(200).json({ success: true, goal })
  } catch (err) {
    next(err)
  }
}

const deleteGoal = async (req, res, next) => {
  try {
    const redisClient = req.app.get('redis')
    const result = await goalService.deleteGoal(req.params.goalId, req.userId, redisClient)
    res.status(200).json({
      success: true,
      message: result.message,
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