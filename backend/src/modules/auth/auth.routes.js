const express = require('express')
const router  = express.Router()
const auth    = require('../../middleware/auth.middleware.js')
const authController = require('./auth.controller.js')

router.post('/register', authController.register)
router.post('/login',    authController.login)
router.get('/profile',   auth, authController.getProfile)

module.exports = router
