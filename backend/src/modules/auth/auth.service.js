const jwt  = require('jsonwebtoken')
const User = require('../../models/User')
const logger = require('../../utils/logger')

const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

const register = async (name, email, password) => {
  const existing = await User.findOne({ email })
  if (existing) {
    const err = new Error('Email already registered')
    err.statusCode = 400
    throw err
  }

  const user = new User({ name, email, password })
  await user.save()
  logger.info(`New user registered: ${email}`)

  const token = generateToken(user)
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email }
  }
}

const login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password')

  if (!user) {
    const err = new Error('Invalid email or password')
    err.statusCode = 401
    throw err
  }

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
    user: { id: user._id, name: user.name, email: user.email }
  }
}

const getProfile = async (userId) => {
  const user = await User.findById(userId).lean()
  if (!user) {
    const err = new Error('User not found')
    err.statusCode = 404
    throw err
  }
  return { id: user._id, name: user.name, email: user.email, createdAt: user.createdAt }
}

module.exports = { register, login, getProfile }