const jwt = require('jsonwebtoken');
const otpGenerator = require('otp-generator');
const { ROLES, ROLE_HIERARCHY } = require('./roles');

// OTP store with expiration times
const otpStore = {};

// Secret key for JWT signing
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Generate JWT token with role
const generateToken = (user) => {
  return jwt.sign({ 
    username: user.username,
    role: user.role || ROLES.USER // Default to USER role if none specified
  }, JWT_SECRET, { expiresIn: '24h' });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Generate OTP
const generateOTP = () => {
  const otp = otpGenerator.generate(6, { upperCase: false, specialChars: false, alphabets: false });
  return otp;
};

// Store OTP with timestamp and role
const storeOTP = (username, otp, role) => {
  otpStore[username] = {
    otp: otp,
    timestamp: Date.now(),
    role: role // Store role with OTP for token generation later
  };
};

// Verify OTP with expiration handling
const verifyOTP = (username, otp) => {
  const otpData = otpStore[username];
  if (!otpData) {
    console.log(`No OTP found for username: ${username}`);
    return false;
  }
  
  const currentTime = Date.now();
  // Check if OTP is expired (5 minutes = 300000 ms)
  if (currentTime - otpData.timestamp > 300000) {
    console.log(`OTP expired for ${username}`);
    delete otpStore[username]; // Remove expired OTP
    return false;
  }
  
  if (otpData.otp === otp) {
    console.log(`OTP verified successfully for ${username}`);
    // Don't delete OTP yet, as we need the role for token generation
    // It will be cleaned up after token generation or by expiration
    return true;
  }
  
  console.log(`Invalid OTP for ${username}`);
  return false;
};

// Role-based authentication middleware
const roleBasedAuthMiddleware = (requiredRole) => {
  return (req, res, next) => {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Authorization required' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    
    // Add user info to request object
    req.user = decoded;
    
    // Check if user has required role
    if (requiredRole) {
      const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
      const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] || 0;
      
      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({ message: 'Insufficient permissions' });
      }
    }
    
    next();
  };
};

// Authentication middleware (no role check)
const authMiddleware = (req, res, next) => {
  return roleBasedAuthMiddleware()(req, res, next);
};

// Socket.io authentication middleware
const socketAuthMiddleware = (socket, next) => {
  const token =
    socket.handshake.auth?.token || // Token from auth object
    socket.handshake.headers?.authorization?.split(' ')[1] || // Token from Authorization header
    socket.request.headers.cookie?.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]; // Token from cookie
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Authentication error: Invalid or expired token'));
  }
  
  // Add user info to socket object
  socket.user = decoded;
  next();
};

// Initialize admin user function - moved to server.js to avoid circular dependencies
const initializeAdminUser = async (createSpecialRoleUser) => {
  try {
    // Create first admin if no admins exist
    await createSpecialRoleUser(
      'System', // performing username
      'admin@yourcompany.com', 
      'Password@01', 
      ROLES.ADMIN
    );
    console.log('Initial admin user created');
  } catch (error) {
    console.error('Error creating initial admin:', error);
  }
};

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  roleBasedAuthMiddleware,
  socketAuthMiddleware,
  generateOTP,
  storeOTP,
  verifyOTP,
  otpStore,
  initializeAdminUser
};