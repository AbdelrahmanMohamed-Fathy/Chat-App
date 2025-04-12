// Friends and requests management
document.addEventListener("DOMContentLoaded", () => {
  // Check if user is logged in
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");

  if (!token || !userId) {
    window.location.href = "/index.html";
    return;
  }

  // Elements
  const friendsList = document.getElementById("friends-list");
  const friendsLoading = document.getElementById("friends-loading");
  const requestsList = document.getElementById("requests-list");
  const requestsLoading = document.getElementById("requests-loading");
  const searchResults = document.getElementById("search-results");
  const searchLoading = document.getElementById("search-loading");
  const requestsTab = document.querySelector('[data-tab="requests"]');

  // User statuses cache
  const userStatuses = {};

  // Helper function to format last active time
  function formatLastActive(lastActiveTime) {
    try {
      const lastActive = new Date(lastActiveTime);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastActive) / (1000 * 60));

      if (diffMinutes < 1) {
        return "Just now";
      } else if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
      } else if (diffMinutes < 1440) {
        // Less than a day
        const hours = Math.floor(diffMinutes / 60);
        return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
      } else {
        const days = Math.floor(diffMinutes / 1440);
        if (days < 7) {
          return `${days} ${days === 1 ? "day" : "days"} ago`;
        } else {
          return lastActive.toLocaleDateString();
        }
      }
    } catch (error) {
      console.error("Error formatting last active time:", error);
      return "Offline";
    }
  }

  // Function to fetch user statuses using socket
  function requestUserStatuses(userIds) {
    if (!userIds || userIds.length === 0) return;

    console.log("Requesting statuses for users:", userIds);

    // Use WebSocket if available through chatFunctions
    if (window.chatFunctions && window.chatFunctions.socket) {
      try {
        const socket = window.chatFunctions.socket;
        console.log("Socket found:", socket);
        console.log("Socket connected:", socket.connected);
        if (socket && socket.connected) {
          console.log("Requesting user statuses via WebSocket:", userIds);
          socket.emit("get:status", { userIds });
        } else {
          console.log("Socket not connected, falling back to HTTP");
          // Wait for socket to connect or use HTTP fallback
          setTimeout(() => {
            if (socket && socket.connected) {
              socket.emit("get:status", { userIds });
            } else {
              fetchUserStatusesHttp(userIds);
            }
          }, 1000);
        }
      } catch (error) {
        console.error("Error requesting status via socket:", error);
        fetchUserStatusesHttp(userIds);
      }
    } else {
      // Fallback to HTTP API if socket not available
      console.log("Socket not available, using HTTP for status updates");
      fetchUserStatusesHttp(userIds);
    }
  }

  // Fallback HTTP method for fetching user statuses
  async function fetchUserStatusesHttp(userIds) {
    if (!userIds || userIds.length === 0) return;

    console.log("Fetching user statuses via HTTP:", userIds);
    try {
      const response = await fetch("http://192.168.1.10:3000/api/users/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const statuses = await response.json();

      // Update statuses cache
      statuses.forEach((status) => {
        userStatuses[status.userId] = status;
      });

      // Update status indicators
      updateStatusIndicators();
    } catch (error) {
      console.error("Error fetching user statuses:", error);
    }
  }

  // Function to update status indicators in the UI
  function updateStatusIndicators() {
    console.log("Updating status indicators with statuses:", userStatuses);

    // Update in friends list
    document.querySelectorAll(".user-list li[data-id]").forEach((userItem) => {
      const friendId = userItem.getAttribute("data-id");
      const status = userStatuses[friendId];

      if (!status) {
        console.log(`No status found for user ${friendId}`);
        return;
      }

      console.log(`Updating UI for user ${friendId} with status:`, status);
      const statusIndicator = userItem.querySelector(".status-indicator");
      const statusText = userItem.querySelector(".status-text");

      if (statusIndicator) {
        // Remove existing status classes
        statusIndicator.classList.remove("status-online", "status-offline");

        // Add appropriate class
        const statusClass =
          status.status === "online" ? "status-online" : "status-offline";
        statusIndicator.classList.add(statusClass);
        console.log(`Set status class to ${statusClass} for user ${friendId}`);
      } else {
        console.log(`No status indicator element found for user ${friendId}`);
      }

      if (statusText) {
        if (status.status === "online") {
          statusText.textContent = "Online";
        } else if (status.lastActive) {
          statusText.textContent = formatLastActive(status.lastActive);
        } else {
          statusText.textContent = "Offline";
        }
        console.log(
          `Set status text to "${statusText.textContent}" for user ${friendId}`
        );
      } else {
        console.log(`No status text element found for user ${friendId}`);
      }
    });

    // Also update the current user's status in the header
    const currentUserStatusIndicator = document.querySelector(
      ".user-profile .status-indicator"
    );
    if (currentUserStatusIndicator) {
      // Current user is always online if we're here
      currentUserStatusIndicator.classList.remove("status-offline");
      currentUserStatusIndicator.classList.add("status-online");
    }
  }

  // Load friends list
  async function loadFriendsList() {
    try {
      // Show loading state
      friendsLoading.style.display = "flex";
      friendsList.style.display = "none";

      // Get friends
      const friendsResponse = await fetch("http://192.168.1.10:3000/api/users/friends", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const friends = await friendsResponse.json();

      if (!friendsResponse.ok) {
        throw new Error("Failed to load friends");
      }

      // Get unread message counts
      const unreadResponse = await fetch("http://192.168.1.10:3000/api/messages/unread", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const unreadCounts = await unreadResponse.json();

      if (!unreadResponse.ok) {
        throw new Error("Failed to load unread message counts");
      }

      // Hide loading state
      friendsLoading.style.display = "none";
      friendsList.style.display = "block";

      // Clear list
      friendsList.innerHTML = "";

      if (friends.length === 0) {
        friendsList.innerHTML =
          "<li>No friends yet. Add some friends to start chatting!</li>";
        return;
      }

      // Collect friend IDs to fetch statuses
      const friendIds = friends.map((friend) => friend._id);

      // Create friend items
      friends.forEach((friend) => {
        // Use either the server's count or our local count (whichever is higher)
        let unreadCount = 0;

        // Check for serverside count
        const serverCount =
          unreadCounts.find((u) => u.sender === friend._id)?.count || 0;

        // Check for client-side count if chat functions are available
        const localCount =
          window.chatFunctions && window.chatFunctions.unreadMessages
            ? window.chatFunctions.unreadMessages[friend._id] || 0
            : 0;

        unreadCount = Math.max(serverCount, localCount);

        // Check if this is the active chat
        const isActive =
          window.chatFunctions &&
          window.chatFunctions.currentChatUser &&
          window.chatFunctions.currentChatUser.id === friend._id;

        const li = document.createElement("li");
        li.setAttribute("data-id", friend._id);

        if (isActive) {
          li.classList.add("active");
        }

        // Get user status from cache or default to offline
        const userStatus = userStatuses[friend._id] || { status: "offline" };
        const statusClass = `status-${userStatus.status}`;

        // Format status text
        let statusText = "Offline";
        if (userStatus.status === "online") {
          statusText = "Online";
        } else if (userStatus.lastActive) {
          statusText = formatLastActive(userStatus.lastActive);
        }

        li.innerHTML = `
          <div class="friend-info">
            <span class="status-indicator ${statusClass}"></span>
            <div>
              <span class="username">${friend.username}</span>
              <span class="status-text">${statusText}</span>
            </div>
          </div>
          ${
            unreadCount > 0
              ? `<span class="unread-count">${unreadCount}</span>`
              : ""
          }
        `;

        // Chat with friend on click
        li.addEventListener("click", () => {
          // Update active class
          document.querySelectorAll(".user-list li").forEach((item) => {
            item.classList.remove("active");
          });
          li.classList.add("active");

          // Remove unread count indicator
          const unreadBadge = li.querySelector(".unread-count");
          if (unreadBadge) {
            unreadBadge.remove();
          }

          // Reset unread count for this friend
          if (window.chatFunctions && window.chatFunctions.unreadMessages) {
            window.chatFunctions.unreadMessages[friend._id] = 0;
          }

          // Load conversation
          if (window.chatFunctions && window.chatFunctions.loadConversation) {
            window.chatFunctions.loadConversation({
              id: friend._id,
              username: friend.username,
            });
          }
        });

        friendsList.appendChild(li);
      });

      // Request status updates for all friends
      requestUserStatuses(friendIds);
    } catch (error) {
      console.error("Error loading friends:", error);

      // Hide loading state and show error
      friendsLoading.style.display = "none";
      friendsList.style.display = "block";
      friendsList.innerHTML = `
        <li class="error-message">Failed to load friends</li>
        <li><button class="btn btn-small" id="retry-friends">Retry</button></li>
      `;

      // Add retry button functionality
      document
        .getElementById("retry-friends")
        ?.addEventListener("click", loadFriendsList);
    }
  }

  // Load friend requests
  async function loadFriendRequests() {
    try {
      // Show loading state
      requestsLoading.style.display = "flex";
      requestsList.style.display = "none";

      const response = await fetch("http://192.168.1.10:3000/api/users/friend-requests", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const requests = await response.json();

      if (!response.ok) {
        throw new Error("Failed to load friend requests");
      }

      // Hide loading state
      requestsLoading.style.display = "none";
      requestsList.style.display = "block";

      // Clear list
      requestsList.innerHTML = "";

      // Update notification badge
      if (requests.length > 0) {
        requestsTab.classList.add("has-notifications");
        requestsTab.setAttribute("data-count", requests.length);
      } else {
        requestsTab.classList.remove("has-notifications");
        requestsTab.setAttribute("data-count", "0");
        requestsList.innerHTML = "<li>No pending friend requests</li>";
        return;
      }

      // Create request items
      requests.forEach((request) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="friend-info">
            <span class="username">${request.sender.username}</span>
          </div>
          <div class="request-actions">
            <button class="btn btn-small accept-btn" data-id="${request._id}">Accept</button>
            <button class="btn btn-small reject-btn" data-id="${request._id}">Reject</button>
          </div>
        `;

        requestsList.appendChild(li);
      });

      // Add event listeners for accept/reject buttons
      requestsList.querySelectorAll(".accept-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          respondToRequest(e.target.getAttribute("data-id"), "accepted");
        });
      });

      requestsList.querySelectorAll(".reject-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          respondToRequest(e.target.getAttribute("data-id"), "rejected");
        });
      });
    } catch (error) {
      console.error("Error loading friend requests:", error);

      // Hide loading state and show error
      requestsLoading.style.display = "none";
      requestsList.style.display = "block";
      requestsList.innerHTML = `
        <li class="error-message">Failed to load friend requests</li>
        <li><button class="btn btn-small" id="retry-requests">Retry</button></li>
      `;

      // Add retry button functionality
      document
        .getElementById("retry-requests")
        ?.addEventListener("click", loadFriendRequests);
    }
  }

  // Respond to friend request
  async function respondToRequest(requestId, status) {
    try {
      // Disable buttons to prevent multiple clicks
      const buttons = document.querySelectorAll(
        `.request-actions button[data-id="${requestId}"]`
      );
      buttons.forEach((btn) => {
        btn.disabled = true;
        btn.textContent =
          status === "accepted" ? "Accepting..." : "Rejecting...";
      });

      const response = await fetch(`http://192.168.1.10:3000/api/users/friend-request/${requestId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to respond to request");
      }

      // Reload lists
      loadFriendRequests();
      loadFriendsList();
    } catch (error) {
      console.error("Error responding to request:", error);

      // Re-enable buttons
      const buttons = document.querySelectorAll(
        `.request-actions button[data-id="${requestId}"]`
      );
      buttons.forEach((btn) => {
        btn.disabled = false;
        btn.textContent = btn.classList.contains("accept-btn")
          ? "Accept"
          : "Reject";
      });

      // Show error
      alert("Failed to respond to friend request");
    }
  }

  // Search for users
  const searchInput = document.getElementById("search-input");
  const searchBtn = document.getElementById("search-btn");

  searchBtn.addEventListener("click", () => {
    searchUsers();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      searchUsers();
    }
  });

  async function searchUsers() {
    const query = searchInput.value.trim();

    if (!query) {
      searchResults.innerHTML = "";
      return;
    }

    // Show loading state
    searchLoading.style.display = "flex";
    searchResults.style.display = "none";

    try {
      const response = await fetch(`http://192.168.1.10:3000/api/users/search?username=${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const users = await response.json();

      if (!response.ok) {
        throw new Error("Failed to search users");
      }

      // Hide loading state
      searchLoading.style.display = "none";
      searchResults.style.display = "block";

      // Clear results
      searchResults.innerHTML = "";

      if (users.length === 0) {
        searchResults.innerHTML = `
          <li>No users found matching "${query}"</li>
        `;
        return;
      }

      // Create user items
      users.forEach((user) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="friend-info">
            <span class="username">${user.username}</span>
          </div>
          <button class="btn btn-small add-friend-btn" data-id="${user._id}">Add Friend</button>
        `;

        searchResults.appendChild(li);
      });

      // Add event listeners for add friend buttons
      searchResults.querySelectorAll(".add-friend-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const button = e.target;
          button.textContent = "Sending...";
          button.disabled = true;
          sendFriendRequest(button.getAttribute("data-id"), button);
        });
      });
    } catch (error) {
      console.error("Error searching users:", error);

      // Hide loading state and show error
      searchLoading.style.display = "none";
      searchResults.style.display = "block";
      searchResults.innerHTML = `
        <li class="error-message">Failed to search users</li>
        <li><button class="btn btn-small" id="retry-search">Retry Search</button></li>
      `;

      // Add retry button functionality
      document
        .getElementById("retry-search")
        ?.addEventListener("click", searchUsers);
    }
  }

  // Send friend request
  async function sendFriendRequest(recipientId, buttonElement) {
    try {
      const response = await fetch("http://192.168.1.10:3000/api/users/friend-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send friend request");
      }

      // Update button state
      if (buttonElement) {
        buttonElement.textContent = "Request Sent";
        buttonElement.disabled = true;
        buttonElement.classList.add("success");
      }

      // Clear search after a short delay
      setTimeout(() => {
        searchInput.value = "";
        searchResults.innerHTML = "";
      }, 2000);
    } catch (error) {
      console.error("Error sending friend request:", error);

      // Reset button state
      if (buttonElement) {
        buttonElement.textContent = "Add Friend";
        buttonElement.disabled = false;
      }

      alert(error.message || "Failed to send friend request");
    }
  }

  // Initial load
  loadFriendsList();
  loadFriendRequests();

  // Refresh data periodically (less frequently since we use WebSockets for status)
  setInterval(() => {
    loadFriendsList();
    loadFriendRequests();
  }, 60000); // Once per minute

  // Export functions to the window for access from chat.js
  window.friendsFunctions = {
    loadFriendsList,
    userStatuses,
    formatLastActive,
    updateStatusIndicators,
  };
});
