const express  = require('express')
const router   = express.Router()
const auth     = require('../../middleware/auth.middleware')
const scheduleController = require('./schedule.controller')

router.get('/today',                  auth, scheduleController.getTodaySchedule)
router.post('/regenerate',            auth, scheduleController.regenerateSchedule)
router.post('/complete/:taskId',      auth, scheduleController.completeTask)
router.post('/miss/:taskId',          auth, scheduleController.missTask)
router.post('/skip/:taskId',          auth, scheduleController.skipTask)

module.exports = router