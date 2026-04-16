const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth.middleware.js')
const scheduleController = require('./schedule.controller.js')

/**
 * @swagger
 * /api/schedule/today:
 *   get:
 *     summary: Get today's schedule
 *     tags: [Schedule]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's schedule
 */
router.get('/today', auth, scheduleController.getTodaySchedule)
router.get('/status', auth, scheduleController.getTaskStatus)

/**
 * @swagger
 * /api/schedule/regenerate:
 *   post:
 *     summary: Regenerate schedule using RL
 *     tags: [Schedule]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Schedule regeneration triggered
 */
router.post('/regenerate', auth, scheduleController.regenerateSchedule)

/**
 * @swagger
 * /api/schedule/complete/{taskId}:
 *   post:
 *     summary: Mark task as completed
 *     tags: [Schedule]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actualDurationMin:
 *                 type: number
 *                 example: 45
 *     responses:
 *       200:
 *         description: Task completed
 */
router.post('/complete/:taskId', auth, scheduleController.completeTask)
router.post('/miss/:taskId', auth, scheduleController.missTask)
router.post('/skip/:taskId', auth, scheduleController.skipTask)

module.exports = router