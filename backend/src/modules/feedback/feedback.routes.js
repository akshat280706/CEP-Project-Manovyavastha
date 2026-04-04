const express  = require('express')
const router   = express.Router()
const auth     = require('../../middleware/auth.middleware')
const feedbackController = require('./feedback.controller')

router.post('/submit', auth, feedbackController.submitFeedback)

module.exports = router