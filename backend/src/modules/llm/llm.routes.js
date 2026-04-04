const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth.middleware.js')
const upload = require('../../middleware/upload.middleware.js')
const llmController = require('./llm.controller.js')

router.post(
  '/decompose',
  auth,
  upload.single('material'),
  llmController.decompose
)

router.post(
  '/refine',
  auth,
  upload.single('material'),
  llmController.refine
)

module.exports = router