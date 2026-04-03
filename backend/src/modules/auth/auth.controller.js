const authService = require('./auth.service')

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required'
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      })
    }

    const result = await authService.register(name, email, password)

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token: result.token,
      user: result.user
    })

  } catch (err) {
    next(err)
  }
}

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      })
    }

    const result = await authService.login(email, password)

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: result.token,
      user: result.user
    })

  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/auth/profile
 * Get logged in user's profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.userId)

    res.status(200).json({
      success: true,
      user
    })

  } catch (err) {
    next(err)
  }
}

module.exports = { register, login, getProfile }