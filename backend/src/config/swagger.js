const swaggerJSDoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Manovyavastha API',
      version: '1.0.0',
      description: 'AI + RL based task scheduling system'
    },
    servers: [
      {
        url: 'http://localhost:5001'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/modules/**/*.js']
}

module.exports = swaggerJSDoc(options)