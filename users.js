const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { ROLES } = require('./roles');

const usersFilePath = path.join(__dirname, 'users.json');

// Initialize users file if it doesn't exist
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, JSON.stringify({}));
}

// Load users from file
const loadUsers = () => {
    try {
        const data = fs.readFileSync(usersFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading users:', error);
        return {};
    }
};

// Save users to file
const saveUsers = (users) => {
    try {
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error saving users:', error);
    }
};

// Create a new user
const createUser = async (username, email, password, role=ROLES.USER) => {
    const users = loadUsers();

    // Check if email or username already exists
    if (Object.values(users).some(user => user.email === email)) {
        return { success: false, message: 'Email already exists' };
    }
    if (users[username]) {
        return { success: false, message: 'Username already exists' };
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Add the new user
    users[username] = {
        username,
        email,
        password: hashedPassword,
        role: role,
        createdAt: new Date().toISOString(),
        failedLoginAttempts: 0,
        lockedUntil: null
    };

    saveUsers(users);
    return { success: true, message: 'User created successfully' };
};

// Create a special role user
const createSpecialRoleUser = async (performingUsername, email, password, role) => {
    const users = loadUsers();
    const admin = users[performingUsername];

    // Special case for creating the first admin
    if (!admin && role === ROLES.ADMIN) {
        return createUser(
            performingUsername, 
            email, 
            password, 
            role
        );
    }

    // Check if the performing user is an admin or if it's the initial system setup
    const isSystemSetup = performingUsername === 'System' && Object.keys(users).length === 0;
    if ((!admin || admin.role !== ROLES.ADMIN) && !isSystemSetup) {
        return { 
            success: false, 
            message: 'Only admins can create special role users' 
        };
    }

    // Create user with specified role
    return createUser(
        // Generate a username or use email
        email.split('@')[0], 
        email, 
        password, 
        role
    );
};

// Create a guest user
const createGuestUser = async (invitingUsername, email) => {
    const users = loadUsers();
    const invitingUser = users[invitingUsername];

    // Only certain roles can create guest users
    if (![ROLES.ADMIN, ROLES.MANAGER].includes(invitingUser.role)) {
        return { 
            success: false, 
            message: 'Only admins and managers can create guest users' 
        };
    }

    // Generate a temporary password
    const temporaryPassword = Math.random().toString(36).slice(-8);

    // Create guest user with limited access
    return createUser(
        email.split('@')[0], 
        email, 
        temporaryPassword, 
        ROLES.GUEST
    );
};

// Track failed login attempt
const recordFailedLoginAttempt = (username) => {
    const users = loadUsers();
    if (users[username]) {
        users[username].failedLoginAttempts = (users[username].failedLoginAttempts || 0) + 1;

        // Lock account after 5 failed attempts
        if (users[username].failedLoginAttempts >= 5) {
            // Lock for 30 minutes
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + 30);
            users[username].lockedUntil = lockUntil.toISOString();
        }

        saveUsers(users);
    }
};

// Reset failed login attempts
const resetFailedLoginAttempts = (username) => {
    const users = loadUsers();
    if (users[username]) {
        users[username].failedLoginAttempts = 0;
        users[username].lockedUntil = null;
        saveUsers(users);
    }
};

// Authenticate a user
const authenticateUser = async (username, password) => {
    const users = loadUsers();

    // Check if username exists
    const actualUsername = Object.keys(users).find(key => 
        key.toLowerCase() === username.toLowerCase()
      );
      if (!actualUsername) {
        return { success: false, message: 'Invalid username or password' };
      }

    // Check if account is locked
    if (users[username].lockedUntil) {
        const lockTime = new Date(users[username].lockedUntil);
        const currentTime = new Date();

        if (currentTime < lockTime) {
            const minutesLeft = Math.ceil((lockTime - currentTime) / (1000 * 60));
            return {
                success: false,
                message: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`
            };
        } else {
            // Lock period has expired
            users[username].lockedUntil = null;
            saveUsers(users);
        }
    }

    // Fixed password verification logic
    try {
        const isValid = await bcrypt.compare(password, users[username].password);
        
        if (!isValid) {
            recordFailedLoginAttempt(username);
            return { success: false, message: 'Invalid username or password' };
        }

        resetFailedLoginAttempts(username);
        return { success: true, message: 'Authentication successful', user: {
            username: users[username].username,
            email: users[username].email,
            role: users[username].role
        }};
    } catch (error) {
        console.error('Error during authentication:', error);
        return { success: false, message: 'Authentication error occurred' };
    }
};

// Get user by username
const getUserByUsername = async (username) => {
    const users = loadUsers();
    return users[username] || null;
};

// Function to update existing users with roles
const updateUsersWithRoles = () => {
    const users = loadUsers();
    let updated = false;
    
    Object.keys(users).forEach(username => {
      if (!users[username].role) {
        users[username].role = ROLES.USER; // Default role
        updated = true;
      }
    });
    
    if (updated) {
      saveUsers(users);
      console.log('Updated users with default roles');
    }
};

// Update user role
const updateUserRole = async (performingUsername, username, newRole) => {
    const users = loadUsers();
    const performingUser = users[performingUsername];

    // Only allow admins to change roles
    if (performingUser.role !== ROLES.ADMIN) {
        return { 
            success: false, 
            message: 'Only admins can change user roles' 
        };
    }

    // Check if user exists
    if (!users[username]) {
        return { success: false, message: 'User not found' };
    }

    // Update user's role
    users[username].role = newRole;
    saveUsers(users);

    return { 
        success: true, 
        message: `User role updated to ${newRole}` 
    };
};

module.exports = {
    createUser,
    loadUsers, 
    saveUsers,
    createSpecialRoleUser,
    createGuestUser,
    authenticateUser,
    getUserByUsername,
    recordFailedLoginAttempt,
    resetFailedLoginAttempts,
    updateUsersWithRoles,
    updateUserRole
};