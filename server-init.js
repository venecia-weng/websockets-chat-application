// server-init.js - Initialize the server and admin user
const { ROLES } = require('./roles');
const { createSpecialRoleUser } = require('./users');
const { initializeAdminUser } = require('./auth');

// Initialize the server
const initServer = async () => {
  console.log('Initializing server...');
  
  // Initialize admin user - avoid circular dependencies by passing the function
  await initializeAdminUser(createSpecialRoleUser);
  
  console.log('Server initialization complete');
};

module.exports = { initServer };