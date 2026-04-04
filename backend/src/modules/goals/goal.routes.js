const express = require('express')
const router  = express.Router()
const auth    = require('../../middleware/auth.middleware.js')
const goalController = require('./goal.controller.js')

router.post('/confirm',       auth, goalController.confirmGoal)
router.get('/my',             auth, goalController.getMyGoals)
router.get('/stats/weekly',   auth, goalController.getWeeklyStats)
router.get('/:goalId',        auth, goalController.getGoalById)
router.delete('/:goalId',     auth, goalController.deleteGoal)

module.exports = router