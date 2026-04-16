require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')

// ✅ CORRECT PATHS
const connectDB = require('./src/config/db')
const redisClient = require('./src/config/redis')
const logger = require('./src/utils/logger')

// Swagger
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./src/config/swagger')

const app = express()

// ─────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────
connectDB()

// ─────────────────────────────────────────────
// GLOBAL MIDDLEWARE
// ─────────────────────────────────────────────
app.use(helmet())
app.use(cors())
app.use(morgan('dev'))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Make Redis available globally
app.set('redis', redisClient)

// ─────────────────────────────────────────────
// LOAD ROUTES
// ─────────────────────────────────────────────
const modules = [
{ name: 'auth', file: 'auth' },
{ name: 'llm', file: 'llm' },
{ name: 'goals', file: 'goal' },
{ name: 'schedule', file: 'schedule' },
{ name: 'feedback', file: 'feedback' }
]

modules.forEach(mod => {
try {
const router = require(`./src/modules/${mod.name}/${mod.file}.routes`)
app.use(`/api/${mod.name}`, router)
logger.info(`Loaded module: ${mod.name}`)
} catch (err) {
logger.warn(`Failed to load module: ${mod.name}`)
console.error(err.message)
}
})

// ─────────────────────────────────────────────
// SWAGGER (IMPORTANT: BEFORE 404)
// ─────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
res.json({
message: 'MANOVYAVASTHA server running',
status: 'healthy',
timestamp: new Date().toISOString()
})
})

// ─────────────────────────────────────────────
// 404 HANDLER
// ─────────────────────────────────────────────
app.use((req, res) => {
res.status(404).json({
message: `Route ${req.originalUrl} not found`
})
})

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────
app.use(require('./src/middleware/error.middleware'))

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
logger.info(`Server running on port ${PORT}`)
})
