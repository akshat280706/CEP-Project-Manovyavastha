const express  = require('express')
const router   = express.Router()
const auth     = require('../../middleware/auth.middleware.js')
const feedbackController = require('./feedback.controller.js')

/**
 * @swagger
 * /api/feedback/submit:
 *   post:
 *     summary: Submit task feedback for RL learning
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, outcome]
 *             properties:
 *               taskId:
 *                 type: string
 *               outcome:
 *                 type: string
 *                 enum: [completed, failed, skipped]
 *               feedback:
 *                 type: array
 *                 items:
 *                   type: string
 *                   example: F1
 *               actualDurationMin:
 *                 type: number
 *                 example: 50
 *               fatigueAfter:
 *                 type: number
 *                 example: 6
 *     responses:
 *       200:
 *         description: Feedback submitted
 */
router.post('/submit', auth, feedbackController.submitFeedback)

module.exports = router