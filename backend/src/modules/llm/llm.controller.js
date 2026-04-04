const llmService = require('./llm.service')
const { extractTextFromFile, prepareForLLM } = require('../../utils/pdfExtractor')
const logger = require('../../utils/logger')

const decompose = async (req, res, next) => {
  try {
    const goalData = req.body
    let material = null

    if (req.file) {
      logger.info(`File uploaded: ${req.file.originalname}`)
      const extracted = await extractTextFromFile(req.file)
      material = prepareForLLM(extracted)
    }

    if (!goalData.title || !goalData.title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Goal title is required'
      })
    }

    const tasks = await llmService.decomposeGoal(goalData, material)

    res.status(200).json({
      success: true,
      message: `Goal decomposed into ${tasks.length} tasks`,
      tasks,
      conversationHistory: [
        {
          role:    'user',
          content: `Goal: ${goalData.title}${goalData.description ? '\n' + goalData.description : ''}`
        },
        {
          role:    'assistant',
          content: JSON.stringify(tasks)
        }
      ]
    })
  } catch (err) {
    next(err)
  }
}

const refine = async (req, res, next) => {
  try {
    const { conversationHistory, newMessage, turnCount } = req.body
    let material = null

    if (turnCount >= 6) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 6 refinement turns reached. Please confirm your tasks.'
      })
    }

    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return res.status(400).json({
        success: false,
        message: 'Conversation history is required'
      })
    }

    if (!newMessage || !newMessage.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      })
    }

    if (req.file) {
      logger.info(`New file uploaded during refinement: ${req.file.originalname}`)
      const extracted = await extractTextFromFile(req.file)
      material = prepareForLLM(extracted)
    }

    const result = await llmService.refineGoal(
      conversationHistory,
      newMessage,
      material
    )

    res.status(200).json({
      success: true,
      message: 'Tasks updated',
      tasks:            result.tasks,
      assistantMessage: result.assistantMessage,
      turnsRemaining:   6 - (turnCount + 1)
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { decompose, refine }