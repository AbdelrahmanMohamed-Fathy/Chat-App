// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

// Load environment variables - used for encryption keys
// Do this as early as possible, before requiring other modules
const dotenv = require("dotenv");
const dotenvResult = dotenv.config();
if (dotenvResult.error) {
  console.warn(
    "Warning: dotenv not loaded, using fallback values",
    dotenvResult.error
  );
}

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { connectDB } = require("./config/db");
const Message = require("./models/Message");

// Initialize express
const app = express();
// Allow requests from Cordova app (adjust origin as needed)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Or your app's IP
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options("*", (req, res) => res.sendStatus(200));

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Track online users and their last activity
const onlineUsers = new Map();
const userLastActivity = new Map();
const socketToUser = new Map(); // Map socket id to user id

// Middleware to track user activity
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      // Extract user ID from token if possible
      const base64Payload = token.split(".")[1];
      const payload = JSON.parse(
        Buffer.from(base64Payload, "base64").toString()
      );
      const userId = payload.id || payload.userId;

      if (userId) {
        // Update user's online status and last activity
        onlineUsers.set(userId, Date.now());
        userLastActivity.set(userId, Date.now());
      }
    } catch (error) {
      // Ignore token parsing errors
      console.error("Error parsing token:", error);
    }
  }
  next();
});

// Add endpoint to check online status
app.get("/api/users/status/:userId", (req, res) => {
  const { userId } = req.params;
  const isOnline = onlineUsers.has(userId);
  const lastActive = userLastActivity.get(userId) || null;

  res.json({
    userId,
    status: isOnline ? "online" : "offline",
    lastActive,
  });
});

// Add endpoint to get multiple users' status
app.post("/api/users/status", (req, res) => {
  const { userIds } = req.body;

  if (!Array.isArray(userIds)) {
    return res.status(400).json({ message: "userIds must be an array" });
  }

  const statuses = userIds.map((userId) => ({
    userId,
    status: onlineUsers.has(userId) ? "online" : "offline",
    lastActive: userLastActivity.get(userId) || null,
  }));

  res.json(statuses);
});

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

// Serve the main application
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize socket.io
const io = require('socket.io')(server, {

  transports: ['websocket', 'polling'],});


// Socket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    // Extract user ID from token
    const base64Payload = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(base64Payload, "base64").toString());
    const userId = payload.id || payload.userId;
    if (!userId) {
      return next(new Error("Invalid token"));
    }

    // Attach userId to socket object
    socket.userId = userId;
    console.log(`Socket authenticated for user: ${userId}`);
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    return next(new Error("Authentication error"));
  }
});

// Socket.io connection handling
io.on("connection", (socket) => {
  const userId = socket.userId;
  console.log(`User connected: ${userId}, Socket ID: ${socket.id}`);

  // Store socket to user mapping
  socketToUser.set(socket.id, userId);

  // Mark user as online
  onlineUsers.set(userId, Date.now());
  userLastActivity.set(userId, Date.now());

  // Join personal room for direct messages
  socket.join(userId);

  // Send online status to all connected clients immediately
  io.emit("user:status", {
    userId,
    status: "online",
    lastActive: Date.now(),
  });

  // Debug - log all online users on each connection
  console.log("Current online users:", Array.from(onlineUsers.keys()));

  // Send this new user the status of all other online users
  const otherUsers = Array.from(onlineUsers.keys()).filter(
    (id) => id !== userId
  );
  if (otherUsers.length > 0) {
    console.log(
      `Sending ${otherUsers.length} online users status to new user ${userId}`
    );
    const statusUpdates = otherUsers.map((id) => ({
      userId: id,
      status: "online",
      lastActive: onlineUsers.get(id),
    }));
    socket.emit("user:status:batch", statusUpdates);
  }

  // Handle joining a specific conversation
  socket.on("join:conversation", (data) => {
    if (data && data.userId) {
      console.log(`User ${userId} joined conversation with ${data.userId}`);

      // Create a conversation room ID (combination of both user IDs, sorted alphabetically)
      const participants = [userId, data.userId].sort();
      const roomId = `conversation:${participants.join("-")}`;

      // Join the conversation room
      socket.join(roomId);

      // Update last activity timestamp
      userLastActivity.set(userId, Date.now());

      // Also emit status update for both users to ensure latest status
      const otherUserStatus = onlineUsers.has(data.userId)
        ? "online"
        : "offline";
      socket.emit("user:status", {
        userId: data.userId,
        status: otherUserStatus,
        lastActive: userLastActivity.get(data.userId) || null,
      });
    }
  });

  // Listen for status requests
  socket.on("get:status", (data) => {
    const { userIds } = data;
    console.log(`User ${userId} requested status for:`, userIds);

    if (!Array.isArray(userIds) || userIds.length === 0) {
      socket.emit("error", { message: "Invalid user IDs provided" });
      return;
    }

    const statuses = userIds.map((id) => {
      const isOnline = onlineUsers.has(id);
      return {
        userId: id,
        status: isOnline ? "online" : "offline",
        lastActive: userLastActivity.get(id) || null,
      };
    });

    console.log(`Sending status updates to ${userId}:`, statuses);
    socket.emit("user:status:batch", statuses);
  });

  // Listen for new messages
  socket.on("message:send", async (data) => {
    try {
      const { recipientId, content } = data;

      // Update last activity
      userLastActivity.set(userId, Date.now());

      // Create a standardized message ID if not provided
      const messageId = data.id || new mongoose.Types.ObjectId().toString();

      // Create a conversation room ID (combination of both user IDs, sorted alphabetically)
      const participants = [userId, recipientId].sort();
      const roomId = `conversation:${participants.join("-")}`;

      // Check if recipient is online
      const isRecipientOnline = onlineUsers.has(recipientId);

      // Send message to recipient if they're online
      io.to(recipientId).emit("message:new", {
        id: messageId,
        content,
        sender: userId,
        senderName: data.senderName || "User",
        createdAt: new Date(),
      });

      // Send delivery receipt to sender
      socket.emit("message:status", {
        messageId: messageId,
        status: isRecipientOnline ? "delivered" : "sent",
      });

      // If recipient is in the conversation room, they're actively viewing it
      // We can immediately mark as delivered
      if (isRecipientOnline) {
        // Check if the recipient is in the conversation room
        const recipientSockets = await io.in(recipientId).fetchSockets();
        for (const recipientSocket of recipientSockets) {
          const rooms = Array.from(recipientSocket.rooms);
          if (rooms.includes(roomId)) {
            // Recipient is in the conversation room, mark as delivered
            socket.emit("message:status", {
              messageId: messageId,
              status: "delivered",
            });
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error handling message", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Listen for typing indicators
  socket.on("user:typing", (data) => {
    const { recipientId, isTyping } = data;
    if (recipientId) {
      socket.to(recipientId).emit("user:typing", {
        userId,
        isTyping,
      });
    }
    // Update last activity
    userLastActivity.set(userId, Date.now());
  });

  // Listen for read receipts
  socket.on("message:read", (data) => {
    console.log("Read receipt received:", data);
    const { messageIds, senderId } = data;

    // Update last activity
    userLastActivity.set(userId, Date.now());

    // Send read receipt to sender for each message
    if (senderId && Array.isArray(messageIds)) {
      // Get all sockets for the sender
      const senderSockets = Array.from(io.sockets.sockets.values()).filter(
        (s) => s.userId === senderId
      );

      // Send to all sender's sockets to ensure delivery
      senderSockets.forEach((senderSocket) => {
        messageIds.forEach((messageId) => {
          console.log(
            `Sending read receipt for message ${messageId} to user ${senderId}`
          );
          senderSocket.emit("message:read", {
            messageId,
            status: "read",
            readBy: userId,
            timestamp: Date.now(),
          });
        });
      });

      // If no sender sockets found, store the read receipt for when they reconnect
      if (senderSockets.length === 0) {
        console.log(
          `No active sockets found for sender ${senderId}, storing read receipt`
        );
        // Store read receipt in database for offline users
        Message.updateMany(
          { _id: { $in: messageIds } },
          { $set: { read: true, readBy: userId, readAt: Date.now() } }
        ).catch((err) =>
          console.error("Error updating message read status:", err)
        );
      }
    } else if (senderId) {
      // Backward compatibility for single messageId
      const messageId = data.messageId;
      if (messageId) {
        const senderSockets = Array.from(io.sockets.sockets.values()).filter(
          (s) => s.userId === senderId
        );

        senderSockets.forEach((senderSocket) => {
          console.log(
            `Sending read receipt for message ${messageId} to user ${senderId}`
          );
          senderSocket.emit("message:read", {
            messageId,
            status: "read",
            readBy: userId,
            timestamp: Date.now(),
          });
        });

        // If no sender sockets found, store the read receipt
        if (senderSockets.length === 0) {
          Message.updateOne(
            { _id: messageId },
            { $set: { read: true, readBy: userId, readAt: Date.now() } }
          ).catch((err) =>
            console.error("Error updating message read status:", err)
          );
        }
      }
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${userId}, Socket ID: ${socket.id}`);

    // Clear socket mapping
    socketToUser.delete(socket.id);

    // Check if user has other active connections
    let userStillConnected = false;
    for (const [_, connectedUserId] of socketToUser.entries()) {
      if (connectedUserId === userId) {
        userStillConnected = true;
        break;
      }
    }

    // If no other connections, mark user as offline
    if (!userStillConnected) {
      onlineUsers.delete(userId);
      userLastActivity.set(userId, Date.now());

      // Broadcast offline status to all clients
      io.emit("user:status", {
        userId,
        status: "offline",
        lastActive: Date.now(),
      });

      console.log(`User ${userId} is now completely offline.`);
      console.log("Remaining online users:", Array.from(onlineUsers.keys()));
    } else {
      console.log(
        `User ${userId} still has other connections, remaining online.`
      );
    }
  });
});
// Add support for image upload with local storage

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, "../uploads/"), // Directory to store uploaded files
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

// Ensure the uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads/");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Endpoint to handle image uploads
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const filePath = `/uploads/${req.file.filename}`;
  res.status(200).json({ message: "Image uploaded successfully", filePath });
});

// Serve uploaded images statically
app.use("/uploads", express.static(uploadsDir));