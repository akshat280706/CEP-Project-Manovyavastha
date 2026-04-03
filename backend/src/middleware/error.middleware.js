const logger = require('../utils/logger')

const errorMiddleware = (err, req, res, next) => {
  logger.error(err.message)

  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal server error'

  res.status(statusCode).json({
    success: false,
    message
  })
}

module.exports = errorMiddleware