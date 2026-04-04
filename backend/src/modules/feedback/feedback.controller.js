const feedbackService = require('./feedback.service')

const submitFeedback = async (req, res, next) => {
  try {
    const { taskId, outcome, feedback, actualDurationMin, fatigueAfter } = req.body
    const redisClient = req.app.get('redis')

    if (!taskId || !outcome) {
      return res.status(400).json({
        success: false,
        message: 'taskId and outcome are required'
      })
    }

    const validOutcomes = ['completed', 'failed', 'skipped']
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: 'outcome must be completed, failed, or skipped'
      })
    }

    const result = await feedbackService.submitFeedback(
      req.userId,
      taskId,
      { outcome, feedback, actualDurationMin, fatigueAfter },
      redisClient
    )

    res.status(200).json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

module.exports = { submitFeedback }