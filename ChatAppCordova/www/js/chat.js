// Chat functionality
document.addEventListener("DOMContentLoaded", () => {
  // Check if user is logged in
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const username = localStorage.getItem("username");

  if (!token || !userId) {
    window.location.href = "/index.html";
    return;
  }

  // Display current user information
  const currentUsernameElement = document.getElementById("current-username");
  if (currentUsernameElement) {
    currentUsernameElement.textContent = username;
  }

  // Notification sound
  const notificationSound = document.getElementById("notification-sound");

  // Logout button
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    window.location.href = "/index.html";
  });

  // Tab switching
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");

      // Update active tab button
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Show active tab content
      tabContents.forEach((content) => {
        content.classList.remove("active");
        if (content.id === tabName) {
          content.classList.add("active");
        }
      });
    });
  });

  // Chat variables
  let currentChatUser = null;
  let typingTimeout = null;
  let unreadMessages = {};
  let socket = null;
  // Store message IDs that are sent/delivered/read
  const messageStatuses = new Map();

  // Load user preferences
  let userPreferences = {
    typingIndicators: true,
    readReceipts: true,
    notifications: true,
  };

  try {
    const savedPreferences = localStorage.getItem("userPreferences");
    if (savedPreferences) {
      userPreferences = JSON.parse(savedPreferences);
    }
  } catch (error) {
    console.error("Error loading preferences:", error);
  }

  // Function to initialize socket.io connection
  function initializeSocket() {

    try {
      console.log(
        "Initializing socket connection with token present:",
        !!token
      );

      // // Initialize socket.io connection with auth token
      // socket = io({
      //   auth: {
      //     token: token,
      //   },
      //   reconnection: true,
      //   reconnectionAttempts: 5,
      //   reconnectionDelay: 1000,
      //   transports: ["websocket", "polling"], // explicitly specify transports
      // });
      const socketUrl = window.location.protocol === "https:" ? "wss://" : "ws://";
      socket = io(socketUrl + "192.168.1.10:3000", {
        auth: {
          token: token,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ["websocket", "polling"],
      });

      // Handle connection events
      socket.on("connect", () => {
        console.log("Socket connected successfully!", socket.id);

        // Set current user as online
        const currentUserStatusIndicator = document.querySelector(
          ".user-profile .status-indicator"
        );
        if (currentUserStatusIndicator) {
          currentUserStatusIndicator.classList.remove("status-offline");
          currentUserStatusIndicator.classList.add("status-online");
        }

        // When reconnecting, rejoin rooms and request updates
        if (currentChatUser) {
          // If there's a current chat, let the server know we're viewing it
          socket.emit("join:conversation", { userId: currentChatUser.id });
        }

        // Request status updates for friends
        if (window.friendsFunctions) {
          // Initialize userStatuses if it doesn't exist
          if (!window.friendsFunctions.userStatuses) {
            window.friendsFunctions.userStatuses = {};
          }

          const friendIds = Object.keys(window.friendsFunctions.userStatuses);
          if (friendIds.length > 0) {
            console.log("Requesting status updates for friends:", friendIds);
            socket.emit("get:status", { userIds: friendIds });
          }
        }
      });

      // Handle incoming messages
      socket.on("message:new", (message) => {
        console.log("New message received:", message);

        // Only append the message if we're currently chatting with the sender
        if (
          currentChatUser &&
          (currentChatUser.id === message.sender ||
            currentChatUser.id === message.sender._id)
        ) {
          appendMessage(message, false);

          // Send read receipt immediately if we're actively viewing the chat
          if (
            document.visibilityState === "visible" &&
            socket &&
            socket.connected
          ) {
            const messageId = message.id || message._id;
            socket.emit("message:read", {
              senderId: message.sender._id || message.sender,
              messageIds: [messageId],
            });

            // Mark as read locally
            const messageElement = document.querySelector(
              `.message[data-id="${messageId}"]`
            );
            if (messageElement) {
              messageElement.setAttribute("data-read", "true");
            }
          }

          // Play notification sound if the message is from someone else
          if (message.sender !== userId && message.sender._id !== userId) {
            playNotificationSound();
          }
        } else {
          // If we're not chatting with the sender, increment unread count
          if (message.sender !== userId && message.sender._id !== userId) {
            const senderId = message.sender._id || message.sender;
            unreadMessages[senderId] = (unreadMessages[senderId] || 0) + 1;

            // Update the friends list to show the new unread count
            if (
              window.friendsFunctions &&
              window.friendsFunctions.loadFriendsList
            ) {
              window.friendsFunctions.loadFriendsList();
            }
          }
        }
      });

      // Handle message status updates
      socket.on("message:status", (data) => {
        console.log("Message status update:", data);
        updateMessageStatus(data.messageId, data.status);
      });

      // Handle read receipts
      socket.on("message:read", (data) => {
        console.log("Message read receipt:", data);
        if (data.messageId) {
          updateMessageStatus(data.messageId, "read");
          // Also update the message element's data-read attribute
          const messageElement = document.querySelector(
            `.message[data-id="${data.messageId}"]`
          );
          if (messageElement) {
            messageElement.setAttribute("data-read", "true");
          }
        }
      });

      // Handle typing indicators
      socket.on("user:typing", (data) => {
        console.log("Typing indicator:", data);
        if (
          currentChatUser &&
          (currentChatUser.id === data.userId ||
            currentChatUser.id === data.userId._id)
        ) {
          const typingIndicator = document.querySelector(".typing-indicator");
          if (typingIndicator) {
            typingIndicator.classList.toggle("active", data.isTyping);
          }
        }
      });

      // Handle user status updates
      socket.on("user:status", (data) => {
        console.log("Single status update received:", data);

        // Initialize window.friendsFunctions if needed
        if (!window.friendsFunctions) {
          window.friendsFunctions = {};
        }

        // Initialize userStatuses if needed
        if (!window.friendsFunctions.userStatuses) {
          window.friendsFunctions.userStatuses = {};
        }

        // Store the status update
        window.friendsFunctions.userStatuses[data.userId] = data;

        console.log(
          "Updated user statuses:",
          window.friendsFunctions.userStatuses
        );

        // Update status display if available
        if (window.friendsFunctions.updateStatusIndicators) {
          window.friendsFunctions.updateStatusIndicators();
        }

        // Update chat header if this is the current user being chatted with
        if (currentChatUser && currentChatUser.id === data.userId) {
          updateChatHeaderStatus(data.userId);
        }
      });

      // Handle batch status updates
      socket.on("user:status:batch", (statuses) => {
        console.log("Batch status updates received:", statuses);

        // Initialize window.friendsFunctions if needed
        if (!window.friendsFunctions) {
          window.friendsFunctions = {};
        }

        // Initialize userStatuses if needed
        if (!window.friendsFunctions.userStatuses) {
          window.friendsFunctions.userStatuses = {};
        }

        // Store all the status updates
        statuses.forEach((status) => {
          if (status.userId) {
            window.friendsFunctions.userStatuses[status.userId] = status;
          }
        });

        console.log(
          "Updated user statuses after batch:",
          window.friendsFunctions.userStatuses
        );

        // Update status display if available
        if (window.friendsFunctions.updateStatusIndicators) {
          window.friendsFunctions.updateStatusIndicators();
        }

        // Update chat header if needed
        if (currentChatUser) {
          updateChatHeaderStatus(currentChatUser.id);
        }
      });

      // Listen for error events
      socket.on("error", (error) => {
        console.error("Socket error:", error);
      });

      // Listen for disconnection events
      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);

        // Mark current user as potentially offline
        const currentUserStatusIndicator = document.querySelector(
          ".user-profile .status-indicator"
        );
        if (currentUserStatusIndicator) {
          currentUserStatusIndicator.classList.remove("status-online");
          currentUserStatusIndicator.classList.add("status-offline");
        }

        // Try to reconnect after a short delay
        setTimeout(() => {
          if (!socket || !socket.connected) {
            console.log("Attempting to reconnect after disconnect...");
            if (socket) socket.connect();
          }
        }, 3000);
      });

      return socket;
    } catch (err) {
      console.error("Error initializing socket:", err);
      return null;
    }
  }

  // Function to update user status in the chat header
  async function updateChatHeaderStatus(targetUserId) {
    if (!targetUserId) return;

    try {
      // Check if user status is available in the friends.js cache
      let userStatus = null;
      if (window.friendsFunctions && window.friendsFunctions.userStatuses) {
        userStatus = window.friendsFunctions.userStatuses[targetUserId];
      }

      // If no status in cache, request it via socket
      if (!userStatus && socket && socket.connected) {
        socket.emit("get:status", { userIds: [targetUserId] });
        return; // Will be updated when response comes back
      } else if (!userStatus) {
        // Fallback to API if socket not available
        const response = await fetch(`http://192.168.1.10:3000/api/users/status/${targetUserId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user status");
        }

        userStatus = await response.json();

        // Update cache if available
        if (window.friendsFunctions && window.friendsFunctions.userStatuses) {
          window.friendsFunctions.userStatuses[targetUserId] = userStatus;
        }
      }

      // Update header
      const chatHeader = document.querySelector(".chat-header");
      if (!chatHeader) return;

      // Create or get status container
      let statusContainer = chatHeader.querySelector(".user-status-container");
      if (!statusContainer) {
        statusContainer = document.createElement("div");
        statusContainer.className = "user-status-container";
        const chatUser = chatHeader.querySelector("#chat-user");
        if (chatUser) {
          chatUser.parentNode.insertBefore(
            statusContainer,
            chatUser.nextSibling
          );
        } else {
          chatHeader.appendChild(statusContainer);
        }
      }

      // Create or update status indicator and text
      let statusIndicator = statusContainer.querySelector(".status-indicator");
      let statusText = statusContainer.querySelector(".status-text");

      if (!statusIndicator) {
        statusIndicator = document.createElement("span");
        statusIndicator.className = "status-indicator";
        statusContainer.appendChild(statusIndicator);
      }

      if (!statusText) {
        statusText = document.createElement("span");
        statusText.className = "status-text";
        statusContainer.appendChild(statusText);
      }

      // Update status
      statusIndicator.className = "status-indicator";
      statusIndicator.classList.add(`status-${userStatus.status}`);

      if (userStatus.status === "online") {
        statusText.textContent = "Online";
      } else if (userStatus.lastActive) {
        // Format last active time
        statusText.textContent =
          window.friendsFunctions && window.friendsFunctions.formatLastActive
            ? window.friendsFunctions.formatLastActive(userStatus.lastActive)
            : "Offline";
      } else {
        statusText.textContent = "Offline";
      }
    } catch (error) {
      console.error("Error updating chat header status:", error);
    }
  }

  // Play notification sound
  function playNotificationSound() {
    // Check if notifications are enabled in settings
    if (window.userSettings && window.userSettings.notifications.sound) {
      try {
        notificationSound.currentTime = 0;
        notificationSound
          .play()
          .catch((e) => console.log("Error playing sound:", e));
      } catch (e) {
        console.log("Error playing notification sound:", e);
      }
    }
  }

  // Browser notifications
  function showNotification(message) {
    // Check if browser supports notifications
    if (!("Notification" in window)) return;

    // Check if notification settings are enabled
    if (window.userSettings && !window.userSettings.notifications.desktop)
      return;

    // Check if permission is granted
    if (Notification.permission === "granted") {
      createNotification(message);
    } else if (Notification.permission !== "denied") {
      // Request permission
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          createNotification(message);
        }
      });
    }
  }

  function createNotification(message) {
    // Determine preview content based on settings
    const showPreview = window.userSettings
      ? window.userSettings.notifications.messagePreview
      : true;
    const body = showPreview
      ? `${message.senderName}: ${message.content}`
      : `New message from ${message.senderName}`;

    const notification = new Notification("New Message", {
      body: body,
      icon: "/icon.png",
    });

    notification.onclick = function () {
      window.focus();
      this.close();

      // If we know the sender ID, load their conversation
      if (message.sender) {
        const friendItem = document.querySelector(
          `.user-list li[data-id="${message.sender}"]`
        );
        if (friendItem) {
          friendItem.click();
        }
      }
    };
  }

  // Update message status
  function updateMessageStatus(messageId, status) {
    console.log(`Updating message ${messageId} to status: ${status}`);
    const messageElement = document.querySelector(
      `.message[data-id="${messageId}"]`
    );
    if (!messageElement) {
      console.log(`Message element not found for ID: ${messageId}`);
      return;
    }

    const statusElement = messageElement.querySelector(".status");
    if (statusElement) {
      // Store the status in our map
      messageStatuses.set(messageId, status);

      // Update the status display immediately
      if (status === "read") {
        statusElement.textContent = "Read";
        statusElement.setAttribute("data-status", "read");
        messageElement.setAttribute("data-read", "true");
      } else if (status === "delivered") {
        statusElement.textContent = "Delivered";
        statusElement.setAttribute("data-status", "delivered");
      } else {
        statusElement.textContent =
          status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.setAttribute("data-status", status);
      }
    } else {
      console.log(`Status element not found in message: ${messageId}`);
    }
  }

  // Message sending
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");

  sendBtn.addEventListener("click", () => {
    sendMessage();
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
      return;
    }

    // Handle typing indicator with WebSockets
    if (socket && socket.connected && currentChatUser) {
      if (messageInput.value.trim().length > 0) {
        // Send typing indicator
        socket.emit("user:typing", {
          recipientId: currentChatUser.id,
          isTyping: true,
        });

        // Clear previous timeout
        clearTimeout(typingTimeout);

        // Set timeout to clear typing indicator after 2 seconds of no typing
        typingTimeout = setTimeout(() => {
          if (socket && socket.connected && currentChatUser) {
            socket.emit("user:typing", {
              recipientId: currentChatUser.id,
              isTyping: false,
            });
          }
        }, 2000);
      }
    }
  });

  // Helper function to sanitize text with emojis
  function sanitizeText(text) {
    // First encode any HTML entities to prevent XSS
    const div = document.createElement("div");
    div.textContent = text;
    const sanitized = div.innerHTML;

    // Return the sanitized text
    return sanitized;
  }

  async function sendMessage() {
    if (!currentChatUser || !messageInput.value.trim()) {
      return;
    }

    const rawContent = messageInput.value.trim();
    // Sanitize the message content to safely handle emojis and prevent XSS
    const content = sanitizeText(rawContent);
    messageInput.value = "";

    // Generate temporary ID for this message
    const tempId = Date.now().toString();

    try {
      // Add message to chat with pending status
      const pendingMessage = {
        id: tempId,
        content,
        createdAt: new Date(),
        status: "sending",
      };

      appendMessage(pendingMessage, true);

      // Clear typing indicator
      if (socket && socket.connected && currentChatUser) {
        socket.emit("user:typing", {
          recipientId: currentChatUser.id,
          isTyping: false,
        });
      }

      // Send message to server via REST API (for persistence) and WebSocket (for real-time)
      const response = await fetch("http://192.168.1.10:3000/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientId: currentChatUser.id,
          content,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send message");
      }

      // Update the message status to sent
      const messageElement = document.querySelector(
        `.message[data-id="${tempId}"]`
      );
      if (messageElement) {
        // Update with the real ID from the server
        messageElement.setAttribute("data-id", data.id);
        const statusElement = messageElement.querySelector(".status");
        if (statusElement) {
          statusElement.textContent = "Sent";
          statusElement.setAttribute("data-status", "sent");
        }
      }

      // Store the status
      messageStatuses.set(data.id, "sent");

      // Send the message via WebSocket for real-time delivery
      if (socket && socket.connected) {
        socket.emit("message:send", {
          id: data.id,
          recipientId: currentChatUser.id,
          content,
          senderName: username,
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);

      // Update the message status to failed
      const messageElement = document.querySelector(
        `.message[data-id="${tempId}"]`
      );
      if (messageElement) {
        const statusElement = messageElement.querySelector(".status");
        if (statusElement) {
          statusElement.textContent = "Failed";
          statusElement.setAttribute("data-status", "failed");
          statusElement.style.color = "var(--error-color)";
        }
      }

      // Show retry button
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry";
      retryButton.classList.add("retry-btn");
      retryButton.addEventListener("click", () => {
        // Remove the failed message
        messageElement.remove();

        // Re-add the content to the input
        messageInput.value = content;
        messageInput.focus();
      });

      messageElement.appendChild(retryButton);
    }
  }

  // Load conversation with a user
  async function loadConversation(user) {
    // Clear any existing status polling interval
    if (window.statusPolling) {
      clearInterval(window.statusPolling);
    }

    currentChatUser = user;

    // Update header
    const chatUserElement = document.getElementById("chat-user");
    chatUserElement.textContent = user.username;

    // Update status in the header
    updateChatHeaderStatus(user.id);

    // Clear previous messages
    const messagesContainer = document.getElementById("messages-container");
    messagesContainer.innerHTML = "";

    // Show loading spinner
    const messagesLoading = document.getElementById("messages-loading");
    if (messagesLoading) messagesLoading.style.display = "flex";
    if (messagesContainer) messagesContainer.style.display = "none";

    // Enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;

    // Join this conversation via socket if connected
    if (socket && socket.connected) {
      socket.emit("join:conversation", { userId: user.id });
    }

    try {
      const response = await fetch(`http://192.168.1.10:3000/api/messages/${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load conversation");
      }

      // Hide loading spinner and show messages
      if (messagesLoading) messagesLoading.style.display = "none";
      if (messagesContainer) messagesContainer.style.display = "flex";

      // Check if we have valid messages
      if (!Array.isArray(data)) {
        console.error("Invalid response format:", data);
        throw new Error("Invalid response format from server");
      }

      // Check if the user selection has changed during the async call
      if (currentChatUser.id !== user.id) {
        console.log("User changed during conversation load, aborting render");
        return;
      }

      const messages = data;

      // Display messages
      messages.forEach((message) => {
        const isSent =
          message.sender === userId || message.sender._id === userId;
        appendMessage(message, isSent);

        // If this message is sent by us and has a status, store it
        if (isSent && message.status) {
          messageStatuses.set(message.id || message._id, message.status);
        }
      });

      // Scroll to bottom
      if (messagesContainer)
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Reset unread count for this user
      unreadMessages[user.id] = 0;

      // Update the friends list to reflect the updated unread count
      if (typeof loadFriendsList === "function") {
        loadFriendsList();
      } else if (
        window.friendsFunctions &&
        window.friendsFunctions.loadFriendsList
      ) {
        window.friendsFunctions.loadFriendsList();
      }

      // Mark messages as read via socket
      if (socket && socket.connected) {
        // Collect message IDs to mark as read
        const unreadMessageIds = messages
          .filter(
            (msg) =>
              !msg.read &&
              (msg.sender === user.id || msg.sender._id === user.id)
          )
          .map((msg) => msg.id || msg._id);

        if (unreadMessageIds.length > 0) {
          // Notify the sender that messages have been read
          socket.emit("message:read", {
            senderId: user.id,
            messageIds: unreadMessageIds,
          });

          // Mark messages as read locally
          unreadMessageIds.forEach((messageId) => {
            const messageElement = document.querySelector(
              `.message[data-id="${messageId}"]`
            );
            if (messageElement) {
              messageElement.setAttribute("data-read", "true");
              updateMessageStatus(messageId, "read");
            }
          });
        }
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      if (messagesLoading) messagesLoading.style.display = "none";
      if (messagesContainer) {
        messagesContainer.style.display = "flex";
        messagesContainer.innerHTML = `
          <div class="error-message">
            Failed to load conversation: ${
              error.message || "Unknown error"
            }.<br/>
            <button class="btn" id="retry-load-btn">Retry</button>
          </div>
        `;

        // Add retry button handler
        const retryBtn = document.getElementById("retry-load-btn");
        if (retryBtn) {
          retryBtn.addEventListener("click", () => loadConversation(user));
        }
      }
    }
  }

  // Append a message to the chat
  function appendMessage(message, isSent) {
    const messagesContainer = document.getElementById("messages-container");

    // Prevent duplicate messages
    const messageId = message.id || message._id;
    const existingMessage = document.querySelector(
      `.message[data-id="${messageId}"]`
    );
    if (existingMessage) return;

    const messageElement = document.createElement("div");
    messageElement.classList.add("message");
    messageElement.classList.add(isSent ? "sent" : "received");
    messageElement.setAttribute("data-id", messageId);

    // Format time
    const time = new Date(message.createdAt || Date.now()).toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );

    // Determine message status if sent by current user
    let statusHTML = "";
    if (isSent) {
      // Get status from our map or from the message
      let status = messageStatuses.get(messageId) || message.status || "sent";
      statusHTML = `<div class="status" data-status="${status}">${
        status.charAt(0).toUpperCase() + status.slice(1)
      }</div>`;
    }

    // Make sure the content is set safely
    const contentElement = document.createElement("div");
    contentElement.classList.add("content");
    contentElement.textContent = message.content; // This handles emojis safely

    // Create a temporary container for the message structure
    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = `
      <div class="time">${time}</div>
      ${statusHTML}
    `;

    // Add the elements to the message
    messageElement.appendChild(contentElement);
    // Add the other elements from the tempContainer
    while (tempContainer.firstChild) {
      messageElement.appendChild(tempContainer.firstChild);
    }

    messagesContainer.appendChild(messageElement);

    // Scroll to new message
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // If it's a received message (not from current user), play notification sound
    if (!isSent && document.visibilityState === "visible") {
      playNotificationSound();
    }
  }

  // Initialize socket
  initializeSocket();

  // Initial request for notification permission (on user interaction)
  document.body.addEventListener(
    "click",
    function requestNotificationPermission() {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      // Remove event listener after first click
      document.body.removeEventListener("click", requestNotificationPermission);
    },
    { once: true }
  );

  // Handle message reactions
  document.addEventListener("click", (e) => {
    if (e.target.closest(".message") && !e.target.closest(".reaction")) {
      const message = e.target.closest(".message");
      const reactionBar = message.querySelector(".reaction-bar");

      // Toggle reaction bar visibility with a small delay
      setTimeout(() => {
        document.querySelectorAll(".reaction-bar").forEach((bar) => {
          if (bar !== reactionBar) {
            bar.style.opacity = "0";
          }
        });

        reactionBar.style.opacity =
          reactionBar.style.opacity === "1" ? "0" : "1";
      }, 50);
    }
  });

  // Add keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Only if shortcuts are enabled in settings
    if (
      window.userSettings &&
      !window.userSettings.accessibility.keyboardShortcuts
    )
      return;

    // Ctrl/Cmd + Enter to send message
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key === "Enter" &&
      messageInput === document.activeElement
    ) {
      e.preventDefault();
      sendMessage();
    }

    // Alt + F to focus search
    if (e.altKey && e.key === "f") {
      e.preventDefault();
      document.getElementById("search-input").focus();
    }

    // Esc to blur input
    if (e.key === "Escape" && messageInput === document.activeElement) {
      messageInput.blur();
    }
  });

  // Add visibility change handler to update read receipts when returning to tab
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      currentChatUser &&
      socket &&
      socket.connected
    ) {
      // When tab becomes visible, send read receipts for any unread messages
      const unreadMessages = document.querySelectorAll(
        `.message.received:not([data-read="true"])`
      );

      if (unreadMessages.length > 0) {
        const messageIds = Array.from(unreadMessages)
          .map((msg) => msg.getAttribute("data-id"))
          .filter(Boolean);

        if (messageIds.length > 0) {
          socket.emit("message:read", {
            senderId: currentChatUser.id,
            messageIds: messageIds,
          });

          // Mark them as read locally
          unreadMessages.forEach((msg) => {
            msg.setAttribute("data-read", "true");
          });
        }
      }
    }
  });

  // Expose functions for use in friends.js
  window.chatFunctions = {
    loadConversation,
    get currentChatUser() {
      return currentChatUser;
    },
    set currentChatUser(user) {
      currentChatUser = user;
    },
    unreadMessages,
    socket,
  };
});
