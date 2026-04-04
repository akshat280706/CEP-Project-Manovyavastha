const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth.middleware')
const upload = require('../../middleware/upload.middleware')
const llmController = require('./llm.controller')

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