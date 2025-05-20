require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initServer } = require('./server-init');
const nodemailer = require('nodemailer');
const {setupFileRoutes} = require('./fileRoutes');
const jwt = require('jsonwebtoken');
const { createUser, authenticateUser, getUserByUsername, recordFailedLoginAttempt } = require('./users');
const { generateToken, authMiddleware, socketAuthMiddleware, generateOTP, verifyOTP, storeOTP, otpStore } = require('./auth');

// Import role-based middleware
const { roleBasedAuthMiddleware } = require('./auth');
const { ROLES } = require('./roles');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Create the HTTP server first
const server = http.createServer(app);

// Then create the Socket.IO instance
const io = socketIO(server, {
  maxHttpBufferSize: 1e6, // 1MB
  pingTimeout: 60000,     // 60 seconds
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Now you can apply socket middleware
io.use(socketAuthMiddleware);

// Make the io instance available to routes for notifications
app.io = io;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Set up the file routes
setupFileRoutes(app, upload);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting middleware
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again after 15 minutes' },
  keyGenerator: (req) => {
    // Use both IP and username for more precise limiting
    return `${req.ip}-${req.body.username || 'anonymous'}`;
  }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP verification attempts, please try again after 15 minutes' },
  keyGenerator: (req) => {
    return `${req.ip}-${req.body.username || 'anonymous'}`;
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1, // 1 registration attempts per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts, please try again after an hour' }
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com', // Replace with your email
    pass: process.env.EMAIL_PASS || 'your-app-password' // Replace with your app password
  }
});

// Authentication routes
app.post('/api/register', registerLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  // Password strength validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character'
    });
  }

  try {
    const result = await createUser(username, email, password);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  try {
    const result = await authenticateUser(username, password);
    if (!result.success) {
      // Delay response to prevent timing attacks
      setTimeout(() => {
        res.status(401).json({ message: result.message });
      }, 500 + Math.random() * 500); // Random delay between 500-1000ms
      return;
    }
    // Get user info (for email and role)
    const userInfo = await getUserByUsername(username);
    if (!userInfo) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Generate OTP
    const otp = generateOTP();
    storeOTP(username, otp);
    console.log(`OTP for ${username}: ${otp}`); // For testing - remove in production!
    
    // Store user role in session or OTP store for token generation after OTP verification
    // This allows us to include the role in the JWT token later
    otpStore[username].role = userInfo.role || ROLES.USER; // Default to user role if not set
    
    // TEMPORARY SOLUTION: Skip email sending and return OTP in response
    // Remove this section and uncomment email code below once email is configured
    return res.json({
      message: 'OTP sent to your email (check console for OTP)',
      username,
      // Consider removing this in production to avoid security risks
      testOtp: otp // Only include this during development
    });
    
    /*
    // Send OTP via email (if email exists)
    if (userInfo.email) {
      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: userInfo.email,
        subject: 'Your OTP for iChat Login',
        text: `Your OTP is: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d2d2d;">iChat Login Verification</h2>
            <p>Your one-time password (OTP) for login is:</p>
            <div style="background-color: #f6f6f6; padding: 15px; border-radius: 5px; text-align: center;">
              <h1 style="font-size: 32px; margin: 0; color: #2d2d2d;">${otp}</h1>
            </div>
            <p style="color: #7e7e7e; margin-top: 20px;">This OTP will expire in 5 minutes.</p>
            <p style="color: #7e7e7e;">If you did not request this OTP, please ignore this email.</p>
          </div>
        `
      };
      try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP email sent to ${userInfo.email}`);
      } catch (emailError) {
        console.error('Email error:', emailError);
        return res.status(500).json({ message: 'Failed to send OTP email' });
      }
    }
    res.json({ message: 'OTP sent to your email', username });
    */
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Add this endpoint to verify OTP and generate JWT with role
app.post('/api/verify-otp', async (req, res) => {
  const { username, otp } = req.body;
  
  if (!username || !otp) {
    return res.status(400).json({ message: 'Username and OTP are required' });
  }
  
  try {
    const isValid = verifyOTP(username, otp);
    
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }
    
    // Get user info with role
    const userInfo = await getUserByUsername(username);
    if (!userInfo) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Use the role stored in otpStore (or from userInfo)
    const role = otpStore[username]?.role || userInfo.role || ROLES.USER;
    
    // Use the imported generateToken function instead of directly using jwt.sign
    const token = generateToken({ 
      username: userInfo.username,
      role: role
    });
    
    // Set token in cookie
    res.cookie('token', token, { 
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    res.json({ 
      message: 'Authentication successful',
      token,
      user: {
        username: userInfo.username,
        role: role
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Server error during OTP verification' });
  }
});

// Protected route example
app.get('/api/profile', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Root route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Increase max listeners to avoid warnings
io.setMaxListeners(20);

// Initialize global variables for tracking
const connectedUsers = new Map(); // Map socket.id to user data
const rooms = new Map(); // Map room names to room data
const usernames = new Set(); // Track taken usernames
const userSocketMap = new Map(); // Map username to socket.id
const groups = new Map(); // Map group names to group data
let socketsConnected = new Set(); // Track connected socket IDs

// Initialize default room
rooms.set('general', { 
  name: 'general', 
  users: new Set(),
  messages: []
});

// Main socket connection handler
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id, 'User:', socket.user?.username);
  
  // Add socket to connected Set
  socketsConnected.add(socket.id);
  
  // Add user to general room
  socket.join('general');
  
  // Initialize user data
  connectedUsers.set(socket.id, {
    id: socket.id,
    name: socket.user?.username || 'anonymous',
    status: 'online',
    lastSeen: new Date(),
    currentRoom: 'general',
    authenticated: !!socket.user
  });
  
  // Add to room users
  if (rooms.has('general')) {
    rooms.get('general').users.add(socket.id);
  }
  
  // Add username to tracking if authenticated
  if (socket.user?.username) {
    connectedUsers.get(socket.id).originalName = socket.user.username;
    
    // Add to username tracking
    usernames.add(socket.user.username);
    
    // Add to user socket map
    if (!userSocketMap.has(socket.user.username)) {
      userSocketMap.set(socket.user.username, new Set());
    }
    userSocketMap.get(socket.user.username).add(socket.id);
  }
  
  // Emit total connected clients
  io.emit('clients-total', socketsConnected.size);
  
  // Update all clients with user list
  updateUserList();
  
  // Notify room of user joining
  if (socket.user?.username) {
    socket.to('general').emit('system-message', {
      message: `${socket.user.username} has joined the chat!`,
      type: 'join'
    });
  }
  
  // Send room changed event to the user
  socket.emit('room-changed', { room: 'general' });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Socket disconnected', socket.id);
    
    // Remove socket from connected Set
    socketsConnected.delete(socket.id);
    
    // Get user data before cleanup
    const userData = connectedUsers.get(socket.id);
    
    // Notify room of user leaving
    if (userData && userData.name && userData.currentRoom) {
      socket.to(userData.currentRoom).emit('system-message', {
        message: `${userData.name} has left the chat`,
        type: 'leave'
      });
      
      // Remove from room
      if (rooms.has(userData.currentRoom)) {
        rooms.get(userData.currentRoom).users.delete(socket.id);
      }
      
      // Remove from tracking
      if (userData.authenticated) {
        // Remove from socket map first
        if (userSocketMap.has(userData.name)) {
          userSocketMap.get(userData.name).delete(socket.id);
          
          // Only remove from usernames if no more sockets for this user
          if (userSocketMap.get(userData.name).size === 0) {
            usernames.delete(userData.name);
            userSocketMap.delete(userData.name);
          }
        }
      }
      
      // Remove from connected users
      connectedUsers.delete(socket.id);
    }
    
    // Update total count
    io.emit('clients-total', socketsConnected.size);
    
    // Update user list
    updateUserList();
  });
  
  // Message event
  socket.on('message', (data) => {
    if (!socket.user) return;

    // Add authenticated username to message
    data.name = socket.user.username;

    // Validate that the user is actually in the room they're sending to
    const userData = connectedUsers.get(socket.id);
    if (!userData) return;

    // If sending to a room, verify user is in that room
    if (data.room && !userData.currentRoom === data.room) {
      socket.emit('error-message', 'You cannot send messages to a room you are not in');
      return;
    }

    // Check if it's a file share message
    if (data.fileInfo) {
      // Enhance the message with file metadata
      data.isFileMessage = true;
    }

    // Store in room history if available
    if (rooms.has(data.room)) {
      const roomData = rooms.get(data.room);
      roomData.messages.push(data);

      // Keep only last 50 messages
      if (roomData.messages.length > 50) {
        roomData.messages.shift();
      }
    }

    // Broadcast to room
    socket.to(data.room || 'general').emit('chat-message', data);
  });

  // Feedback (typing)
  socket.on('feedback', (data) => {
    const userData = connectedUsers.get(socket.id);
    if (!userData) return;
  
    // Add chat type context to the feedback data
    if (!data.chatType) {
      data.chatType = 'room'; // Default to room
    }
  
    if (data.chatType === 'room') {
      // Only send typing indicator to the user's current room
      socket.to(userData.currentRoom).emit('feedback', {
        feedback: data.feedback ? `✍️ ${userData.name} is typing a message` : '',
        chatType: 'room',
        source: userData.currentRoom
      });
    } else if (data.chatType === 'group' && data.source) {
      // For group chats, only send to members of that specific group
      const group = groups.get(data.source);
      if (group && group.members.has(userData.name)) {
        for (const member of group.members) {
          if (member !== userData.name) {
            const memberSockets = userSocketMap.get(member);
            if (memberSockets && memberSockets.size > 0) {
              memberSockets.forEach(socketId => {
                io.to(socketId).emit('feedback', {
                  feedback: data.feedback ? `✍️ ${userData.name} is typing a message` : '',
                  chatType: 'group',
                  source: data.source
                });
              });
            }
          }
        }
      }
    } else if (data.chatType === 'private' && data.source) {
      // For private chats, only send to the specific recipient
      const recipientSockets = userSocketMap.get(data.source);
      if (recipientSockets && recipientSockets.size > 0) {
        recipientSockets.forEach(socketId => {
          io.to(socketId).emit('feedback', {
            feedback: data.feedback ? `✍️ ${userData.name} is typing a message` : '',
            chatType: 'private',
            source: userData.name
          });
        });
      }
    }
  });
  
  // Join room
  socket.on('join-room', (roomName) => {
    // Get user data
    const userData = connectedUsers.get(socket.id);
    if (!userData) return;
    
    // Validate room name
    roomName = roomName.trim().toLowerCase();
    if (!roomName || roomName.length < 2 || roomName.length > 20) {
      socket.emit('error-message', 'Room name must be between 2 and 20 characters');
      return;
    }
    
    // Leave current room
    if (userData.currentRoom) {
      socket.leave(userData.currentRoom);
      if (rooms.has(userData.currentRoom)) {
        rooms.get(userData.currentRoom).users.delete(socket.id);
      }
    }
    
    // Create room if it doesn't exist
    if (!rooms.has(roomName)) {
      rooms.set(roomName, { 
        name: roomName, 
        users: new Set([socket.id]),
        messages: []
      });
    } else {
      rooms.get(roomName).users.add(socket.id);
    }
    
    // Join new room
    socket.join(roomName);
    userData.currentRoom = roomName;
    
    // Notify room change
    socket.emit('room-changed', { room: roomName });
    
    // Announce to room members
    socket.to(roomName).emit('system-message', {
      message: `${userData.name} has joined ${roomName}`,
      type: 'join'
    });
    
    // Update user list
    updateUserList();
  });
  
  // Heartbeat
  socket.on('heartbeat', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      userData.lastSeen = new Date();
      userData.status = 'online';
    }
  });
  
  // User update (status, etc.)
  socket.on('user-update', (data) => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      // Update status if provided
      if (data.status) {
        userData.status = data.status;
        userData.lastSeen = new Date();
      }
      
      // Update user list
      updateUserList();
    }
  });

  // Set up user inactivity detection
  const INACTIVITY_THRESHOLD = 600000; // 10 minutes in milliseconds

  // Check for inactive users every minute
  setInterval(() => {
    const now = new Date();
    
    // Loop through all connected users
    for (const [socketId, userData] of connectedUsers.entries()) {
      if (!userData || !userData.authenticated) continue;
      
      // Calculate time since last activity
      const lastActive = userData.lastSeen || now;
      const timeSinceActive = now.getTime() - lastActive.getTime();
      
      // If manual status was set, check if it's expired (30 minutes)
      if (userData.manualStatusChange && userData.manualStatusTime) {
        const manualStatusAge = now.getTime() - userData.manualStatusTime.getTime();
        
        // Reset manual status after 30 minutes (1800000 ms)
        if (manualStatusAge > 1800000) {
          userData.manualStatusChange = false;
          
          // If they're inactive, set to away
          if (timeSinceActive > INACTIVITY_THRESHOLD) {
            userData.status = 'away';
            updateUserList();
          }
        }
      } else {
        // Check if they've been inactive too long and still show as online
        if (timeSinceActive > INACTIVITY_THRESHOLD && userData.status === 'online') {
          // Update status to idle
          userData.status = 'idle';
          updateUserList();
        }
      }
    }
  }, 60000); // Check every minute

  // Command processing
  socket.on('command', (commandText) => {
    const userData = connectedUsers.get(socket.id);
    if (!userData || !userData.authenticated) {
      socket.emit('error-message', 'You must be authenticated to use commands');
      return;
    }
    
    processCommand(socket, commandText, userData);
  });
});

// Command processing function
function processCommand(socket, text, userData) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();
  
  switch (command) {
    case '@quit':
      // Notify user
      socket.emit('system-message', {
        message: 'Disconnecting from server...',
        type: 'info'
      });
      
      // Notify others
      socket.to(userData.currentRoom).emit('system-message', {
        message: `${userData.name} has left the chat`,
        type: 'leave'
      });
      
      // Clean up
      if (userData.authenticated) {
        usernames.delete(userData.name);
        userSocketMap.delete(userData.name);
      }
      
      // Disconnect
      socket.disconnect(true);
      break;
      
    case '@names':
      // List connected users
      const userList = Array.from(usernames).sort();
      socket.emit('system-message', {
        message: `Connected users (${userList.length}): ${userList.join(', ')}`,
        type: 'info'
      });
      break;
      
    case '@group':
      if (parts.length < 3) {
        socket.emit('error-message', 'Invalid group command format');
        return;
      }
      
      const groupAction = parts[1].toLowerCase();
      const groupName = parts[2].toLowerCase();
      
      if (!groupName || groupName.length < 2 || groupName.length > 20) {
        socket.emit('error-message', 'Group name must be between 2 and 20 characters');
        return;
      }
      
      switch (groupAction) {
        case 'set':
          // @group set groupName member1, member2, member3
          if (parts.length < 4) {
            socket.emit('error-message', 'Please specify at least one group member');
            return;
          }
          
          // Extract members - handle commas correctly
          const membersText = parts.slice(3).join(' ');
          const membersList = membersText.split(',').map(m => m.trim()).filter(m => m);
          
          // Validate members exist
          const validMembers = new Set();
          const invalidMembers = [];
          
          // Always add the creator
          validMembers.add(userData.name);
          
          // Check each member
          membersList.forEach(member => {
            if (usernames.has(member)) {
              validMembers.add(member);
            } else {
              invalidMembers.push(member);
            }
          });
          
          // Check if group already exists
          if (groups.has(groupName)) {
            socket.emit('error-message', `Group "${groupName}" already exists`);
            return;
          }
          
          // Create the group
          groups.set(groupName, {
            name: groupName,
            owner: userData.name,
            members: validMembers,
            created: new Date()
          });
          
          // Notify creator
          socket.emit('system-message', {
            message: `Group "${groupName}" created with members: ${Array.from(validMembers).join(', ')}`,
            type: 'group'
          });
          
          // Notify about invalid members if any
          if (invalidMembers.length > 0) {
            socket.emit('system-message', {
              message: `Could not add these users (not found): ${invalidMembers.join(', ')}`,
              type: 'warning'
            });
          }
          
          // Notify members
          for (const member of validMembers) {
            if (member !== userData.name) {
              const memberSockets = userSocketMap.get(member);
              if (memberSockets && memberSockets.size > 0) {
                memberSockets.forEach(socketId => {
                  io.to(socketId).emit('system-message', {
                    message: `You've been added to group "${groupName}" by ${userData.name}`,
                    type: 'group'
                  });
                });
              }
            }
          }
          
          // Update user list to include new group
          updateUserList();
          break;
          
        case 'send':
          // @group send groupName message
          if (!groups.has(groupName)) {
            socket.emit('error-message', `Group "${groupName}" does not exist`);
            return;
          }

          const group = groups.get(groupName);
          
          // Check if user is a member
          if (!group.members.has(userData.name)) {
            socket.emit('error-message', `You are not a member of group "${groupName}"`);
            return;
          }

          // Extract message
          if (parts.length < 4) {
            socket.emit('error-message', 'Please provide a message to send');
            return;
          }

          const groupMessage = parts.slice(3).join(' ');

          // Format message data
          const groupMessageData = {
            name: userData.name,
            message: groupMessage,
            dateTime: new Date(),
            group: groupName,
            isGroupMessage: true  // Make sure this flag is explicitly set
          };

          // Send to all group members including sender
          for (const member of group.members) {
            const memberSockets = userSocketMap.get(member);
            if (memberSockets && memberSockets.size > 0) {
              memberSockets.forEach(socketId => {
                io.to(socketId).emit('group-message', groupMessageData);
              });
            }
          }
          break;
          
        case 'leave':
          if (!groups.has(groupName)) {
            socket.emit('error-message', `Group "${groupName}" does not exist`);
            return;
          }
          
          const leaveGroup = groups.get(groupName);
          
          // Check if user is a member
          if (!leaveGroup.members.has(userData.name)) {
            socket.emit('error-message', `You are not a member of group "${groupName}"`);
            return;
          }
          
          // Remove user from group
          leaveGroup.members.delete(userData.name);
          
          // Notify user
          socket.emit('system-message', {
            message: `You have left group "${groupName}"`,
            type: 'group'
          });
          
          // Notify other members
          for (const member of leaveGroup.members) {
            const memberSockets = userSocketMap.get(member);
            if (memberSockets && memberSockets.size > 0) {
              memberSockets.forEach(socketId => {
                io.to(socketId).emit('system-message', {
                  message: `${userData.name} has left group "${groupName}"`,
                  type: 'group'
                });
              });
            }
          }
          
          // If group is empty and user is owner, delete it
          if (leaveGroup.members.size === 0 || (leaveGroup.owner === userData.name)) {
            groups.delete(groupName);
            
            // Additional notification if deleting as owner
            if (leaveGroup.owner === userData.name && leaveGroup.members.size > 0) {
              for (const member of leaveGroup.members) {
                const memberSocketId = userSocketMap.get(member);
                if (memberSocketId) {
                  io.to(memberSocketId).emit('system-message', {
                    message: `Group "${groupName}" has been deleted by the owner`,
                    type: 'group'
                  });
                }
              }
            }
          }
          
          // Update user list
          updateUserList();
          break;
          
        case 'delete':
          if (!groups.has(groupName)) {
            socket.emit('error-message', `Group "${groupName}" does not exist`);
            return;
          }
          
          const deleteGroup = groups.get(groupName);
          
          // Check if user is the owner
          if (deleteGroup.owner !== userData.name) {
            socket.emit('error-message', `You are not the owner of group "${groupName}"`);
            return;
          }
          
          // Notify members about deletion
          for (const member of deleteGroup.members) {
            if (member !== userData.name) {
              const memberSockets = userSocketMap.get(member);
              if (memberSockets && memberSockets.size > 0) {
                memberSockets.forEach(socketId => {
                  io.to(socketId).emit('system-message', {
                    message: `Group "${groupName}" has been deleted by ${userData.name}`,
                    type: 'group'
                  });
                });
              }
            }
          }
          
          // Delete the group
          groups.delete(groupName);
          
          // Notify owner
          socket.emit('system-message', {
            message: `Group "${groupName}" has been deleted`,
            type: 'group'
          });
          
          // Update user list
          updateUserList();
          break;
          
        default:
          socket.emit('error-message', `Unknown group command: ${groupAction}`);
      }
      break;
    
    // Handle private message (@username message)
    default:
      if (command.startsWith('@') && command.length > 1) {
        const targetRawUsername= command.substring(1);
        const targetUsername = targetRawUsername;
        
        // Check if target exists
        const usernameExists = Array.from(usernames).some(name => 
          name.toLowerCase() === targetUsername.toLowerCase()
        );
        if (!usernameExists) {
          socket.emit('error-message', `User "${targetUsername}" is not online`);
          return;
        }
        
        // Check if messaging self
        if (targetUsername === userData.name) {
          socket.emit('error-message', 'You cannot send private messages to yourself');
          return;
        }
        
        // Get target sockets
        const actualUsername = Array.from(usernames).find(name => 
          name.toLowerCase() === targetUsername.toLowerCase()
        );
        const targetSockets = userSocketMap.get(actualUsername);
        
        // Extract message
        const privateMessage = parts.slice(1).join(' ');
        if (!privateMessage.trim()) {
          socket.emit('error-message', 'Please provide a message to send');
          return;
        }
        
        // Format message data
        const privateMessageData = {
          name: userData.name,
          message: privateMessage,
          dateTime: new Date(),
          isPrivate: true,
          to: targetUsername
        };
        
        // Send to all recipient's sockets
        targetSockets.forEach(socketId => {
          io.to(socketId).emit('private-message', {
            ...privateMessageData,
            from: userData.name
          });
        });
        
        // Send confirmation to sender
        socket.emit('private-message', privateMessageData);
      } else {
        socket.emit('error-message', `Unknown command: ${command}`);
      }
  }
}

// Function to update user list for all clients
function updateUserList() {
  const userList = Array.from(connectedUsers.values()).map(user => ({
    id: user.id,
    name: user.name,
    status: user.status,
    lastSeen: user.lastSeen,
    currentRoom: user.currentRoom,
    authenticated: user.authenticated
  }));
  
  const roomList = Array.from(rooms.entries()).map(([name, room]) => ({
    name,
    userCount: room.users.size
  }));
  
  const groupList = Array.from(groups.entries()).map(([name, group]) => ({
    name,
    owner: group.owner,
    memberCount: group.members.size,
    members: Array.from(group.members)
  }));
  
  // Send to all clients
  io.emit('user-list-update', { 
    users: userList, 
    rooms: roomList,
    groups: groupList
  });
  
  // Send room-specific user counts
  for (const [roomName, roomData] of rooms.entries()) {
    io.to(roomName).emit('room-users-count', { 
      room: roomName, 
      count: roomData.users.size 
    });
  }
}

// Fallback route for any other routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize the server (creates admin user, etc.)
initServer().then(() => {
  // Start the server after initialization
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`💬 Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize server:', err);
});