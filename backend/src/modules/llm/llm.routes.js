const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth.middleware.js')
const upload = require('../../middleware/upload.middleware.js')
const llmController = require('./llm.controller.js')

/**
 * @swagger
 * /api/llm/decompose:
 *   post:
 *     summary: Decompose goal into tasks using AI
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               material:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Tasks generated
 */
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