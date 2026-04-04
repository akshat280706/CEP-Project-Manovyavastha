const express = require('express')
const router  = express.Router()
const auth    = require('../../middleware/auth.middleware')
const authController = require('./auth.controller')

router.post('/register', authController.register)
router.post('/login',    authController.login)
router.get('/profile',   auth, authController.getProfile)

module.exports = router
