const express  = require('express')
const router   = express.Router()
const auth     = require('../../middleware/auth.middleware.js')
const feedbackController = require('./feedback.controller.js')

router.post('/submit', auth, feedbackController.submitFeedback)

module.exports = router