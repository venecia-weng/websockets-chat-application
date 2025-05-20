// Predefined roles
const ROLES = {
    USER: 'User',
    ADMIN: 'Admin'
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    [ROLES.USER]: 1,
    [ROLES.ADMIN]: 2
};

module.exports = { 
    ROLES,
    ROLE_HIERARCHY
};