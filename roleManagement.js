const { createUser, loadUsers, saveUsers } = require('./users');
const { ROLES, ROLE_HIERARCHY } = require('./roles');

// Check if a specific user has sufficient permissions
const hasPermission = (performingUsername, requiredRole) => {
    const users = loadUsers();
    const performingUser = users[performingUsername];

    if (!performingUser) return false;

    // Case-insensitive role lookup
    const getRole = (roleName) => {
        return Object.values(ROLES).find(r => 
        r.toLowerCase() === (roleName || '').toLowerCase()
        ) || roleName;
    };
        
    const performerRoleLevel = ROLE_HIERARCHY[getRole(performingUser.role)] || 0;
    const requiredRoleLevel = ROLE_HIERARCHY[getRole(requiredRole)] || 0;
};

// Change a user's role (with permission checks)
const changeUserRole = async (performingUsername, targetUsername, newRole) => {
    // Only allow admins to change roles
    if (!hasPermission(performingUsername, ROLES.ADMIN)) {
        return { 
            success: false, 
            message: 'Only admins can change user roles' 
        };
    }

    const users = loadUsers();
    const targetUser = users[targetUsername];

    if (!targetUser) {
        return { success: false, message: 'User not found' };
    }

    // Optional: Track role change history
    if (!targetUser.roleHistory) {
        targetUser.roleHistory = [];
    }
    targetUser.roleHistory.push({
        previousRole: targetUser.role,
        newRole: newRole,
        changedBy: performingUsername,
        changedAt: new Date().toISOString()
    });

    // Update user role
    targetUser.role = newRole;
    saveUsers(users);

    return { 
        success: true, 
        message: `User ${targetUsername} role updated to ${newRole}` 
    };
};

// Get users by specific role
const getUsersByRole = (role) => {
    const users = loadUsers();
    return Object.values(users)
        .filter(user => user.role === role)
        .map(user => ({
            username: user.username,
            email: user.email,
            createdAt: user.createdAt
        }));
};

module.exports = {
    hasPermission,
    changeUserRole,
    getUsersByRole
};