const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const logger = require('./logger')

const extractTextFromFile = async (file) => {
  try {
    const { mimetype, buffer, originalname } = file
    logger.debug(`Extracting text from: ${originalname} (${mimetype})`)

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer)
      logger.debug(`PDF pages: ${data.numpages}, chars: ${data.text.length}`)
      return cleanText(data.text)
    }

    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer })
      return cleanText(result.value)
    }

    if (mimetype === 'text/plain') {
      return cleanText(buffer.toString('utf-8'))
    }

    if (mimetype.startsWith('image/')) {
      const base64 = buffer.toString('base64')
      return { type: 'image', base64, mimetype }
    }

    return null
  } catch (err) {
    logger.error(`Text extraction failed: ${err.message}`)
    return null
  }
}

const cleanText = (text) => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const extractHeadings = (text) => {
  const lines = text.split('\n')
  const headings = lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) return false
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) return true
    if (trimmed.length < 80) return true
    return false
  })
  return headings.join('\n')
}

const prepareForLLM = (extracted) => {
  if (extracted && extracted.type === 'image') {
    return extracted
  }

  if (!extracted || typeof extracted !== 'string') return null

  const wordCount = extracted.split(/\s+/).length
  logger.debug(`Document word count: ${wordCount}`)

  if (wordCount <= 2000) {
    return { type: 'text', content: extracted }
  }

  logger.debug(`Document too long (${wordCount} words). Extracting headings only.`)
  const headings = extractHeadings(extracted)
  return { type: 'text', content: headings }
}

module.exports = { extractTextFromFile, prepareForLLM }