const Redis = require('ioredis')
const logger = require('../utils/logger.js')
// const logger = require('../utils/logger')

const redisClient = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  }
})

redisClient.on('connect', () => logger.info('Redis connected'))
redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`))
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'))

module.exports = redisClient