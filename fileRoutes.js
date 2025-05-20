// fileRoutes.js - File handling routes
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { roleBasedAuthMiddleware } = require('./auth');
const { ROLES } = require('./roles'); // Import ROLES from the dedicated roles file

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File metadata storage
let fileDatabase = {};
const fileDatabasePath = path.join(__dirname, 'fileDatabase.json');

// Load file database if it exists
if (fs.existsSync(fileDatabasePath)) {
  try {
    const fileData = fs.readFileSync(fileDatabasePath, 'utf8');
    fileDatabase = JSON.parse(fileData);
  } catch (error) {
    console.error('Error loading file database:', error);
    fileDatabase = {};
  }
}

// Save file database
function saveFileDatabase() {
  try {
    fs.writeFileSync(fileDatabasePath, JSON.stringify(fileDatabase, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving file database:', error);
  }
}

// Set up file routes
function setupFileRoutes(app, upload) {
  // File upload endpoint
  app.post('/api/upload', roleBasedAuthMiddleware(ROLES.USER), upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Generate a unique filename
      const fileExtension = path.extname(req.file.originalname);
      const randomHash = crypto.randomBytes(8).toString('hex');
      const filename = `${Date.now()}-${randomHash}${fileExtension}`;
      const filePath = path.join(uploadDir, filename);

      // Save the file to disk
      fs.writeFileSync(filePath, req.file.buffer);

      // Get current room
      const room = req.body.room || 'general';

      // Add chat context (type and target)
      const chatType = req.body.chatType || 'room'; // Default to room if not specified
      const chatTarget = req.body.chatTarget || room; // Default to room name if not specified

      // Get privacy setting
      const isPrivate = req.body.private === 'true';

      // Store file metadata
      const fileInfo = {
        filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user.username,
        uploadedAt: new Date(),
        room,
        isPrivate,
        chatContext: {
          type: chatType,
          target: chatTarget
        },
        accessControl: {
          default: isPrivate ? 'private' : 'public',
          users: {
            // Owner always has full access
            [req.user.username]: 'full'
          }
        }
      };

      // Add to database
      fileDatabase[filename] = fileInfo;
      saveFileDatabase();

      // Notify other users in the room about new file
      if (app.io) {
        app.io.to(room).emit('file-shared', {
          username: req.user.username,
          room,
          fileInfo: {
            filename,
            originalName: req.file.originalname,
            size: req.file.size,
            isPrivate
          }
        });
      }

      res.status(201).json({
        message: 'File uploaded successfully',
        filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ message: 'Error uploading file' });
    }
  });

  // Get list of files for a room
app.get('/api/files', roleBasedAuthMiddleware(ROLES.USER), (req, res) => {
  try {
    const room = req.query.room || 'general';
    const username = req.user.username;
    const role = req.user.role;
    
    // Get chat context filter parameters
    const chatType = req.query.chatType || 'room';
    const chatTarget = req.query.chatTarget || room;

    // Filter files by chat context and access permissions
    const files = Object.values(fileDatabase)
      .filter(file => {
        // For backward compatibility with existing files that don't have chatContext
        if (!file.chatContext) {
          // If no chatContext and only filtering by room
          if (chatType === 'room' && file.room === room) {
            // Apply standard access permissions
            if (role === ROLES.ADMIN) return true;
            if (file.uploadedBy === username) return true;
            if (file.accessControl.default === 'public') return true;
            
            const userPermission = file.accessControl?.users?.[username];
            return userPermission && userPermission !== 'none';
          }
          return false;
        }
        
        // Match chat context
        const contextMatch = file.chatContext.type === chatType && 
                             file.chatContext.target === chatTarget;
        
        if (!contextMatch) return false;
        
        // Apply access permissions
        if (role === ROLES.ADMIN) return true;
        if (file.uploadedBy === username) return true;
        if (file.accessControl.default === 'public') return true;
        
        const userPermission = file.accessControl?.users?.[username];
        return userPermission && userPermission !== 'none';
      })
      .map(file => ({
        filename: file.filename,
        originalName: file.originalName,
        size: file.size,
        uploadedBy: file.uploadedBy,
        uploadedAt: file.uploadedAt,
        isPrivate: file.accessControl.default === 'private',
        chatContext: file.chatContext || { type: 'room', target: file.room },
        permission: file.uploadedBy === username 
          ? 'full' 
          : (file.accessControl?.users?.[username] || 
             (file.accessControl.default === 'public' ? 'view' : 'none'))
      }));

    res.json({ files });
  } catch (error) {
    console.error('Error retrieving files:', error);
    res.status(500).json({ message: 'Error retrieving files' });
  }
});

  // Download/view file
  app.get('/api/files/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = fileDatabase[filename];

      if (!fileInfo) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Get token from query or header
      const token = req.query.token || req.headers.authorization?.split(' ')[1];
      let user = null;

      if (token) {
        // Validate token and extract user info
        try {
          const { verifyToken } = require('./auth');
          user = verifyToken(token);
        } catch (error) {
          console.error('Error verifying token:', error);
        }
      }

      // Check access permission
      if (fileInfo.accessControl.default === 'private') {
        // No token or invalid token
        if (!user) {
          return res.status(401).json({ message: 'Authentication required to access this file' });
        }

        // Check if user has permission
        const isAdmin = user.role === ROLES.ADMIN;
        const isOwner = fileInfo.uploadedBy === user.username;
        const userPermission = fileInfo.accessControl?.users?.[user.username];

        if (!isAdmin && !isOwner && (!userPermission || userPermission === 'none')) {
          return res.status(403).json({ message: 'You do not have permission to access this file' });
        }
      }

      // File path
      const filePath = path.join(uploadDir, filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        delete fileDatabase[filename]; // Clean up database
        saveFileDatabase();
        return res.status(404).json({ message: 'File not found on server' });
      }

      // Set appropriate headers
      res.setHeader('Content-Disposition', `inline; filename="${fileInfo.originalName}"`);
      res.setHeader('Content-Type', fileInfo.mimetype);

      // Stream the file to the client
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(500).json({ message: 'Error serving file' });
    }
  });

  // Delete file
  app.delete('/api/files/:filename', roleBasedAuthMiddleware(ROLES.USER), (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = fileDatabase[filename];

      if (!fileInfo) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Check if user has permission to delete
      const isAdmin = req.user.role === ROLES.ADMIN;
      const isOwner = fileInfo.uploadedBy === req.user.username;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: 'You do not have permission to delete this file' });
      }

      // Delete file from storage
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Get room and original name for notification
      const room = fileInfo.room;
      const originalName = fileInfo.originalName;

      // Remove from database
      delete fileDatabase[filename];
      saveFileDatabase();

      // Notify room about deletion
      if (app.io) {
        app.io.to(room).emit('file-deleted', {
          username: req.user.username,
          room,
          filename,
          originalName
        });
      }

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ message: 'Error deleting file' });
    }
  });

  // Update file permissions
  app.put('/api/files/:filename/access', roleBasedAuthMiddleware(ROLES.USER), (req, res) => {
    try {
      const { filename } = req.params;
      const { defaultAccess, userPermissions } = req.body;
      const fileInfo = fileDatabase[filename];

      if (!fileInfo) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Check if user has permission to update
      const isAdmin = req.user.role === ROLES.ADMIN;
      const isOwner = fileInfo.uploadedBy === req.user.username;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ 
          message: 'You do not have permission to update file access' 
        });
      }

      // Update default access (if provided)
      if (defaultAccess && ['private', 'public'].includes(defaultAccess)) {
        fileInfo.accessControl.default = defaultAccess;
        fileInfo.isPrivate = defaultAccess === 'private';
      }

      // Update user permissions (if provided)
      if (userPermissions && typeof userPermissions === 'object') {
        // Initialize users object if it doesn't exist
        if (!fileInfo.accessControl.users) {
          fileInfo.accessControl.users = {};
        }

        // Update each user permission
        Object.entries(userPermissions).forEach(([username, permission]) => {
          // Validate permission value
          if (['none', 'view', 'edit', 'full'].includes(permission)) {
            // Don't allow changing owner's permission
            if (username !== fileInfo.uploadedBy) {
              fileInfo.accessControl.users[username] = permission;
            }
          }
        });
      }

      // Save changes
      saveFileDatabase();

      // Notify room about access change
      if (app.io) {
        app.io.to(fileInfo.room).emit('file-access-updated', {
          updatedBy: req.user.username,
          room: fileInfo.room,
          filename,
          isPrivate: fileInfo.accessControl.default === 'private'
        });
      }

      res.json({
        message: 'File access updated successfully',
        accessControl: fileInfo.accessControl
      });
    } catch (error) {
      console.error('Error updating file access:', error);
      res.status(500).json({ message: 'Error updating file access' });
    }
  });

  // Get file access permissions
  app.get('/api/files/:filename/access', roleBasedAuthMiddleware(ROLES.USER), (req, res) => {
    try {
      const { filename } = req.params;
      const fileInfo = fileDatabase[filename];

      if (!fileInfo) {
        return res.status(404).json({ message: 'File not found' });
      }

      // Check if user has permission to view access info
      const isAdmin = req.user.role === ROLES.ADMIN;
      const isOwner = fileInfo.uploadedBy === req.user.username;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ 
          message: 'You do not have permission to view file access information'
        });
      }

      res.json({
        filename,
        originalName: fileInfo.originalName,
        uploadedBy: fileInfo.uploadedBy,
        accessControl: fileInfo.accessControl
      });
    } catch (error) {
      console.error('Error retrieving file access:', error);
      res.status(500).json({ message: 'Error retrieving file access' });
    }
  });
}

module.exports = { setupFileRoutes };