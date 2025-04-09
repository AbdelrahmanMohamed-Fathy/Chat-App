// controllers/messageController.js
const Message = require("../models/Message");
const User = require("../models/User");

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { recipientId, content } = req.body;

    // Check if recipient exists and is a friend
    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if they are friends
    if (!req.user.friends.includes(recipientId)) {
      return res
        .status(403)
        .json({ message: "You can only message your friends" });
    }

    // Store original content to return in response
    const originalContent = content;

    // Create message (encryption happens in pre-save hook)
    const message = new Message({
      sender: req.user._id,
      recipient: recipientId,
      content,
    });

    await message.save();

    // Create response object with decrypted content
    const responseObj = message.toObject();
    responseObj.content = originalContent;

    res.status(201).json(responseObj);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get conversation with a user
// @route   GET /api/messages/:userId
// @access  Private
const getConversation = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find messages between the two users (sent or received)
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: userId },
        { sender: userId, recipient: req.user._id },
      ],
    }).sort("createdAt");

    if (!messages) {
      return res.json([]);
    }

    // Mark messages as read in database
    await Message.updateMany(
      { sender: userId, recipient: req.user._id, readStatus: false },
      { readStatus: true }
    );

    // Update read status in our result set so client gets latest status
    const updatedMessages = messages.map((message) => {
      // Create a mutable copy of the message
      const updatedMessage = message.toObject();

      // If this is a message received by current user, mark as read
      if (
        updatedMessage.sender.toString() === userId &&
        updatedMessage.recipient.toString() === req.user._id.toString()
      ) {
        updatedMessage.readStatus = true;
      }

      return updatedMessage;
    });

    res.json(updatedMessages);
  } catch (error) {
    console.error("Error getting conversation:", error);
    res
      .status(500)
      .json({ message: "Error loading conversation: " + error.message });
  }
};

// @desc    Get unread message count
// @route   GET /api/messages/unread
// @access  Private
const getUnreadMessages = async (req, res) => {
  try {
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          recipient: req.user._id,
          readStatus: false,
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get username for each sender
    const result = await Promise.all(
      unreadCounts.map(async (item) => {
        const user = await User.findById(item._id).select("username");
        return {
          sender: item._id,
          username: user ? user.username : "Unknown User",
          count: item.count,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error("Error getting unread messages:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Poll for new messages
// @route   GET /api/messages/poll/:timestamp
// @access  Private
const pollMessages = async (req, res) => {
  try {
    const { timestamp } = req.params;
    const date = new Date(parseInt(timestamp));

    // Find messages received after the timestamp
    // Decryption happens in the post-find middleware
    const messages = await Message.find({
      recipient: req.user._id,
      createdAt: { $gt: date },
    })
      .populate("sender", "username")
      .sort("createdAt");

    res.json(messages);
  } catch (error) {
    console.error("Error polling messages:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  sendMessage,
  getConversation,
  getUnreadMessages,
  pollMessages,
};
