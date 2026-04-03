const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization

    // Check header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided'
      })
    }

    // Extract token (remove "Bearer " prefix)
    const token = authHeader.split(' ')[1]

    // Verify token using secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Attach user info to request object
    // Now any route after this middleware knows who the user is
    req.userId = decoded.userId
    req.userEmail = decoded.email

    next()
  } catch (err) {
    next(err)
  }
}

module.exports = authMiddleware
