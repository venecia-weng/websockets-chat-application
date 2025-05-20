// Initialize variables
let username = ''; // Add username variable
let authenticated = false; // Add authenticated flag
let chatHeader;
let userIdleTime = 0;
let userActivityTimer = null;
let privateChats = new Set();
let userFocusStatus = true;
let userManualStatus = false;
const IDLE_TIMEOUT = 60000; // Time in ms before user is considered idle (1 minute)
const AWAY_TIMEOUT = 300000; // Time in ms before user is considered away (5 minutes)

// Cache DOM elements
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const messageContainer = document.getElementById('message-container');
const statusSelect = document.getElementById('status-select');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const currentRoomTitle = document.getElementById('current-room');
const roomUsersCount = document.getElementById('room-users-count');
const userList = document.getElementById('user-list');
const roomList = document.getElementById('room-list');
const groupList = document.getElementById('group-list');
const newGroupInput = document.getElementById('new-group-input');
const createGroupBtn = document.getElementById('create-group-btn');
const usernameDisplay = document.getElementById('username-display');

// Helper function to format date without moment.js
function formatDate(dateStr) {
  const date = new Date(dateStr);
  
  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return 'Unknown date';
  }
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  
  // Format time with AM/PM
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  // Convert to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  // Add leading zero to minutes if needed
  const mins = minutes < 10 ? '0' + minutes : minutes;
  
  return `${month} ${day}, ${year} ${hours}:${mins} ${ampm}`;
}

// Set up audio notification
const messageTone = new Audio('/message-tone.mp3');

// Track current state
let currentRoom = 'general';
let currentUsers = [];
let groups = [];
let rooms = [];
let roomMessages = {};
let activeChat = { type: 'room', target: 'general' }; // Track if we're chatting in a room or with a group
let socket; // Will be initialized after login

// File Tab Variables
let roomFiles = {}; // Store files by room
let userRole = 'viewer'; // Default role, will be updated from auth
let selectedFile = null; // Currently selected file for upload
let activeFilePreview = null; // Currently previewed file

// =====================
// Modal System Functions
// =====================

// Create a custom modal system
function createModalSystem() {
  if (!document.querySelector('.custom-modal-overlay')) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'custom-modal-overlay';

    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.className = 'custom-modal';

    // Add initial structure
    modalContainer.innerHTML = `
      <h3 class="custom-modal-title"></h3>
      <div class="custom-modal-content"></div>
      <div class="custom-modal-buttons"></div>
    `;

    // Append to DOM
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Add escape key listener
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModal();
      }
    });
  }

  // Add modal styles if not already added
  if (!document.getElementById('custom-modal-styles')) {
    const modalStyles = document.createElement('style');
    modalStyles.id = 'custom-modal-styles';
    modalStyles.textContent = `
      /* Custom Modal Styles */
      .custom-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s;
      }
      
      .custom-modal-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      
      .custom-modal {
        background-color: white;
        border-radius: 16px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        width: 340px;
        max-width: 90%;
        padding: 20px;
        text-align: center;
        transform: translateY(-20px);
        transition: transform 0.3s;
      }
      
      .custom-modal-overlay.active .custom-modal {
        transform: translateY(0);
      }
      
      .custom-modal-title {
        font-size: 18px;
        color: #2d2d2d;
        margin-bottom: 16px;
        text-align: center;
      }
      
      .custom-modal-content {
        margin-bottom: 20px;
        color: #555;
        font-size: 15px;
        line-height: 1.5;
      }
      
      .custom-modal-buttons {
        display: flex;
        justify-content: center;
        gap: 12px;
      }
      
      .modal-btn {
        padding: 10px 20px;
        border-radius: 30px;
        border: none;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
      }
      
      .modal-btn:active {
        transform: scale(0.98);
      }
      
      .modal-btn-primary {
        background-color: #673ab7;
        color: white;
      }
      
      .modal-btn-primary:hover {
        background-color: #5e35b1;
      }
      
      .modal-btn-cancel {
        background-color: #f0e6ff;
        color: #673ab7;
      }
      
      .modal-btn-cancel:hover {
        background-color: #e6d9ff;
      }
      
      /* Different button styles based on action type */
      .modal-btn-delete {
        background-color: #e74c3c;
        color: white;
      }
      
      .modal-btn-delete:hover {
        background-color: #c0392b;
      }
      
      .modal-btn-leave {
        background-color: #e67e22;
        color: white;
      }
      
      .modal-btn-leave:hover {
        background-color: #d35400;
      }
    `;
    document.head.appendChild(modalStyles);
  }
}

// Show a custom confirmation modal
function showConfirmModal(options) {
  // Make sure modal system is created
  createModalSystem();

  const modalOverlay = document.querySelector('.custom-modal-overlay');
  const modalTitle = document.querySelector('.custom-modal-title');
  const modalContent = document.querySelector('.custom-modal-content');
  const modalButtons = document.querySelector('.custom-modal-buttons');

  // Set modal content
  modalTitle.textContent = options.title || 'Confirm';
  modalContent.textContent = options.message || 'Are you sure?';

  // Clear existing buttons
  modalButtons.innerHTML = '';

  // Create confirm button
  const confirmBtn = document.createElement('button');
  confirmBtn.className = `modal-btn ${options.actionType ? 'modal-btn-' + options.actionType : 'modal-btn-primary'}`;
  confirmBtn.textContent = options.confirmText || 'OK';
  confirmBtn.addEventListener('click', () => {
    closeModal();
    if (options.onConfirm) options.onConfirm();
  });

  // Create cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn modal-btn-cancel';
  cancelBtn.textContent = options.cancelText || 'Cancel';
  cancelBtn.addEventListener('click', () => {
    closeModal();
    if (options.onCancel) options.onCancel();
  });

  // Add buttons to modal
  if (options.actionType === 'delete' || options.actionType === 'leave') {
    // For destructive actions, put Cancel first (safer option)
    modalButtons.appendChild(cancelBtn);
    modalButtons.appendChild(confirmBtn);
  } else {
    // For regular confirmations, put OK first
    modalButtons.appendChild(confirmBtn);
    modalButtons.appendChild(cancelBtn);
  }

  // `Show m`odal
  modalOverlay.classList.add('active');

  // Focus the safer option
  setTimeout(() => {
    if (options.actionType === 'delete' || options.actionType === 'leave') {
      cancelBtn.focus();
    } else {
      confirmBtn.focus();
    }
  }, 100);
}

// Close modal
function closeModal() {
  const modalOverlay = document.querySelector('.custom-modal-overlay');
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
  }
}

// =====================
// Authentication Functions
// =====================

// Switch to login tab
function switchToLoginTab() {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.style.display = 'flex';
  registerForm.style.display = 'none';
}

// Switch to register tab
function switchToRegisterTab() {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.style.display = 'flex';
  loginForm.style.display = 'none';
}

// Initialize socket connection with auth token
function initializeSocketConnection(token) {
  console.log('Initializing socket connection with token', !!token);

  // Always clean up any existing socket to prevent duplicates
  if (socket) {
    try {
      if (typeof socket.offAny === 'function') {
        socket.offAny(); // Remove all listeners if available
      } else {
        socket.off(); // Fallback
      }
      socket.disconnect();
    } catch (e) {
      console.error('Error disconnecting previous socket:', e);
    }
    socket = null;
  }

  // Clear any existing activity timer
  if (userActivityTimer) {
    clearInterval(userActivityTimer);
    userActivityTimer = null;
  }

  // Create new socket with better connection options
  socket = io({
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    forceNew: true, // Force a new connection
    query: { token } // Also include in query for compatibility
  });

  // Connection event handling
  socket.on('connect', () => {
    console.log(`Socket connected as ${username} with ID: ${socket.id}`);

    // Add status indicator to UI
    addSystemMessage(`Connected to chat server as ${username}`, 'info');

    // Update connection status
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.classList.add('connected');
    }

    // IMPORTANT: Explicitly join general room after connection
    console.log('Explicitly joining general room...');
    // Automatically join general room
    setTimeout(() => {
      socket.emit('join-room', 'General');
    }, 500);
  });

  // Reconnection events
  socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnection attempt ${attempt}`);
    addSystemMessage(`Reconnecting to server (attempt ${attempt})...`, 'warning');
  });

  socket.on('reconnect', () => {
    console.log('Reconnected to server');
    addSystemMessage('Reconnected to server!', 'info');

    // Rejoin current room after reconnection
    if (currentRoom) {
      socket.emit('join-room', currentRoom);
    }
  });

  socket.on('reconnect_error', (error) => {
    console.error('Reconnection error:', error);
    addSystemMessage('Failed to reconnect to server', 'error');
  });

  socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect after multiple attempts');
    addSystemMessage('Connection lost. Please refresh the page.', 'error');
  });

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${reason}`);

    const statusIndicator = document.querySelector('.status-indicator');
    if (statusIndicator) {
      statusIndicator.className = 'status-indicator status-offline';
    }

    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.classList.remove('connected');
    }

    if (reason === 'io server disconnect') {
      // Server disconnected us, we need to reconnect manually
      addSystemMessage('Disconnected by server, attempting to reconnect...', 'warning');
      setTimeout(() => {
        socket.connect();
      }, 1000);
    } else {
      addSystemMessage(`Disconnected: ${reason}`, 'warning');
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    addSystemMessage(`Connection error: ${error.message}`, 'error');

    // If authentication error, redirect to login
    if (error.message.includes('auth')) {
      localStorage.removeItem('chatToken');
      addSystemMessage('Authentication failed. Please log in again.', 'error');

      setTimeout(() => {
        // Show auth container and hide chat container
        document.getElementById('auth-container').style.display = 'block';
        document.querySelector('.chat-container').style.display = 'none';
      }, 2000);
    }
  });

  // Set up all socket event listeners
  setupSocketEventListeners();

  // Set up file socket event listeners
  setupFileSocketEvents();

  // Set up activity detection
  setupActivityDetection();

  // Set up enhanced heartbeat
  setupEnhancedHeartbeat();

  // Set up visibility tracking
  setupVisibilityTracking();

  // Set up enhanced status UI
  setupEnhancedStatusUI();

  // Initialize file features
  initializeFileFeatures();

  // Return socket for convenience
  return socket;
}

// =====================
// Activity Detection Functions
// =====================

// Function to detect user activity
function setupActivityDetection() {
  // Reset the idle timer on user activity
  const resetIdleTime = () => {
    userIdleTime = 0;

    // If user was previously auto-away, set them back to online
    if (authenticated && socket && statusSelect.value === 'away' && !userManualStatus) {
      statusSelect.value = 'online';
      updateUserInfo('online', true);
    }
  };

  // Track user activity
  document.addEventListener('mousemove', resetIdleTime);
  document.addEventListener('keypress', resetIdleTime);
  document.addEventListener('click', resetIdleTime);
  document.addEventListener('scroll', resetIdleTime);

  // Clear any existing interval
  if (userActivityTimer) {
    clearInterval(userActivityTimer);
    userActivityTimer = null;
  }

  // Set up the timer to check for inactivity
  userActivityTimer = setInterval(() => {
    userIdleTime += 1000;

    if (authenticated && socket && !userManualStatus) {
      // If user has been inactive for AWAY_TIMEOUT, set status to away
      if (userIdleTime >= AWAY_TIMEOUT && statusSelect.value !== 'away') {
        statusSelect.value = 'away';
        updateUserInfo('away', true);
      }
      // If user has been inactive for IDLE_TIMEOUT, set status to idle
      else if (userIdleTime >= IDLE_TIMEOUT && statusSelect.value !== 'idle' && statusSelect.value !== 'away') {
        statusSelect.value = 'idle';
        updateUserInfo('idle', true);
      }
    }
  }, 1000);
}

// Function to track window focus/blur
function setupVisibilityTracking() {
  // Listen for visibility changes
  document.addEventListener('visibilitychange', function () {
    if (!authenticated || !socket) return;

    if (document.hidden) {
      // User switched tabs or minimized window
      userFocusStatus = false;

      // Set a timer before changing status - only mark away after 30 seconds of inactivity
      if (!window.statusChangeTimer) {
        window.statusChangeTimer = setTimeout(() => {
          if (!userManualStatus && document.hidden) {
            statusSelect.value = 'idle';  // Use 'idle' instead of 'away'
            updateUserInfo('idle', true);
          }
        }, 30000); // 30 seconds delay
      }
    } else {
      // User returned to the tab
      userFocusStatus = true;

      // Clear the timer if it exists
      if (window.statusChangeTimer) {
        clearTimeout(window.statusChangeTimer);
        window.statusChangeTimer = null;
      }

      if (!userManualStatus) {
        // Only change if they haven't manually set status
        statusSelect.value = 'online';
        updateUserInfo('online', true);
      }

      // Reset idle time
      userIdleTime = 0;
    }
  });

  // Also track window focus/blur events
  window.addEventListener('focus', () => {
    userFocusStatus = true;
    if (window.statusChangeTimer) {
      clearTimeout(window.statusChangeTimer);
      window.statusChangeTimer = null;
    }

    if (authenticated && socket && !userManualStatus) {
      statusSelect.value = 'online';
      updateUserInfo('online', true);
    }
  });

  window.addEventListener('blur', () => {
    userFocusStatus = false;

    // Don't immediately change status on blur
    // Instead, start a timer
    if (!window.statusChangeTimer) {
      window.statusChangeTimer = setTimeout(() => {
        if (!userManualStatus && !userFocusStatus) {
          statusSelect.value = 'idle';
          updateUserInfo('idle', true);
        }
      }, 30000); // 30 seconds delay
    }
  });
}

// Enhanced heartbeat function
function setupEnhancedHeartbeat() {
  // Clear any existing interval
  if (window.heartbeatInterval) {
    clearInterval(window.heartbeatInterval);
  }

  // Set up regular heartbeat with status information
  window.heartbeatInterval = setInterval(function () {
    if (authenticated && socket) {
      // Send current status and activity data
      socket.emit('heartbeat', {
        status: statusSelect.value,
        idleTime: userIdleTime,
        windowFocused: userFocusStatus
      });
    }
  }, 30000); // Every 30 seconds

  // Also send heartbeat immediately after connection/reconnection
  socket.on('connect', () => {
    if (authenticated) {
      socket.emit('heartbeat', {
        status: statusSelect.value,
        idleTime: userIdleTime,
        windowFocused: userFocusStatus
      });
    }
  });
}

// =====================
// UI Functions
// =====================

// Add system message to UI
function addSystemMessage(message, type = 'info') {
  const element = `
    <li class="system-message ${type}">
      <p>${message}</p>
    </li>
  `;

  messageContainer.innerHTML += element;
  scrollToBottom();
}

// Update the chat header based on the active chat type
function updateChatHeader(target, type) {
  const headerElement = document.querySelector('.chat-header');

  // Update the global reference
  chatHeader = headerElement;

  if (!headerElement) {
    console.error('Chat header element not found');
    return;
  }

  // Clear existing content
  headerElement.innerHTML = '';

  // Add event listeners to header buttons safely
  function setupHeaderButtonListeners() {
    const headerElement = document.querySelector('.chat-header');

    if (!headerElement) {
      console.error('Chat header element not found in setupHeaderButtonListeners');
      return;
    }

    // Add event listeners for back buttons
    const backBtn = headerElement.querySelector('.back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        switchToRoomChat('general');
      });
    }

    // Add event listeners for group actions
    const leaveGroupBtn = headerElement.querySelector('.leave-group-btn');
    if (leaveGroupBtn) {
      leaveGroupBtn.addEventListener('click', () => {
        const groupName = leaveGroupBtn.getAttribute('data-group');
        if (groupName) leaveGroup(groupName);
      });
    }

    const deleteGroupBtn = headerElement.querySelector('.delete-group-btn');
    if (deleteGroupBtn) {
      deleteGroupBtn.addEventListener('click', () => {
        const groupName = deleteGroupBtn.getAttribute('data-group');
        if (groupName) deleteGroup(groupName);
      });
    }
  }

  // Clear existing content
  headerElement.innerHTML = '';

  if (type === 'room') {
    // Room header
    headerElement.innerHTML = `
      <div class="room-info">
        <h2>${target.charAt(0).toUpperCase() + target.slice(1)}</h2>
      </div>
    `;
  } else if (type === 'group') {
    // Group header with controls
    const isOwner = groups.find(g => g.name === target)?.owner === username;

    headerElement.innerHTML = `
      <div class="group-info">
        <button class="back-btn"><i class="fas fa-arrow-left"></i></button>
        <h2>Group: ${target}</h2>
        ${isOwner ?
        `<button class="delete-group-btn" data-group="${target}">
            <i class="fas fa-trash"></i> Delete
          </button>` :
        `<button class="leave-group-btn" data-group="${target}">
            <i class="fas fa-sign-out-alt"></i> Leave
          </button>`
      }
      </div>
    `;
  } else if (type === 'private') {
    // Private chat header
    headerElement.innerHTML = `
      <div class="private-chat-info">
        <button class="back-btn"><i class="fas fa-arrow-left"></i></button>
        <h2>Chat with ${target}</h2>
      </div>
    `;
  }

  // Add event listeners for back buttons
  const backBtn = headerElement.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      switchToRoomChat('general');
    });
  }

  // Add event listeners for group actions
  if (type === 'group') {
    const leaveGroupBtn = headerElement.querySelector('.leave-group-btn');
    if (leaveGroupBtn) {
      leaveGroupBtn.addEventListener('click', () => {
        leaveGroup(target);
      });
    }

    const deleteGroupBtn = headerElement.querySelector('.delete-group-btn');
    if (deleteGroupBtn) {
      deleteGroupBtn.addEventListener('click', () => {
        deleteGroup(target);
      });
    }
  }

  setupHeaderButtonListeners();
}

// Add error message to UI
function addErrorMessage(message) {
  addSystemMessage(message, 'error');
}

// Add debug message to UI
function addDebugMessage(message) {
  console.log('DEBUG:', message);
  addSystemMessage(`DEBUG: ${message}`, 'info');
}

// Add message to UI
function addMessageToUI(isOwnMessage, data, saveToHistory = true) {
  clearFeedback();

  // Check for duplicate messages in the UI already
  const messageExists = checkForExistingMessage(data);
  if (messageExists) {
    console.log('Preventing duplicate message in UI:', data);
    return;
  }

  // Format the timestamp
  const exactTime = moment(data.dateTime).format('MMM D, YYYY h:mm A');
  const relativeTime = moment(data.dateTime).fromNow();

  // Determine message class based on type
  let messageClass = isOwnMessage ? 'message-right' : 'message-left';

  if (data.isPrivate) {
    messageClass += ' private-message';
  } else if (data.isGroupMessage) {
    messageClass += ' group-message';
  }

  // Create message element
  let messageContent = data.message;
  let messageInfo = '';

  // Add special indicators for private/group messages
  if (data.isPrivate) {
    const target = isOwnMessage ? `to ${data.to}` : `from ${data.from}`;
    messageInfo = `<div class="message-badge">Private ${target}</div>`;
  } else if (data.isGroupMessage) {
    messageInfo = `<div class="message-badge">Group: ${data.group}</div>`;
  }

  // Check for file message
  let fileContent = '';
  if (data.isFileMessage && data.fileInfo) {
    // Get file info
    const fileInfo = data.fileInfo;
    const fileIcon = getFileIcon(fileInfo.originalName || fileInfo.filename);
    const fileSize = formatFileSize(fileInfo.size);

    // Create file attachment layout
    fileContent = `
      <div class="file-attachment" data-filename="${fileInfo.filename}">
        <div class="file-attachment-icon">
          ${fileIcon}
        </div>
        <div class="file-attachment-info">
          <div class="file-attachment-name">${fileInfo.originalName || fileInfo.filename}</div>
          <div class="file-attachment-meta">${fileSize}</div>
        </div>
        <div class="file-attachment-action">
          <i class="fas fa-eye"></i>
        </div>
      </div>
    `;
  }

  // Generate a message ID to help with duplicate detection
  const messageId = `msg-${data.name}-${btoa(data.message).substring(0, 10)}-${new Date(data.dateTime).getTime()}`;

  const element = `
    <li class="${messageClass}" id="${messageId}" data-timestamp="${new Date(data.dateTime).getTime()}" data-sender="${data.name}">
      <p class="message">
        ${messageInfo}
        ${messageContent}
        ${fileContent}
        <div class="message-info">
          <div class="message-sender">${data.name}</div>
          <div class="message-time" title="${exactTime}">
            ${exactTime}<br>
            <span class="message-relative-time">${relativeTime}</span>
          </div>
        </div>
      </p>
    </li>
  `;

  messageContainer.innerHTML += element;
  scrollToBottom();

  // Only save if needed (prevents duplicates when loading saved messages)
  if (saveToHistory) {
    // Initialize room/conversation if needed
    const storageKey = data.isPrivate ?
      `private_${isOwnMessage ? data.to : data.from}` :
      data.isGroupMessage ? `group_${data.group}` : data.room;

    if (!roomMessages[storageKey]) {
      roomMessages[storageKey] = [];
    }

    // Check for duplicates before adding to storage
    const isDuplicate = roomMessages[storageKey].some(msg =>
      msg.name === data.name &&
      msg.message === data.message &&
      Math.abs(new Date(msg.dateTime) - new Date(data.dateTime)) < 5000
    );

    if (!isDuplicate) {
      // Add to messages
      roomMessages[storageKey].push(data);

      // Save to localStorage
      saveRoomMessagesToLocalStorage();
    }
  }
}

// Helper function to check for existing messages in the UI
function checkForExistingMessage(data) {
  // Find similar messages in the last 5 seconds
  const timeThreshold = 5000; // 5 seconds
  const now = Date.now();
  const allMessages = messageContainer.querySelectorAll('li.message-left, li.message-right');

  for (const msg of allMessages) {
    const msgTimestamp = parseInt(msg.getAttribute('data-timestamp'));
    const msgSender = msg.getAttribute('data-sender');
    const msgContent = msg.querySelector('.message').textContent.trim();

    // Check for duplicate based on sender, content and time
    if (msgSender === data.name &&
      msgContent.includes(data.message) &&
      Math.abs(now - msgTimestamp) < timeThreshold) {
      return true;
    }
  }

  return false;
}

// Save room messages to localStorage
function saveRoomMessagesToLocalStorage() {
  try {
    localStorage.setItem('iChat_roomMessages', JSON.stringify(roomMessages));
  } catch (error) {
    console.warn('Failed to save room messages to localStorage:', error);
  }
}

// Load room messages from localStorage
function loadRoomMessagesFromLocalStorage() {
  try {
    const saved = localStorage.getItem('iChat_roomMessages');
    if (saved) {
      roomMessages = JSON.parse(saved);

      // Convert string dates back to Date objects
      Object.keys(roomMessages).forEach(room => {
        if (roomMessages[room] && Array.isArray(roomMessages[room])) {
          roomMessages[room].forEach(msg => {
            if (msg.dateTime && typeof msg.dateTime === 'string') {
              msg.dateTime = new Date(msg.dateTime);
            }
          });
        }
      });
    }
  } catch (error) {
    console.warn('Failed to load room messages from localStorage:', error);
    roomMessages = {};
  }
}

// Display messages for the current chat (room or group)
// Display messages for the current chat (room or group)
function displayChatMessages() {
  // Clear current messages
  messageContainer.innerHTML = '';

  let storageKey;

  if (activeChat.type === 'group') {
    storageKey = `group_${activeChat.target}`;
  } else if (activeChat.type === 'private') {
    storageKey = `private_${activeChat.target}`;
  } else {
    storageKey = activeChat.target; // For room chats
  }

  // Get messages for this context
  if (roomMessages[storageKey] && Array.isArray(roomMessages[storageKey])) {
    // Deduplicate messages before displaying
    const uniqueMessages = deduplicateMessages(roomMessages[storageKey]);

    // Update storage with deduplicated messages
    roomMessages[storageKey] = uniqueMessages;
    saveRoomMessagesToLocalStorage();

    // Display each message for the current context
    uniqueMessages.forEach(msg => {
      const isOwnMessage = msg.name === username;
      addMessageToUI(isOwnMessage, msg, false);
    });
  }

  // Remove new message indicator when viewing a group
  if (activeChat.type === 'group') {
    const groupEl = document.querySelector(`.group[data-group="${activeChat.target}"]`);
    if (groupEl) {
      groupEl.classList.remove('new-message');
    }
  }
}

// Improved deduplication function for messages
function deduplicateMessages(messages) {
  if (!Array.isArray(messages)) {
    console.warn('Attempted to deduplicate non-array:', messages);
    return [];
  }

  // Create a map to track unique messages
  const uniqueMessages = [];
  const seenMessages = new Map();

  messages.forEach(msg => {
    // Skip invalid messages
    if (!msg || !msg.name || !msg.message) {
      return;
    }

    // Create a signature for this message
    const msgSignature = `${msg.name}-${msg.message}`;
    const msgTime = msg.dateTime ? new Date(msg.dateTime).getTime() : 0;

    // Check if we've seen this message before
    if (seenMessages.has(msgSignature)) {
      const existing = seenMessages.get(msgSignature);
      // Keep the most recent version of the message
      if (msgTime > existing.time) {
        // Replace the existing message with this one
        const index = uniqueMessages.findIndex(m =>
          m.name === msg.name && m.message === msg.message
        );
        if (index !== -1) {
          uniqueMessages[index] = msg;
          seenMessages.set(msgSignature, {
            index,
            time: msgTime
          });
        }
      }
    } else {
      // New unique message
      uniqueMessages.push(msg);
      seenMessages.set(msgSignature, {
        index: uniqueMessages.length - 1,
        time: msgTime
      });
    }
  });

  return uniqueMessages;
}

// Scroll the message container to the bottom
function scrollToBottom() {
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Clear typing feedback messages
function clearFeedback() {
  document.querySelectorAll('li.message-feedback').forEach(function (element) {
    element.parentNode.removeChild(element);
  });
}


// Send message to server
function sendMessage() {
  const message = messageInput.value.trim();
  if (message === '' || !authenticated) return;

  // Handle different message types based on active chat
  if (activeChat.type === 'private') {
    sendPrivateMessage(activeChat.target, message);
  } else if (activeChat.type === 'group') {
    sendGroupMessage(activeChat.target, message);
  } else {
    // Regular room message
    const data = {
      name: username,
      message: message,
      dateTime: new Date(),
      room: currentRoom
    };

    // Add to own UI first for responsiveness
    addMessageToUI(true, data, true);

    // Send to server
    socket.emit('message', data);
  }

  // Clear input field
  messageInput.value = '';
}

// Send private message
function sendPrivateMessage(targetUsername, message) {
  if (!message || !targetUsername) return;

  // Generate a unique message ID
  const messageId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // Format message data
  const privateMessageData = {
    name: username,
    message: message,
    dateTime: new Date(),
    isPrivate: true,
    to: targetUsername,
    messageId: messageId
  };

  // Show in own UI
  addMessageToUI(true, privateMessageData, true);

  // Send the command to server
  socket.emit('command', `@${targetUsername} ${message}`);
}

// Send group message
function sendGroupMessage(groupName, message) {
  if (!message || !groupName) return;

  // Generate a unique message ID to track this specific message
  const messageId = `${username}-${groupName}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // Create the message data with messageId
  const groupMessageData = {
    name: username,
    message: message,
    dateTime: new Date(),
    group: groupName,
    isGroupMessage: true,
    messageId: messageId  // Add unique ID to track this message
  };

  // Add to UI immediately for better user experience
  addMessageToUI(true, groupMessageData, true);

  // Send to server with the messageId
  socket.emit('command', `@group send ${groupName} ${message}`);

  // Store this message ID to avoid duplicating it when it comes back from server
  if (!window.sentMessageIds) window.sentMessageIds = new Set();
  window.sentMessageIds.add(messageId);

  // Clear message input
  messageInput.value = '';
}

// Send private message
function sendPrivateMessage(targetUsername, message) {
  if (!message || !targetUsername) return;

  // Format message data
  const privateMessageData = {
    name: username,
    message: message,
    dateTime: new Date(),
    isPrivate: true,
    to: targetUsername
  };

  // Show in own UI
  addMessageToUI(true, privateMessageData, true);

  // Send the command to server
  socket.emit('command', `@${targetUsername} ${message}`);
}

// Send group message
function sendGroupMessage(groupName, message) {
  if (!message || !groupName) return;

  // Initialize the message tracker if it doesn't exist
  if (!window.messageTracker) {
    window.messageTracker = {
      recentMessages: new Map(),
      cleanup: function () {
        const now = Date.now();
        for (const [key, timestamp] of this.recentMessages.entries()) {
          if (now - timestamp > 10000) {
            this.recentMessages.delete(key);
          }
        }
      }
    };
  }

  // Generate a unique signature for this message
  const msgSignature = `${username}-${groupName}-${message}`;

  // Check if we've sent this message recently (within the last 3 seconds)
  const now = Date.now();
  if (window.messageTracker.recentMessages.has(msgSignature)) {
    const lastSent = window.messageTracker.recentMessages.get(msgSignature);

    // If we've sent this message within 3 seconds, prevent resending
    if (now - lastSent < 3000) {
      console.log('Preventing duplicate send:', msgSignature);
      return;
    }
  }

  // Mark this message as sent
  window.messageTracker.recentMessages.set(msgSignature, now);

  // Create the message data
  const timestamp = new Date();
  const groupMessageData = {
    name: username,
    message: message,
    dateTime: timestamp,
    group: groupName,
    isGroupMessage: true,
    isLocalEcho: true // Flag to identify locally added messages
  };

  // Add to UI immediately for better user experience
  addMessageToUI(true, groupMessageData, true);

  // Send to server
  socket.emit('command', `@group send ${groupName} ${message}`);

  // Clear message input
  messageInput.value = '';
}

// Leave group using custom modal
function leaveGroup(groupName) {
  showConfirmModal({
    title: 'Leave Group',
    message: `Are you sure you want to leave group ${groupName}?`,
    confirmText: 'Leave',
    cancelText: 'Cancel',
    actionType: 'leave',
    onConfirm: () => {
      socket.emit('command', `@group leave ${groupName}`);

      // Switch back to general if we're currently in the group chat
      if (activeChat.type === 'group' && activeChat.target === groupName) {
        switchToRoomChat('General');
      }
    }
  });
}

// Delete group using custom modal
function deleteGroup(groupName) {
  showConfirmModal({
    title: 'Delete Group',
    message: `Are you sure you want to DELETE group ${groupName}?`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    actionType: 'delete',
    onConfirm: () => {
      socket.emit('command', `@group delete ${groupName}`);

      // Switch back to general if we're currently in the group chat
      if (activeChat.type === 'group' && activeChat.target === groupName) {
        switchToRoomChat('general');
      }
    }
  });
}

// Update user info on the server
function updateUserInfo(status = null, isAutomatic = false) {
  if (!authenticated || !socket) return;

  // If no status provided, use select value
  const newStatus = status || statusSelect.value;

  // If this is a manual status change, set the flag
  if (!isAutomatic) {
    userManualStatus = true;

    // Reset the manual flag after 30 minutes
    setTimeout(() => {
      userManualStatus = false;
    }, 1800000); // 30 minutes
  }

  socket.emit('user-update', {
    status: newStatus,
    isManualChange: !isAutomatic
  });
}

// Create a new group
function createNewGroup() {
  const groupName = newGroupInput.value.trim();

  if (!groupName || !authenticated) return;

  // Show group creation dialog
  const membersDialog = document.createElement('div');
  membersDialog.className = 'group-creation-dialog';

  // List all available users with checkboxes
  let userOptions = currentUsers
    .filter(user => user.authenticated && user.name !== username)
    .map(user => `
      <div class="member-option">
        <input type="checkbox" id="user-${user.name}" value="${user.name}">
        <label for="user-${user.name}">${user.name}</label>
      </div>
    `).join('');

  membersDialog.innerHTML = `
    <h3>Add Members to "${groupName}"</h3>
    <div class="members-list">
      ${userOptions}
    </div>
    <div class="dialog-buttons">
      <button class="cancel-btn">Cancel</button>
      <button class="create-btn">Create Group</button>
    </div>
  `;

  document.body.appendChild(membersDialog);

  // Add event listeners
  membersDialog.querySelector('.cancel-btn').addEventListener('click', () => {
    document.body.removeChild(membersDialog);
  });

  membersDialog.querySelector('.create-btn').addEventListener('click', () => {
    // Get selected members
    const selectedMembers = [];
    membersDialog.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
      selectedMembers.push(checkbox.value);
    });

    // Send group creation command
    socket.emit('command', `@group set ${groupName} ${selectedMembers.join(', ')}`);

    // Remove dialog
    document.body.removeChild(membersDialog);

    // Clear input
    newGroupInput.value = '';
  });
}

// Switch to a group chat
function switchToGroupChat(groupName) {
  // Find the group
  const group = groups.find(g => g.name === groupName);

  // Check if user is a member
  if (!group || !group.members.includes(username)) {
    addErrorMessage(`You are not a member of group "${groupName}"`);
    return;
  }

  // Update active chat
  activeChat = { type: 'group', target: groupName };

  // Update UI
  currentRoomTitle.textContent = `Group: ${groupName}`;

  // Add group actions to header
  updateChatHeader(groupName, 'group');

  // Clear and load messages
  messageContainer.innerHTML = '';
  addSystemMessage(`Switched to group ${groupName}`);

  // Load group messages
  const storageKey = `group_${groupName}`;
  if (roomMessages[storageKey] && Array.isArray(roomMessages[storageKey])) {
    // Display each message
    roomMessages[storageKey].forEach(msg => {
      // Make sure we have a valid message object
      if (!msg || !msg.name || !msg.message || !msg.dateTime) {
        console.warn('Invalid message object found:', msg);
        return; // Skip this message
      }

      const isOwnMessage = msg.name === username;
      addMessageToUI(isOwnMessage, msg, false);
    });

    // Update visual indicators
    document.querySelectorAll('.room').forEach(el => el.classList.remove('active'));

    // Update group list selection
    document.querySelectorAll('.group').forEach(el => {
      const groupNameFromEl = el.querySelector('.group-name').textContent;
      if (groupNameFromEl === groupName) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Focus message input
    messageInput.focus();
  }

  // Update visual indicators
  document.querySelectorAll('.room').forEach(el => el.classList.remove('active'));

  // Update group list selection
  document.querySelectorAll('.group').forEach(el => {
    const groupNameFromEl = el.querySelector('.group-name').textContent;
    if (groupNameFromEl === groupName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Focus message input
  messageInput.focus();
}

// Switch to a private chat
function switchToPrivateChat(targetUser) {
  console.log(`Switching to private chat with: ${targetUser}`);

  if (!targetUser) {
    console.error("No target user provided");
    return;
  }

  if (targetUser === username) {
    addErrorMessage("You cannot chat with yourself");
    return;
  }

  // Validate that the target user exists
  const userExists = currentUsers.some(user => user.name === targetUser);
  if (!userExists) {
    addErrorMessage(`User "${targetUser}" is not online or doesn't exist`);
    return;
  }

  // Initialize privateChats Set if it doesn't exist
  if (!privateChats) {
    privateChats = new Set();
  }

  // Update active chat
  activeChat = { type: 'private', target: targetUser };

  // Add private chat to list if new
  privateChats.add(targetUser);
  updatePrivateChatsList();

  // Update UI
  currentRoomTitle.textContent = `Chat with ${targetUser}`;

  // Update header with back button
  updateChatHeader(targetUser, 'private');

  // Clear and load messages
  messageContainer.innerHTML = '';
  addSystemMessage(`Private chat with ${targetUser}`);

  // Define the storage key for private messages
  const storageKey = `private_${targetUser}`;

  // Load private messages if they exist
  if (roomMessages[storageKey]) {
    // Display each message
    roomMessages[storageKey].forEach(msg => {
      const isOwnMessage = msg.name === username;
      addMessageToUI(isOwnMessage, msg, false); // Don't save again
    });
  }

  // Update visual indicators in the UI
  document.querySelectorAll('.room, .group, .private-chat').forEach(el => {
    el.classList.remove('active');
  });

  // Add active class to the right private chat
  const privateChatsItems = document.querySelectorAll('.private-chat');
  privateChatsItems.forEach(item => {
    if (item.getAttribute('data-user') === targetUser) {
      item.classList.add('active');
    }
  });

  // Focus message input
  messageInput.focus();

  // Debug log
  console.log(`Private chat with ${targetUser} initiated.`);
}

// Update private chats list
function updatePrivateChatsList() {
  // Create or get private chats container
  let privateChatsList = document.querySelector('.private-chats-section');

  if (!privateChatsList) {
    // Create the section if it doesn't exist
    const sidebarEl = document.querySelector('.sidebar');

    // Create private chats section
    privateChatsList = document.createElement('div');
    privateChatsList.className = 'private-chats-section';
    privateChatsList.innerHTML = `
      <h3>Private Chats</h3>
      <ul id="private-chat-list" class="private-chat-list"></ul>
    `;

    // Insert after groups section
    const groupsSection = document.querySelector('.groups-section');
    if (groupsSection && groupsSection.nextSibling) {
      sidebarEl.insertBefore(privateChatsList, groupsSection.nextSibling);
    } else {
      sidebarEl.appendChild(privateChatsList);
    }
  }

  // Update list
  const privateList = document.getElementById('private-chat-list');
  if (privateList) {
    privateList.innerHTML = '';

    // Add each private chat
    privateChats.forEach(chatUser => {
      const li = document.createElement('li');
      li.className = 'private-chat';
      li.setAttribute('data-user', chatUser);

      if (activeChat.type === 'private' && activeChat.target === chatUser) {
        li.classList.add('active');
        li.classList.remove('new-message');
      }

      // Check if there are unread messages
      const hasUnread = checkForUnreadPrivateMessages(chatUser);
      if (hasUnread) {
        li.classList.add('new-message');
      }

      // Add user and close button
      li.innerHTML = `
        <span class="private-chat-name">${chatUser}</span>
        <button class="close-private-chat" data-user="${chatUser}">×</button>
      `;

      // Chat click handler
      li.addEventListener('click', function (e) {
        if (!e.target.classList.contains('close-private-chat')) {
          switchToPrivateChat(chatUser);
        }
      });

      // Close button handler
      li.querySelector('.close-private-chat').addEventListener('click', function (e) {
        e.stopPropagation();
        closePrivateChat(chatUser);
      });

      privateList.appendChild(li);
    });
  }
}

function checkForUnreadPrivateMessages(username) {
  const storageKey = `private_${username}`;
  const lastReadTime = localStorage.getItem(`lastRead_${storageKey}`) || 0;

  // Check if there are any messages newer than the last read time
  if (roomMessages[storageKey] && Array.isArray(roomMessages[storageKey])) {
    return roomMessages[storageKey].some(msg => {
      const msgTime = new Date(msg.dateTime).getTime();
      return msgTime > lastReadTime && msg.name !== username;
    });
  }

  return false;
}

// Close a private chat with custom modal
function closePrivateChat(chatUser) {
  showConfirmModal({
    title: 'Close Chat',
    message: `Are you sure you want to close your chat with ${chatUser}?`,
    confirmText: 'Close Chat',
    cancelText: 'Cancel',
    onConfirm: () => {
      // Remove from private chats
      privateChats.delete(chatUser);

      // If currently viewing this chat, switch to general
      if (activeChat.type === 'private' && activeChat.target === chatUser) {
        switchToRoomChat('general');
      }

      // Update UI
      updatePrivateChatsList();
    }
  });
}

// Switch back to a room chat
function switchToRoomChat(roomName) {
  // Update active chat
  activeChat = { type: 'room', target: roomName };

  // Update header
  updateChatHeader(roomName, 'room');

  // Join the room via socket
  socket.emit('join-room', roomName);

  // Display messages for this room
  displayChatMessages();

  // Add this to reload files when switching rooms
  const filesTab = document.querySelector('.tab-button[data-tab="files"]');
  if (filesTab && filesTab.classList.contains('active')) {
    loadFilesForCurrentRoom();
  }
}

// =====================
// Status UI Functions
// =====================

// Modify the status dropdown to include an "Idle" state
function enhanceStatusDropdown() {
  if (!statusSelect) return;

  // Add "Idle" option if it doesn't exist
  if (![...statusSelect.options].some(opt => opt.value === 'idle')) {
    const idleOption = document.createElement('option');
    idleOption.value = 'idle';
    idleOption.textContent = 'Idle';
    statusSelect.add(idleOption, statusSelect.options[1]); // Insert after "Online"
  }

  // Update the status dropdown styling
  const parentNode = statusSelect.parentNode;
  if (!parentNode.querySelector('.status-wrapper')) {
    const statusWrapper = document.createElement('div');
    statusWrapper.className = 'status-wrapper';
    parentNode.insertBefore(statusWrapper, statusSelect);
    statusWrapper.appendChild(statusSelect);

    // Create a status indicator next to the dropdown
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'status-indicator status-online';
    statusWrapper.insertBefore(statusIndicator, statusSelect);
  }
}

// Add custom styles for status indicators
function addCustomStatusStyles() {
  if (!document.getElementById('status-styles')) {
    const style = document.createElement('style');
    style.id = 'status-styles';
    style.textContent = `
      .status-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      
      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 5px;
      }
      
      .status-online {
        background-color: #2ecc71;
      }
      
      .status-idle {
        background-color: #f1c40f;
      }
      
      .status-away {
        background-color: #f39c12;
      }
      
      .status-busy {
        background-color: #e74c3c;
      }
      
      .status-offline {
        background-color: #95a5a6;
      }
      
      .manual-status-label {
        position: absolute;
        bottom: -20px;
        left: 0;
        font-size: 10px;
        color: #95a5a6;
        opacity: 1;
        transition: opacity 0.5s ease;
      }
      
      .user-list li .user-status.status-idle {
        background-color: #f1c40f;
      }
      
      .chat-container.connected {
        border-color: #2ecc71;
      }
      
      .chat-container:not(.connected) {
        border-color: #e74c3c;
      }
    `;
    document.head.appendChild(style);
  }
}

// Set up the status change listener
function setupStatusChangeListener() {
  if (statusSelect) {
    statusSelect.addEventListener('change', function () {
      const statusIndicator = document.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.className = `status-indicator status-${this.value}`;
      }

      // Show a "manual status" message
      const statusWrapper = document.querySelector('.status-wrapper');
      if (statusWrapper) {
        const existingLabel = statusWrapper.querySelector('.manual-status-label');
        if (existingLabel) {
          existingLabel.remove();
        }

        const manualLabel = document.createElement('div');
        manualLabel.className = 'manual-status-label';
        manualLabel.textContent = 'Manual status set';
        statusWrapper.appendChild(manualLabel);

        // Fade out after 3 seconds
        setTimeout(() => {
          manualLabel.style.opacity = '0';
          setTimeout(() => {
            if (manualLabel.parentNode) {
              manualLabel.parentNode.removeChild(manualLabel);
            }
          }, 500);
        }, 3000);
      }

      // Update user status
      updateUserInfo(null, false); // false means it's a manual change
    });
  }
}

// Combined function to setup enhanced status UI
function setupEnhancedStatusUI() {
  enhanceStatusDropdown();
  addCustomStatusStyles();
  setupStatusChangeListener();
}

// =====================
// UI Update Functions
// =====================

// Update the rooms list in the UI
function updateRoomsList() {
  roomList.innerHTML = '';

  if (!rooms || !Array.isArray(rooms)) {
    addDebugMessage("No rooms data available");
    return;
  }

  rooms.forEach(function (room) {
    const li = document.createElement('li');
    li.classList.add('room');

    if (activeChat.type === 'room' && room.name === activeChat.target) {
      li.classList.add('active');
    }

    li.textContent = room.name.charAt(0).toUpperCase() + room.name.slice(1);
    li.setAttribute('data-room', room.name);

    li.addEventListener('click', function () {
      const roomName = this.getAttribute('data-room');
      switchToRoomChat(roomName);
    });

    roomList.appendChild(li);
  });
}

// Update the groups list in the UI
function updateGroupsList() {
  if (!groupList) {
    console.error("Group list element not found");
    return;
  }

  groupList.innerHTML = '';

  console.log('Current groups:', groups);
  console.log('Current username:', username);

  if (!groups || !Array.isArray(groups)) {
    console.warn('Groups is not a valid array');
    return;
  }

  // Filter to show only groups where the current user is a member
  const userGroups = groups.filter(group =>
    group.members.includes(username)
  );

  console.log('User groups:', userGroups);

  userGroups.forEach(function (group) {
    const li = document.createElement('li');
    li.classList.add('group');
    li.setAttribute('data-group', group.name);

    if (activeChat.type === 'group' && group.name === activeChat.target) {
      li.classList.add('active');
    }

    const isOwner = group.owner === username;
    if (isOwner) {
      li.classList.add('owner');
    }

    // Debug logging
    console.log(`Group: ${group.name}, Owner: ${group.owner}, Current User: ${username}`);

    // Add group name and member count
    li.innerHTML = `
      <span class="group-name">${group.name}</span>
      <span class="group-count">${group.memberCount || group.members.length}</span>
      <div class="group-actions">
        ${!isOwner ?
        `<button class="group-action-btn leave-btn" title="Leave Group" data-group="${group.name}">
            <i class="fas fa-sign-out-alt"></i>
          </button>` :
        `<button class="group-action-btn delete-btn" title="Delete Group" data-group="${group.name}">
            <i class="fas fa-trash"></i>
          </button>`
      }
      </div>
    `;

    // Add click handler to switch to group chat
    li.addEventListener('click', function (e) {
      // Don't trigger if clicking on action buttons
      if (!e.target.closest('.group-actions')) {
        switchToGroupChat(group.name);
      }
    });

    groupList.appendChild(li);
  });
}

// Add event listeners for action buttons
document.querySelectorAll('.group-action-btn.leave-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const groupName = btn.getAttribute('data-group');
    console.log(`Attempting to leave group: ${groupName}`);
    leaveGroup(groupName);
  });
});

document.querySelectorAll('.group-action-btn.delete-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const groupName = btn.getAttribute('data-group');
    console.log(`Attempting to delete group: ${groupName}`);
    deleteGroup(groupName);
  });
});

// Add a CSS rule for clickable users
if (!document.getElementById('user-clickable-style')) {
  const style = document.createElement('style');
  style.id = 'user-clickable-style';
  style.textContent = `
      .user-clickable {
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .user-clickable:hover {
        background-color: rgba(103, 58, 183, 0.1);
      }
    `;
  document.head.appendChild(style);
}

// =====================
// Socket Event Listeners
// =====================

// Add this directly after the global variables section in main.js
// Make sure it's OUTSIDE any function and defined at the global scope

// Define updateUsersList globally
window.updateUsersList = function () {
  if (!userList) {
    console.error("User list element not found");
    return;
  }

  userList.innerHTML = '';

  if (!currentUsers || !Array.isArray(currentUsers)) {
    if (typeof addDebugMessage === 'function') {
      addDebugMessage("No users data available");
    }
    return;
  }

  let usersToShow = [];

  if (activeChat.type === 'room') {
    // Show users in current room
    usersToShow = currentUsers.filter(user =>
      user.currentRoom === currentRoom && user.authenticated
    );
  } else if (activeChat.type === 'group') {
    // Show users in current group
    const currentGroup = groups.find(g => g.name === activeChat.target);
    if (currentGroup) {
      usersToShow = currentUsers.filter(user =>
        currentGroup.members.includes(user.name) && user.authenticated
      );
    }
  }

  usersToShow.forEach(function (user) {
    const li = document.createElement('li');

    const statusClass = `status-${user.status}`;
    const lastSeenText = user.status === 'online'
      ? 'online'
      : `last seen ${window.getRelativeTime ? window.getRelativeTime(user.lastSeen) : 'recently'}`;

    li.innerHTML = `
      <span class="user-status ${statusClass}"></span>
      ${user.name}
      <span class="user-last-seen">${lastSeenText}</span>
    `;

    // Add click handler for private messaging
    if (user.name !== username) {
      li.classList.add('user-clickable'); // Add class for styling
      li.setAttribute('data-username', user.name); // Store username in data attribute

      // Make sure the click handler is properly assigned
      li.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const targetUsername = this.getAttribute('data-username');
        console.log(`Clicked on user: ${targetUsername}, initiating private chat`);
        switchToPrivateChat(targetUsername);
      });
    } else {
      li.classList.add('self');
    }

    userList.appendChild(li);
  });
};

function setupSocketEventListeners() {
  if (!socket) {
    console.error("Cannot set up event listeners, socket is not initialized");
    return;
  }

  // Clear any existing listeners
  ['user-list-update', 'room-changed', 'chat-message', 'private-message',
    'group-message', 'system-message', 'error-message', 'feedback',
    'room-users-count', 'clients-total'].forEach(event => {
      socket.off(event);
    });

  // Listen for client total count updates
  socket.on('clients-total', (count) => {
    console.log('Clients total:', count);

    if (roomUsersCount) {
      roomUsersCount.textContent = `${count} users`;
    }
  });

  // Update user, room, and group lists
  socket.on('user-list-update', function (data) {
    console.log('User list update received:', data);

    if (data.users) currentUsers = data.users;
    if (data.rooms) rooms = data.rooms;
    if (data.groups) groups = data.groups;

    updateUsersList();
    updateRoomsList();
    updateGroupsList();
  });

  // Room change notification
  socket.on('room-changed', function (data) {
    console.log('Room changed:', data);

    currentRoom = data.room;
    activeChat = { type: 'room', target: data.room };

    if (currentRoomTitle) {
      currentRoomTitle.textContent = data.room.charAt(0).toUpperCase() + data.room.slice(1);
    }

    // Clear message container and add room join message
    messageContainer.innerHTML = '';
    addSystemMessage(`You joined ${data.room}`);

    // Load saved messages for this room - with deduplication
    if (roomMessages[currentRoom]) {
      const displayedMessageIds = new Set();

      const uniqueMessages = roomMessages[currentRoom].filter(msg => {
        const msgId = `${msg.name}-${msg.message}-${new Date(msg.dateTime).getTime()}`;

        if (displayedMessageIds.has(msgId)) {
          return false;
        }

        displayedMessageIds.add(msgId);
        return true;
      });

      roomMessages[currentRoom] = uniqueMessages;

      uniqueMessages.forEach(msg => {
        const isOwnMessage = msg.name === username;
        addMessageToUI(isOwnMessage, msg, false);
      });

      saveRoomMessagesToLocalStorage();
    }

    updateUsersList();
    updateRoomsList();
  });

  // Regular chat message received
  socket.on('chat-message', function (data) {
    console.log('Chat message received:', data);

    if (messageTone) messageTone.play();

    const isOwnMessage = data.name === username;
    addMessageToUI(isOwnMessage, data, true);
  });

  // Private message received
  // Private message received
  socket.on('private-message', function (data) {
    console.log('Private message received:', data);

    if (messageTone) messageTone.play();

    // Determine if this is our own message or from someone else
    const isOwnMessage = data.name === username && !data.from;
    const otherParty = isOwnMessage ? data.to : (data.from || data.name);

    // Determine if we're currently viewing the correct private chat
    const isCorrectChatActive = (
      activeChat.type === 'private' &&
      activeChat.target === otherParty
    );

    // Only add to UI if we're in the correct chat view
    if (isCorrectChatActive) {
      addMessageToUI(isOwnMessage, data, true);
    } else {
      // If we're not in the correct chat, just save to history without displaying
      const storageKey = `private_${otherParty}`;

      if (!roomMessages[storageKey]) {
        roomMessages[storageKey] = [];
      }

      // Check for duplicates before adding to storage
      const isDuplicate = roomMessages[storageKey].some(msg =>
        msg.name === data.name &&
        msg.message === data.message &&
        Math.abs(new Date(msg.dateTime) - new Date(data.dateTime)) < 5000
      );

      if (!isDuplicate) {
        roomMessages[storageKey].push(data);
        saveRoomMessagesToLocalStorage();
      }

      // Add notification indicator for private chat
      const privateChatsItems = document.querySelectorAll('.private-chat');
      privateChatsItems.forEach(item => {
        if (item.getAttribute('data-user') === otherParty) {
          item.classList.add('new-message');
        }
      });
    }
  });

  // Group message received
  socket.on('group-message', function (data) {
    console.log('Group message received:', data);

    if (messageTone) messageTone.play();

    const isOwnMessage = data.name === username;
    // If this is our own message that we've already displayed, skip it
    if (isOwnMessage) {
      // Check if we've already shown a message with this content in last few seconds
      const now = new Date();
      const messageTime = new Date(data.dateTime).getTime();
      const recentMessages = Array.from(messageContainer.querySelectorAll('.message-right'))
        .filter(el => {
          const msgTime = parseInt(el.getAttribute('data-timestamp') || '0');
          return Math.abs(now.getTime() - msgTime) < 3000 &&
            el.textContent.includes(data.message);
        });

      if (recentMessages.length > 0) {
        console.log('Skipping server echo of our own message:', data.message);
        return;
      }
    }

    // CRITICAL FIX: Only display the message in the correct context
    if (activeChat.type === 'group' && activeChat.target === data.group) {
      addMessageToUI(isOwnMessage, data, true);
    } else {
      // If we're not viewing this group, just save to history without displaying
      // Save to room messages without displaying
      const storageKey = `group_${data.group}`;

      if (!roomMessages[storageKey]) {
        roomMessages[storageKey] = [];
      }

      // Check for duplicates before adding to storage
      const isDuplicate = roomMessages[storageKey].some(msg =>
        msg.name === data.name &&
        msg.message === data.message &&
        Math.abs(new Date(msg.dateTime) - new Date(data.dateTime)) < 5000
      );

      if (!isDuplicate) {
        roomMessages[storageKey].push(data);
        saveRoomMessagesToLocalStorage();
      }

      // Add notification indicator to the group in the sidebar
      const groupEl = document.querySelector(`.group[data-group="${data.group}"]`);
      if (groupEl) {
        groupEl.classList.add('new-message');
      }
    }
  });

  // System message received
  socket.on('system-message', function (data) {
    console.log('System message received:', data);
    addSystemMessage(data.message, data.type);
  });

  // Error message received
  socket.on('error-message', function (error) {
    console.error('Error message received:', error);
    addErrorMessage(error);
  });

  // Typing feedback
  socket.on('feedback', function (data) {
    clearFeedback();

    if (data.feedback) {
      // Only show the feedback if it matches the current active chat
      let shouldShow = false;

      if (data.chatType === 'room' && activeChat.type === 'room' && data.source === activeChat.target) {
        shouldShow = true;
      } else if (data.chatType === 'group' && activeChat.type === 'group' && data.source === activeChat.target) {
        shouldShow = true;
      } else if (data.chatType === 'private' && activeChat.type === 'private') {
        // For private chat, the source is the sender's username
        // We need to check if we're chatting with that person
        if (data.source === activeChat.target) {
          shouldShow = true;
        }
      }

      if (shouldShow) {
        const element = `
          <li class="message-feedback" data-chat-type="${data.chatType}" data-source="${data.source}">
            <p class="feedback" id="feedback">${data.feedback}</p>
          </li>
        `;
        messageContainer.innerHTML += element;
      }
    }
  });

  // Room user count update
  socket.on('room-users-count', function (data) {
    console.log('Room users count update:', data);

    if (activeChat.type === 'room' && data.room === activeChat.target && roomUsersCount) {
      roomUsersCount.textContent = `${data.count} users`;
    }
  });


  socket.on('room-user-added', function (data) {
    console.log('Room user added:', data);

    addSystemMessage(`${data.username} was added to room ${data.room}`);

    // Refresh user list if in the room management modal
    const modal = document.getElementById('room-management-modal');
    if (modal && modal.style.display === 'block') {
      loadRoomUsers(data.room);
      loadAvailableUsers(data.room);
    }

    // Update rooms list
    updateRoomsList();
  });

  socket.on('room-user-removed', function (data) {
    console.log('Room user removed:', data);

    addSystemMessage(`${data.username} was removed from room ${data.room}`);

    // Refresh user list if in the room management modal
    const modal = document.getElementById('room-management-modal');
    if (modal && modal.style.display === 'block') {
      loadRoomUsers(data.room);
      loadAvailableUsers(data.room);
    }

    // Update rooms list
    updateRoomsList();
  });

  socket.on('room-deleted', function (data) {
    console.log('Room deleted:', data);

    addSystemMessage(`Room ${data.room} has been deleted`);

    // If we're in the deleted room, switch to general
    if (activeChat.type === 'room' && activeChat.target === data.room) {
      switchToRoomChat('general');
    }

    // Update rooms list
    updateRoomsList();
  });

  socket.on('room-settings-updated', function (data) {
    console.log('Room settings updated:', data);

    addSystemMessage(`Room settings updated for ${data.room}`);

    // Update rooms list
    updateRoomsList();

    // Refresh room settings if in the room management modal
    const modal = document.getElementById('room-management-modal');
    if (modal && modal.style.display === 'block') {
      loadRoomSettings(data.room);
    }
  });
}

// =====================
// File Tab Functions
// =====================

// Initialize file tab functionality
function initializeFileTab() {
  // Cache file tab elements
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const uploadFileBtn = document.getElementById('upload-file-btn');
  const fileUploadInput = document.getElementById('file-upload-input');
  const uploadArea = document.getElementById('upload-area');
  const filesList = document.getElementById('files-list');
  
  // Set up tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update active tab pane
      tabPanes.forEach(pane => pane.classList.remove('active'));
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // If switching to files tab, load files for current room
      if (tabName === 'files') {
        loadFilesForCurrentRoom();
      }
    });

    // Inside initializeFileTab function
  if (uploadFileBtn) {
    uploadFileBtn.addEventListener('click', () => {
      // Allow Users, Managers, and Admins to upload files
      if (userRole === 'Admin' || userRole === 'User') {
        openUploadModal();
      } else {
        addSystemMessage('You do not have permission to upload files. Contact an admin.');
      }
    });
  }
  });
  
  // Handle upload button click
  if (uploadFileBtn) {
    uploadFileBtn.addEventListener('click', () => {
      if (userRole === 'Admin' || userRole === 'User') {
        openUploadModal();
      } else {
        addSystemMessage('You do not have permission to upload files. Contact an admin.');
      }
    });
  }
  
  // Handle file input change
  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        selectedFile = e.target.files[0];
        updateSelectedFileInfo();
      }
    });
  }
  
  // Set up upload area
  if (uploadArea) {
    uploadArea.addEventListener('click', () => {
      if (fileUploadInput) fileUploadInput.click();
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        selectedFile = e.dataTransfer.files[0];
        updateSelectedFileInfo();
      }
    });
  }
  
  // Cancel upload button
  const uploadCancelBtn = document.getElementById('upload-cancel-btn');
  if (uploadCancelBtn) {
    uploadCancelBtn.addEventListener('click', closeUploadModal);
  }
  
  // Confirm upload button
  const uploadConfirmBtn = document.getElementById('upload-confirm-btn');
  if (uploadConfirmBtn) {
    uploadConfirmBtn.addEventListener('click', uploadSelectedFile);
  }
  
  // Close modals on X click
  document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
      const modal = this.closest('.modal');
      if (modal) modal.style.display = 'none';
    });
  });
  
  // Close modals when clicking outside
  window.addEventListener('click', (e) => {
    document.querySelectorAll('.modal').forEach(modal => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
  
  // Download button in preview
  const previewDownloadBtn = document.getElementById('preview-download-btn');
  if (previewDownloadBtn) {
    previewDownloadBtn.addEventListener('click', () => {
      if (activeFilePreview) {
        downloadFile(activeFilePreview);
      }
    });
  }
}

// Update selected file info in upload modal
function updateSelectedFileInfo() {
  if (!selectedFile) return;
  
  const selectedFilenameElem = document.getElementById('selected-filename');
  const selectedFilesizeElem = document.getElementById('selected-filesize');
  const selectedFileInfoDiv = document.querySelector('.selected-file-info');
  
  if (selectedFilenameElem && selectedFilesizeElem && selectedFileInfoDiv) {
    selectedFilenameElem.textContent = selectedFile.name;
    selectedFilesizeElem.textContent = formatFileSize(selectedFile.size);
    selectedFileInfoDiv.style.display = 'block';
  }
}

// Format file size to human-readable
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get file icon based on file type
function getFileIcon(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  
  const fileIcons = {
    // Documents
    'doc': '<i class="fas fa-file-word file-type-document"></i>',
    'docx': '<i class="fas fa-file-word file-type-document"></i>',
    'txt': '<i class="fas fa-file-alt file-type-document"></i>',
    'rtf': '<i class="fas fa-file-alt file-type-document"></i>',
    
    // Spreadsheets
    'xls': '<i class="fas fa-file-excel file-type-spreadsheet"></i>',
    'xlsx': '<i class="fas fa-file-excel file-type-spreadsheet"></i>',
    'csv': '<i class="fas fa-file-csv file-type-spreadsheet"></i>',
    
    // Presentations
    'ppt': '<i class="fas fa-file-powerpoint file-type-presentation"></i>',
    'pptx': '<i class="fas fa-file-powerpoint file-type-presentation"></i>',
    
    // Images
    'jpg': '<i class="fas fa-file-image file-type-image"></i>',
    'jpeg': '<i class="fas fa-file-image file-type-image"></i>',
    'png': '<i class="fas fa-file-image file-type-image"></i>',
    'gif': '<i class="fas fa-file-image file-type-image"></i>',
    'svg': '<i class="fas fa-file-image file-type-image"></i>',
    
    // PDFs
    'pdf': '<i class="fas fa-file-pdf file-type-pdf"></i>',
    
    // Archives
    'zip': '<i class="fas fa-file-archive file-type-archive"></i>',
    'rar': '<i class="fas fa-file-archive file-type-archive"></i>',
    'tar': '<i class="fas fa-file-archive file-type-archive"></i>',
    'gz': '<i class="fas fa-file-archive file-type-archive"></i>',
    
    // Code
    'js': '<i class="fas fa-file-code file-type-code"></i>',
    'html': '<i class="fas fa-file-code file-type-code"></i>',
    'css': '<i class="fas fa-file-code file-type-code"></i>',
    'php': '<i class="fas fa-file-code file-type-code"></i>',
    'py': '<i class="fas fa-file-code file-type-code"></i>',
    'json': '<i class="fas fa-file-code file-type-code"></i>',
    
    // Audio
    'mp3': '<i class="fas fa-file-audio file-type-audio"></i>',
    'wav': '<i class="fas fa-file-audio file-type-audio"></i>',
    'ogg': '<i class="fas fa-file-audio file-type-audio"></i>',
    
    // Video
    'mp4': '<i class="fas fa-file-video file-type-video"></i>',
    'avi': '<i class="fas fa-file-video file-type-video"></i>',
    'mov': '<i class="fas fa-file-video file-type-video"></i>',
    'wmv': '<i class="fas fa-file-video file-type-video"></i>',
  };
  
  return fileIcons[extension] || '<i class="fas fa-file file-type-other"></i>';
}

// Open file upload modal
function openUploadModal() {
  const modal = document.getElementById('file-upload-modal');
  if (modal) {
    // Reset the form
    selectedFile = null;
    document.querySelector('.selected-file-info').style.display = 'none';
    document.getElementById('file-upload-input').value = '';
    
    // Show the modal
    modal.style.display = 'block';
  }
}

// Close file upload modal
function closeUploadModal() {
  const modal = document.getElementById('file-upload-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Upload the selected file
function uploadSelectedFile() {
  if (!selectedFile) {
    alert('Please select a file to upload.');
    return;
  }
  
  if (!authenticated) {
    alert('You must be logged in to upload files.');
    return;
  }

  // Disable upload button to prevent multiple submissions
  const uploadConfirmBtn = document.getElementById('upload-confirm-btn');
  uploadConfirmBtn.disabled = true;
  uploadConfirmBtn.textContent = 'Uploading...';
  
  // Create FormData
  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('room', currentRoom);

  // Add chat context information
  formData.append('chatType', activeChat.type);
  formData.append('chatTarget', activeChat.target);

  // Add privacy setting
  const isPrivate = document.getElementById('file-privacy-toggle')?.checked || false;
  formData.append('private', isPrivate);
  
  // Get token from localStorage
  const token = localStorage.getItem('chatToken');
  
  // Upload file
  fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('File uploaded successfully:', data);
    
     // Only add to roomFiles if not already present
     if (!roomFiles[currentRoom]) {
      roomFiles[currentRoom] = [];
    }
    
    // Check if file already exists to prevent duplicates
    const fileExists = roomFiles[currentRoom].some(file => 
      file.filename === data.filename || 
      (file.originalName === selectedFile.name && file.size === selectedFile.size)
    );
    
    if (!fileExists) {
      // Add the new file
      const newFile = {
        filename: data.filename,
        originalName: selectedFile.name,
        size: selectedFile.size,
        uploadedBy: username,
        uploadedAt: new Date(),
        type: selectedFile.type,
        isPrivate: isPrivate
      };
      
      roomFiles[currentRoom].push(newFile);
      
    // Update the files list
    updateFilesList();
    }
    
    // Close the upload modal
    closeUploadModal();

    /*
    // Show file permissions modal with slight delay to ensure DOM is updated
    if (isPrivate) {
      setTimeout(() => {
        openFilePermissionsModal(data.filename);
      }, 300);
    }
    */
    
    // Add a message in the chat about the file upload
    const fileShareMessage = {
      name: 'System',
      message: `${username} shared a file: ${selectedFile.name}`,
      dateTime: new Date(),
      room: currentRoom,
      isSystemMessage: true,
      isFileMessage: true,
      fileInfo: {
        filename: data.filename,
        originalName: selectedFile.name,
        size: selectedFile.size
      }
    };
    
    // Announce in chat
    socket.emit('message', fileShareMessage);
    addSystemMessage(`You shared a file: ${selectedFile.name}`);
    
    // Reset the selection
    selectedFile = null;
  })
  .catch(error => {
    console.error('Error uploading file:', error);
    alert(`Error uploading file: ${error.message}`);
  })
  .finally(() => {
    // Re-enable upload button
    uploadConfirmBtn.disabled = false;
    uploadConfirmBtn.textContent = 'Upload';
  });
}

/*
function openFilePermissionsModal(filename) {
  console.log("Opening permissions modal for file:", filename);
  
  // Get the file info
  const fileInfo = roomFiles[currentRoom]?.find(f => f.filename === filename);
  if (!fileInfo) {
    console.error("File not found in room files:", filename);
    return;
  }
  
  // Create modal if it doesn't exist
  let permissionModal = document.getElementById('file-permissions-modal');
  
  // Make sure we have the modal in the DOM
  if (!permissionModal) {
    console.error("Permissions modal not found in DOM, this shouldn't happen");
    return;
  }
  

  // Set active file
  permissionModal.setAttribute('data-filename', filename);
  
  // Set file name in modal
  const permissionFilename = document.getElementById('permission-filename');
  if (permissionFilename) {
    permissionFilename.textContent = fileInfo.originalName || filename;
  }
  
  // Load current permissions
  loadFilePermissions(filename);
  

  // Show modal - ensure it's visible
  permissionModal.style.display = 'block';
  
  // Log for debugging
  console.log("Permissions modal should now be visible");
} 
*/

// Load file permissions
function loadFilePermissions(filename) {
  // Get token
  const token = localStorage.getItem('chatToken');
  
  // Fetch permissions
  fetch(`/api/files/${filename}/access`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('File permissions loaded:', data);
    
    // Set default access radio buttons
    const defaultAccess = data.accessControl?.default || 'private';
    document.querySelector(`input[name="default-access"][value="${defaultAccess}"]`).checked = true;
    
    // Populate user select dropdown with online users
    const userSelect = document.getElementById('permission-user-select');
    userSelect.innerHTML = '<option value="">Select user...</option>';
    
    // Add all users except file owner
    currentUsers.forEach(user => {
      // Skip users already in the permissions list and the file owner
      if (user.name === data.uploadedBy || 
          data.accessControl?.users?.[user.name]) {
        return;
      }
      
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      userSelect.appendChild(option);
    });
  })
  .catch(error => {
    console.error('Error loading file permissions:', error);
    alert(`Error loading permissions: ${error.message}`);
  });
}

// Load files for current room
function loadFilesForCurrentRoom() {
  const filesList = document.getElementById('files-list');
  if (!filesList) return;
  
  // Get the token from localStorage
  const token = localStorage.getItem('chatToken');

  // Use active chat context for loading files
  const chatType = activeChat.type;
  const chatTarget = activeChat.target;
  const storageKey = getChatStorageKey(chatType, chatTarget);
  
  console.log(`Loading files for ${chatType}: ${chatTarget}`);
  
  // Fetch files for the current chat context
  fetch(`/api/files?room=${currentRoom}&chatType=${chatType}&chatTarget=${chatTarget}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      // If 403, user doesn't have permission
      if (response.status === 403) {
        filesList.innerHTML = `
          <li class="no-files-message">
            You don't have permission to view files. Contact an admin for access.
          </li>
        `;
        throw new Error('Permission denied');
      }
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('Files retrieved successfully:', data);
    
    // Update files for this chat context
    roomFiles[storageKey] = data.files || [];
    
    // Update the list
    updateFilesList();
  })
  .catch(error => {
    console.error('Error loading files:', error);
    
    if (error.message !== 'Permission denied') {
      filesList.innerHTML = `
        <li class="no-files-message">
          Error loading files. ${error.message}
        </li>
      `;
    }
  });
}

// Helper function to get storage key for chat context
function getChatStorageKey(type, target) {
  if (type === 'group') {
    return `group_${target}`;
  } else if (type === 'private') {
    return `private_${target}`;
  } else {
    return target; // room name for room type
  }
}

// Update the files list in the UI
function updateFilesList() {
  const filesList = document.getElementById('files-list');
  if (!filesList) return;
  
  // Get the current chat context
  const chatType = activeChat.type;
  const chatTarget = activeChat.target;
  const storageKey = getChatStorageKey(chatType, chatTarget);
  
  // Check if there are files for this context
  if (!roomFiles[storageKey] || roomFiles[storageKey].length === 0) {
    filesList.innerHTML = `
      <li class="no-files-message">
        No files have been shared in this ${chatType} yet.
      </li>
    `;
    return;
  }

  // Sort files by upload date (newest first)
  const sortedFiles = [...roomFiles[storageKey]].sort((a, b) => {
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });
  
  // Generate HTML for files
  let filesHTML = '';
  
  sortedFiles.forEach(file => {
    // Skip files from other chat contexts (in case there's a mismatch in the data)
    if (file.chatContext && 
        (file.chatContext.type !== chatType || file.chatContext.target !== chatTarget)) {
      return;
    }
    
    const fileIcon = getFileIcon(file.originalName || file.filename);
    
    // Format date without using moment.js
    const fileDate = formatDate(file.uploadedAt);
    const fileSize = formatFileSize(file.size);
    
    // Generate file privacy indicator
    const privacyIndicator = file.isPrivate ? 
      '<span class="file-privacy-indicator file-privacy-private"><i class="fas fa-lock"></i> Private</span>' : 
      '<span class="file-privacy-indicator file-privacy-public"><i class="fas fa-globe"></i> Public</span>';
    
    // Determine available actions based on user role
    let actionsHTML = `
      <button class="file-action-btn file-preview-btn" data-filename="${file.filename}" title="Preview">
        <i class="fas fa-eye"></i>
      </button>
    `;
    
    // Add download and delete buttons based on permissions
    if (userRole === 'Admin' || file.uploadedBy === username) {
      actionsHTML += `
        <button class="file-action-btn file-download-btn" data-filename="${file.filename}" title="Download">
          <i class="fas fa-download"></i>
        </button>
      `;
    }
    
    // Add delete button for admins and file owners
    if (userRole === 'Admin' || file.uploadedBy === username) {
      actionsHTML += `
        <button class="file-action-btn file-delete-btn" data-filename="${file.filename}" title="Delete">
          <i class="fas fa-trash-alt"></i>
        </button>
      `;
    }
    
    filesHTML += `
      <li>
        <div class="file-name-wrapper">
          ${fileIcon}
          <span class="file-name" title="${file.originalName || file.filename}">
            ${file.originalName || file.filename}
          </span>
          <span class="file-size">(${fileSize})</span>
          ${privacyIndicator}
        </div>
        <div class="file-uploader">
          ${file.uploadedBy || 'Unknown'}
          ${file.uploadedBy === username ? '<span class="permission-badge permission-admin">You</span>' : ''}
        </div>
        <div class="file-date">${fileDate}</div>
        <div class="file-actions-wrapper">
          ${actionsHTML}
        </div>
      </li>
    `;
  });
  
  filesList.innerHTML = filesHTML;
  
  // Add event listeners to buttons
  filesList.querySelectorAll('.file-preview-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const filename = e.currentTarget.getAttribute('data-filename');
      previewFile(filename);
    });
  });
  
  filesList.querySelectorAll('.file-download-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const filename = e.currentTarget.getAttribute('data-filename');
      downloadFile(filename);
    });
  });
  
  filesList.querySelectorAll('.file-delete-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const filename = e.currentTarget.getAttribute('data-filename');
      deleteFile(filename);
    });
  });
}

// Preview a file
function previewFile(filename) {
  // Set the active file
  activeFilePreview = filename;
  
  // Get the file info
  const fileInfo = roomFiles[currentRoom]?.find(f => f.filename === filename);
  if (!fileInfo) return;
  
  // Update the modal title
  const previewFilename = document.getElementById('preview-filename');
  if (previewFilename) {
    previewFilename.textContent = fileInfo.originalName || fileInfo.filename;
  }
  
  // Prepare the preview content based on file type
  const previewContent = document.getElementById('preview-content');
  if (!previewContent) return;
  
  // Get file extension
  const extension = (fileInfo.originalName || fileInfo.filename).split('.').pop().toLowerCase();
  
  // Clear previous content
  previewContent.innerHTML = '';
  
  // Get file URL (using the token)
  const token = localStorage.getItem('chatToken');
  const fileUrl = `/api/files/${filename}?token=${token}`;
  
  // Generate preview based on file type
  if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
    // Image preview
    const img = document.createElement('img');
    img.src = fileUrl;
    img.className = 'preview-image';
    img.alt = fileInfo.originalName || fileInfo.filename;
    previewContent.appendChild(img);
  } else if (['mp4', 'webm', 'ogg'].includes(extension)) {
    // Video preview
    const video = document.createElement('video');
    video.src = fileUrl;
    video.controls = true;
    video.style.width = '100%';
    previewContent.appendChild(video);
  } else if (['mp3', 'wav'].includes(extension)) {
    // Audio preview
    const audio = document.createElement('audio');
    audio.src = fileUrl;
    audio.controls = true;
    audio.style.width = '100%';
    previewContent.appendChild(audio);
  } else if (['pdf'].includes(extension)) {
    // PDF preview (iframe)
    const iframe = document.createElement('iframe');
    iframe.src = fileUrl;
    iframe.className = 'preview-iframe';
    previewContent.appendChild(iframe);
  } else if (['txt', 'js', 'html', 'css', 'json', 'xml', 'md', 'csv'].includes(extension)) {
    // Text preview - fetch and display
    fetch(fileUrl)
      .then(response => response.text())
      .then(text => {
        const pre = document.createElement('pre');
        pre.textContent = text;
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.overflow = 'auto';
        previewContent.appendChild(pre);
      })
      .catch(error => {
        previewContent.innerHTML = `<div class="error-message">Error loading file: ${error.message}</div>`;
      });
  } else {
    // Generic preview for other file types
    previewContent.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 60px; margin-bottom: 20px;">
          ${getFileIcon(fileInfo.originalName || fileInfo.filename)}
        </div>
        <h3>${fileInfo.originalName || fileInfo.filename}</h3>
        <p>Size: ${formatFileSize(fileInfo.size)}</p>
        <p>Uploaded by: ${fileInfo.uploadedBy || 'Unknown'}</p>
        <p>Uploaded on: ${moment(fileInfo.uploadedAt).format('MMM D, YYYY h:mm A')}</p>
        <p class="preview-note">Preview not available for this file type. Click download to view the file.</p>
      </div>
    `;
  }
  
  // Update download button visibility based on permissions
  const downloadBtn = document.getElementById('preview-download-btn');
  if (downloadBtn) {
    if (userRole === 'Admin' || userRole === 'Manager' || fileInfo.uploadedBy === username) {
      downloadBtn.style.display = 'block';
    } else {
      downloadBtn.style.display = 'none';
    }
  }
  
  // Show the modal
  const modal = document.getElementById('file-preview-modal');
  if (modal) {
    modal.style.display = 'block';
  }
}

// Download a file
function downloadFile(filename) {
  // Get the file info
  const fileInfo = roomFiles[currentRoom]?.find(f => f.filename === filename);
  if (!fileInfo) return;
  
  // Check permissions
  if (userRole !== 'Admin' && userRole !== 'Manager' && fileInfo.uploadedBy !== username) {
    alert('You do not have permission to download this file.');
    return;
  }
  
  // Get token
  const token = localStorage.getItem('chatToken');
  
  // Create a temporary anchor to trigger download
  const a = document.createElement('a');
  a.href = `/api/files/${filename}?token=${token}`;
  a.download = fileInfo.originalName || filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Delete a file
function deleteFile(filename) {
  if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
    return;
  }
 
  // Get the file info
  const fileInfo = roomFiles[currentRoom]?.find(f => f.filename === filename);
  if (!fileInfo) return;
 
  // Get admin status directly from JWT token
  const token = localStorage.getItem('chatToken');
  let isAdmin = false;
 
  try {
    // Parse JWT token
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
 
    const payload = JSON.parse(jsonPayload);
    isAdmin = payload.role === 'Admin';
  } catch (e) {
    console.error('Error parsing token:', e);
  }
 
  // Check permissions using token-derived admin status
  if (!isAdmin && fileInfo.uploadedBy !== username) {
    alert('You do not have permission to delete this file.');
    return;
  }
 
  // Delete the file
  fetch(`/api/files/${filename}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log('File deleted successfully:', data);
    
    // Remove file from room files
    if (roomFiles[currentRoom]) {
      roomFiles[currentRoom] = roomFiles[currentRoom].filter(f => f.filename !== filename);
    }
   
    // Update the files list
    updateFilesList();
   
    // Add a message in the chat
    addSystemMessage(`File ${fileInfo.originalName || filename} has been deleted.`);
  })
  .catch(error => {
    console.error('Error deleting file:', error);
    alert(`Error deleting file: ${error.message}`);
  });
}


// Get user role from JWT token
function getUserRoleFromToken() {
  const token = localStorage.getItem('chatToken');
  if (!token) return 'viewer';
  
  try {
    // Parse JWT token (without validation - the server does that)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const payload = JSON.parse(jsonPayload);

    console.log('Token payload:', payload);
    return payload.role || 'viewer';
  } catch (e) {
    console.error('Error parsing token:', e);
    return 'viewer';
  }
}

// Update RBAC permissions handler
function updateUserPermissions() {
  // Get role from token
  userRole = getUserRoleFromToken();
  console.log('User role set to:', userRole);

  // Update UI based on role
  const uploadBtn = document.getElementById('upload-file-btn');
  if (uploadBtn) {
    console.log('Current display style:', uploadBtn.style.display);
    
    // First try using style.display
    if (userRole === 'Admin' || userRole === 'User') {
      uploadBtn.style.display = 'flex'; // Use flex to match the container's display
      console.log('Setting upload button to visible (flex)');
    } 
    
    // Fallback: add/remove a hide class
    uploadBtn.classList.toggle('hidden', !(userRole === 'Admin' || userRole === 'User'));
  } else {
    console.error('Upload button not found in the DOM');
  }
}

// Handle file-related socket events
function setupFileSocketEvents() {
  if (!socket) return;
  
  // File shared event
  socket.on('file-shared', function(data) {
    // Add to room files if in the same room
    if (data.room === currentRoom) {
      if (!roomFiles[currentRoom]) {
        roomFiles[currentRoom] = [];
      }
      
      roomFiles[currentRoom].push(data.fileInfo);
      
      // Update files list if on files tab
      const filesTab = document.querySelector('.tab-button[data-tab="files"]');
      if (filesTab && filesTab.classList.contains('active')) {
        updateFilesList();
      }
      
      // Add system message
      addSystemMessage(`${data.username} shared a file: ${data.fileInfo.originalName || data.fileInfo.filename}`);
    }
  });

  // Add this to your setupFileSocketEvents function
  socket.on('file-access-updated', function(data) {
    if (data.room === currentRoom && roomFiles[currentRoom]) {
      // Find and update the file in our local cache
      const fileIndex = roomFiles[currentRoom].findIndex(f => f.filename === data.filename);
      if (fileIndex !== -1) {
        roomFiles[currentRoom][fileIndex].isPrivate = data.isPrivate;
        
        // Update files list if on files tab
        const filesTab = document.querySelector('.tab-button[data-tab="files"]');
        if (filesTab && filesTab.classList.contains('active')) {
          updateFilesList();
        }
        
        // Add system message
        addSystemMessage(`${data.updatedBy} updated access settings for a file`);
      }
  }
});
  
  // File deleted event
  socket.on('file-deleted', function(data) {
    // Remove from room files if in the same room
    if (data.room === currentRoom && roomFiles[currentRoom]) {
      roomFiles[currentRoom] = roomFiles[currentRoom].filter(f => f.filename !== data.filename);
      
      // Update files list if on files tab
      const filesTab = document.querySelector('.tab-button[data-tab="files"]');
      if (filesTab && filesTab.classList.contains('active')) {
        updateFilesList();
      }
      
      // Add system message
      addSystemMessage(`${data.username} deleted a file: ${data.originalName || data.filename}`);
    }
  });
}

// Initialize everything related to files when authenticated
function initializeFileFeatures() {
  // Initialize file tab
  initializeFileTab();
  
  // Get role and update permissions
  updateUserPermissions();
  
  // Setup file socket events
  setupFileSocketEvents();
}


// =====================
// Event Listeners
// =====================
// DOM ready event to ensure all elements are loaded
document.addEventListener('DOMContentLoaded', function () {
  chatHeader = document.querySelector('.chat-header');
  console.log('DOM content loaded, setting up event listeners');

  // Function to setup admin UI elements - fixed single implementation
  function setupAdminUIElements() {
    console.log('Setting up admin UI elements');

    // Get user role 
    userRole = getUserRoleFromToken();
    console.log('Current user role:', userRole);

    // Select room and group creation elements
    const createRoomBtn = document.querySelector('.create-room-btn');
    const newRoomInput = document.querySelector('.new-room-input');
    const createGroupBtn = document.getElementById('create-group-btn');
    const newGroupInput = document.getElementById('new-group-input');

    // Update visibility based on role
    if (userRole === 'Admin') {
      console.log('User is admin, showing room/group creation controls');
      if (createRoomBtn) createRoomBtn.style.display = 'block';
      if (newRoomInput) newRoomInput.style.display = 'block';
      if (createGroupBtn) createGroupBtn.style.display = 'block';
      if (newGroupInput) newGroupInput.style.display = 'block';
    } else {
      console.log('User is not admin, hiding room/group creation controls');
      if (createRoomBtn) createRoomBtn.style.display = 'none';
      if (newRoomInput) newRoomInput.style.display = 'none';
      if (createGroupBtn) createGroupBtn.style.display = 'none';
      if (newGroupInput) newGroupInput.style.display = 'none';
    }

    // Refresh chatHeader reference
    chatHeader = document.querySelector('.chat-header');
  }

  // Function to check admin/manager permissions
  function hasRoomCreationPermission() {
    if (userRole !== 'Admin' && userRole !== 'Manager') {
      addErrorMessage('You do not have permission to perform this action');
      return false;
    }
    return true;
  }

  // Check for stored token and attempt auto-login
  const storedToken = localStorage.getItem('chatToken');
  if (storedToken) {
    fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${storedToken}`
      }
    })
      .then(response => {
        if (response.ok) return response.json();
        throw new Error('Invalid token');
      })
      .then(data => {
        console.log('Auto-login successful:', data);

        // Set username and role
        username = data.username;
        authenticated = true;
        userRole = data.role || 'viewer';

        // Update UI
        if (usernameDisplay) usernameDisplay.textContent = username;

        // Hide auth container, show chat
        document.getElementById('auth-container').style.display = 'none';
        document.querySelector('.chat-container').style.display = 'flex';

        // Initialize socket
        initializeSocketConnection(storedToken);

        // Initialize file features
        initializeFileFeatures();

        // Setup admin UI elements
        setupAdminUIElements();
      })
      .catch(error => {
        console.warn('Auto-login failed:', error);
        localStorage.removeItem('chatToken');
      });
  }

  // Tab switching
  if (loginTab) {
    loginTab.addEventListener('click', switchToLoginTab);
  }

  if (registerTab) {
    registerTab.addEventListener('click', switchToRegisterTab);
  }

  // Handle register form submission
  if (document.getElementById('register-form')) {
    document.getElementById('register-form').addEventListener('submit', function (e) {
      e.preventDefault();

      const username = document.getElementById('register-username').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const confirmPassword = document.getElementById('register-confirm-password').value;
      const messageElement = document.getElementById('register-message');

      if (!username || !email || !password || !confirmPassword) {
        messageElement.textContent = 'All fields are required';
        messageElement.style.color = '#e74c3c';
        return;
      }

      if (password !== confirmPassword) {
        messageElement.textContent = 'Passwords do not match';
        messageElement.style.color = '#e74c3c';
        return;
      }

      fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      })
        .then(response => response.json())
        .then(data => {
          if (data.message === 'User created successfully') {
            messageElement.textContent = 'Registration successful! You can now login.';
            messageElement.style.color = '#2ecc71';

            document.getElementById('register-username').value = '';
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-confirm-password').value = '';

            setTimeout(() => {
              switchToLoginTab();
            }, 2000);
          } else {
            messageElement.textContent = data.message || 'Registration failed';
            messageElement.style.color = '#e74c3c';
          }
        })
        .catch(error => {
          messageElement.textContent = 'Server error, please try again';
          messageElement.style.color = '#e74c3c';
          console.error('Registration error:', error);
        });
    });
  }

  // Handle login form submission
  if (document.getElementById('login-form')) {
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();

      const loginUsername = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const messageElement = document.getElementById('login-message');

      if (!loginUsername || !password) {
        messageElement.textContent = 'Username and password are required';
        messageElement.style.color = '#e74c3c';
        return;
      }

      fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: loginUsername, password })
      })
        .then(response => response.json())
        .then(data => {
          console.log('Login response:', data);

          if (data.message.includes('OTP sent')) {
            // Store username for OTP verification
            window.currentLoginUsername = loginUsername;

            // Show OTP form and hide login form
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('otp-form').style.display = 'flex';

            document.getElementById('otp-message').textContent = 'Please enter the OTP sent to your email (or check console)';

            // TEMPORARY: Pre-fill OTP field for testing
            if (data.testOtp) {
              document.getElementById('otp').value = data.testOtp;
            }

            document.getElementById('otp').focus();
          } else {
            messageElement.textContent = data.message || 'Login failed';
            messageElement.style.color = '#e74c3c';
          }
        })
        .catch(error => {
          messageElement.textContent = 'Server error, please try again';
          messageElement.style.color = '#e74c3c';
          console.error('Login error:', error);
        });
    });
  }

  // Handle OTP form submission
  if (document.getElementById('otp-form')) {
    document.getElementById('otp-form').addEventListener('submit', function (e) {
      e.preventDefault();

      const otp = document.getElementById('otp').value.trim();
      const verifyUsername = window.currentLoginUsername;
      const messageElement = document.getElementById('otp-message');

      if (!otp) {
        messageElement.textContent = 'Please enter the OTP';
        messageElement.style.color = '#e74c3c';
        return;
      }

      if (!verifyUsername) {
        messageElement.textContent = 'Session expired, please login again';
        messageElement.style.color = '#e74c3c';

        // Reset to login form
        document.getElementById('otp-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'flex';
        return;
      }

      fetch('/api/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: verifyUsername, otp })
      })
        .then(response => response.json())
        .then(data => {
          console.log('OTP verification response:', data);

          if (data.message === 'Authentication successful') {
            // Set variables
            username = data.user.username;
            authenticated = true;
            userRole = data.user.role || 'viewer';

            // Save token from response
            if (data.token) {
              localStorage.setItem('chatToken', data.token);
            }

            // Update username display
            if (usernameDisplay) {
              usernameDisplay.textContent = data.user.username;
            }

            // Hide auth container and show chat container
            document.getElementById('auth-container').style.display = 'none';
            document.querySelector('.chat-container').style.display = 'flex';

            // Initialize socket connection with auth token
            initializeSocketConnection(data.token);

            // Initialize file features
            initializeFileFeatures();

            // Focus on message input
            messageInput.focus();

            // Add debug info
            setTimeout(function () {
              console.log('--- Debug Information ---');
              console.log('Socket connected:', socket?.connected);
              console.log('Socket ID:', socket?.id);
              console.log('Authentication token:', data.token?.substring(0, 10) + '...');
              console.log('Current username:', username);
              console.log('User role:', userRole);

              addSystemMessage(`Connected as ${username}`, 'info');
            }, 1000);
          } else {
            messageElement.textContent = data.message || 'OTP verification failed';
            messageElement.style.color = '#e74c3c';
          }
        })
        .catch(error => {
          messageElement.textContent = 'Server error, please try again';
          messageElement.style.color = '#e74c3c';
          console.error('OTP verification error:', error);
        });
    });
  }

  // Logout functionality
  if (document.getElementById('logout-button')) {
    document.getElementById('logout-button').addEventListener('click', function () {
      fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
        .then(response => response.json())
        .then(data => {
          // Clear local storage
          localStorage.removeItem('chatToken');

          // Reset variables
          username = '';
          authenticated = false;

          // Disconnect socket
          if (socket) {
            socket.disconnect();
          }

          // Show auth container and hide chat container
          document.getElementById('auth-container').style.display = 'block';
          document.querySelector('.chat-container').style.display = 'none';

          // Reset forms
          document.getElementById('login-form').style.display = 'flex';
          document.getElementById('register-form').style.display = 'none';
          document.getElementById('otp-form').style.display = 'none';
          document.getElementById('login-username').value = '';
          document.getElementById('login-password').value = '';
          document.getElementById('login-message').textContent = '';
        })
        .catch(error => {
          console.error('Logout error:', error);
        });
    });
  }

  // Messages
  if (sendButton) {
    sendButton.addEventListener('click', function () {
      sendMessage();
    });
  }

  if (messageInput) {
    messageInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        sendMessage();
        e.preventDefault();
      }
    });

    // Typing indicators
    messageInput.addEventListener('focus', function () {
      if (authenticated && socket) {
        // Include chat context in the feedback
        const feedbackData = {
          feedback: true,
          chatType: activeChat.type
        };

        // Add appropriate context based on the active chat type
        if (activeChat.type === 'room') {
          feedbackData.source = activeChat.target; // The room name
        } else if (activeChat.type === 'group') {
          feedbackData.source = activeChat.target; // The group name
        } else if (activeChat.type === 'private') {
          feedbackData.source = activeChat.target; // The recipient username
        }

        socket.emit('feedback', feedbackData);
      }
    });

    // Also when blurring the input
    messageInput.addEventListener('blur', function () {
      if (authenticated && socket) {
        // Include chat context in the feedback
        const feedbackData = {
          feedback: false,
          chatType: activeChat.type
        };

        // Add appropriate context based on the active chat type
        if (activeChat.type === 'room') {
          feedbackData.source = activeChat.target; // The room name
        } else if (activeChat.type === 'group') {
          feedbackData.source = activeChat.target; // The group name
        } else if (activeChat.type === 'private') {
          feedbackData.source = activeChat.target; // The recipient username
        }

        socket.emit('feedback', feedbackData);
      }
    });

    // User status
    if (statusSelect) {
      statusSelect.addEventListener('change', function () {
        updateUserInfo(null, false);
      });
    }

    // Room creation - with permission check
    if (document.getElementById('create-room-btn')) {
      document.getElementById('create-room-btn').addEventListener('click', function () {
        // Check permission first
        if (!hasRoomCreationPermission()) return;

        const newRoomInput = document.getElementById('new-room-input');
        const roomName = newRoomInput.value.trim();

        if (roomName && socket) {
          socket.emit('join-room', roomName);
          newRoomInput.value = '';
        }
      });
    }
  }

  if (document.getElementById('new-room-input')) {
    document.getElementById('new-room-input').addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        // Check permission first
        if (!hasRoomCreationPermission()) {
          e.preventDefault();
          return;
        }

        const roomName = this.value.trim();

        if (roomName && socket) {
          socket.emit('join-room', roomName);
          this.value = '';
        }
        e.preventDefault();
      }
    });
  }

  // Group creation - with permission check
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', function () {
      // Check permission first
      if (!hasRoomCreationPermission()) return;

      createNewGroup();
    });
  }

  if (newGroupInput) {
    newGroupInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        // Check permission first
        if (!hasRoomCreationPermission()) {
          e.preventDefault();
          return;
        }

        createNewGroup();
        e.preventDefault();
      }
    });
  }

  // Load saved messages
  loadRoomMessagesFromLocalStorage();
});

// Send heartbeat to maintain presence
setInterval(function () {
  if (authenticated && socket) {
    socket.emit('heartbeat');
  }
}, 30000);