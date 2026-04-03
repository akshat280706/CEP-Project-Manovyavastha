const jwt = require('jsonwebtoken')
const User = require('../../models/User')
const logger = require('../../utils/logger')

//  * Register a new user
const register = async (name, email, password) => {
  // Check if email already exists
  const existing = await User.findOne({ email })
  if (existing) {
    const err = new Error('Email already registered')
    err.statusCode = 400
    throw err
  }

  // Create user — password hashed automatically by pre-save hook
  const user = new User({ name, email, password })
  await user.save()

  logger.info(`New user registered: ${email}`)

  // Generate token
  const token = generateToken(user)

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    }
  }
}

/**
 * Login existing user
 */
const login = async (email, password) => {
  // Find user — explicitly include password (select: false by default)
  const user = await User.findOne({ email }).select('+password')

  if (!user) {
    const err = new Error('Invalid email or password')
    err.statusCode = 401
    throw err
  }

  // Compare password with hash
  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    const err = new Error('Invalid email or password')
    err.statusCode = 401
    throw err
  }

  logger.info(`User logged in: ${email}`)

  const token = generateToken(user)

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email
    }
  }
}


//  * Get user profile

const getProfile = async (userId) => {
  const user = await User.findById(userId).lean()

  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  }
}

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  )
}

module.exports = { register, login, getProfile }