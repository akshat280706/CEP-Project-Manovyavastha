const scheduleService = require('./schedule.service')

const getTodaySchedule = async (req, res, next) => {
  try {
    const schedule = await scheduleService.getTodaySchedule(req.userId)
    res.status(200).json({ success: true, schedule })
  } catch (err) {
    next(err)
  }
}

const regenerateSchedule = async (req, res, next) => {
  try {
    const redisClient = req.app.get('redis')
    const result = await scheduleService.regenerateSchedule(req.userId, redisClient)
    res.status(200).json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

const completeTask = async (req, res, next) => {
  try {
    const { actualDurationMin } = req.body
    const result = await scheduleService.completeTask(
      req.params.taskId,
      req.userId,
      actualDurationMin
    )
    res.status(200).json({
      success:        true,
      message:        'Task completed',
      task:           result.task,
      needsFeedback:  result.needsFeedback
    })
  } catch (err) {
    next(err)
  }
}

const missTask = async (req, res, next) => {
  try {
    const result = await scheduleService.missTask(req.params.taskId, req.userId)
    res.status(200).json({
      success:        true,
      message:        result.addedToBuffer ? 'Task missed and added to buffer' : 'Task marked as missed',
      task:           result.task,
      addedToBuffer:  result.addedToBuffer
    })
  } catch (err) {
    next(err)
  }
}

const skipTask = async (req, res, next) => {
  try {
    const result = await scheduleService.skipTask(req.params.taskId, req.userId)
    res.status(200).json({
      success: true,
      message: 'Task skipped. Dependent tasks blocked.',
      task:    result.task
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  getTodaySchedule,
  regenerateSchedule,
  completeTask,
  missTask,
  skipTask
}