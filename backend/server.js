require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const connectDB = require('./src/config/db')
const redisClient = require('./src/config/redis')
const logger = require('./src/utils/logger')

const app = express()

// Connect to MongoDB
connectDB()

// Middleware
app.use(helmet())
app.use(cors())
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Make redis available to all routes
app.set('redis', redisClient)

// Auto load all route modules
const modules = ['auth', 'llm', 'goals', 'schedule', 'feedback']
modules.forEach(mod => {
  try {
    const router = require(`./src/modules/${mod}/${mod}.routes`)
    app.use(`/api/${mod}`, router)
    logger.info(`Loaded module: ${mod}`)
  } catch (err) {
    logger.warn(`Module not found: ${mod} — skipping`)
  }
})

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'MANOVYAVASTHA server running',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` })
})

// Error middleware — must be last
app.use(require('./src/middleware/error.middleware'))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})

