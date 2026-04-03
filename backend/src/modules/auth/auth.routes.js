const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth.middleware')
const authController = require('./auth.controller')

// POST /api/auth/register — public
router.post('/register', authController.register)

// POST /api/auth/login — public
router.post('/login', authController.login)

// GET /api/auth/profile — protected
router.get('/profile', auth, authController.getProfile)

console.log(authController);
module.exports = router
