const express = require('express')
const router  = express.Router()
const auth    = require('../../middleware/auth.middleware.js')
const goalController = require('./goal.controller.js')


/**
 * @swagger
 * /api/goals/confirm:
 *   post:
 *     summary: Save goal and tasks
 *     tags: [Goal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goalData:
 *                 type: object
 *                 properties:
 *                   title:
 *                     type: string
 *                     example: Learn DSA
 *                   goalType:
 *                     type: string
 *                     example: learning
 *               tasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                       example: Learn Arrays
 *                     difficulty:
 *                       type: number
 *                       example: 1
 *     responses:
 *       201:
 *         description: Goal saved
 */
router.post('/confirm', auth, goalController.confirmGoal)

/**
 * @swagger
 * /api/goals/my:
 *   get:
 *     summary: Get all user goals
 *     tags: [Goal]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of goals
 */
router.get('/my',             auth, goalController.getMyGoals)
router.get('/stats/weekly',   auth, goalController.getWeeklyStats)
router.get('/:goalId',        auth, goalController.getGoalById)
router.delete('/:goalId',     auth, goalController.deleteGoal)

module.exports = router