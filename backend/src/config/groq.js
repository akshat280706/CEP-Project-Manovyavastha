const Groq = require('groq-sdk')

// Initialize Groq client with API key from environment
const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

module.exports = groqClient