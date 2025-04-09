// routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getConversation,
  getUnreadMessages,
  pollMessages,
} = require("../controllers/messageController");
const { protect } = require("../middleware/auth");

// All routes are protected
router.use(protect);

router.post("/", sendMessage);
router.get("/unread", getUnreadMessages);
router.get("/poll/:timestamp", pollMessages);
router.get("/:userId", getConversation);

module.exports = router;
