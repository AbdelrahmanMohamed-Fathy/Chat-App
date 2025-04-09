// controllers/userController.js
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");

// @desc    Search for users
// @route   GET /api/users/search
// @access  Private
const searchUsers = async (req, res) => {
  try {
    const { username } = req.query;

    // Find users that match the search query (excluding the current user)
    const users = await User.find({
      username: { $regex: username, $options: "i" },
      _id: { $ne: req.user._id },
    }).select("username");

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Send friend request
// @route   POST /api/users/friend-request
// @access  Private
const sendFriendRequest = async (req, res) => {
  try {
    const { recipientId } = req.body;

    // Check if recipient exists
    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      sender: req.user._id,
      recipient: recipientId,
      status: "pending",
    });

    if (existingRequest) {
      return res.status(400).json({ message: "Friend request already sent" });
    }

    // Check if they are already friends
    if (req.user.friends.includes(recipientId)) {
      return res
        .status(400)
        .json({ message: "You are already friends with this user" });
    }

    // Create new friend request
    const friendRequest = new FriendRequest({
      sender: req.user._id,
      recipient: recipientId,
    });

    await friendRequest.save();

    res.status(201).json({ message: "Friend request sent" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get pending friend requests
// @route   GET /api/users/friend-requests
// @access  Private
const getFriendRequests = async (req, res) => {
  try {
    const friendRequests = await FriendRequest.find({
      recipient: req.user._id,
      status: "pending",
    }).populate("sender", "username");

    res.json(friendRequests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Respond to friend request
// @route   PUT /api/users/friend-request/:id
// @access  Private
const respondToFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Find the request
    const friendRequest = await FriendRequest.findById(id);

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    // Check if user is the recipient
    if (friendRequest.recipient.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Update request status
    friendRequest.status = status;
    await friendRequest.save();

    // If accepted, add each other as friends
    if (status === "accepted") {
      // Add friend to current user
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { friends: friendRequest.sender },
      });

      // Add current user to friend's list
      await User.findByIdAndUpdate(friendRequest.sender, {
        $addToSet: { friends: req.user._id },
      });

      res.json({ message: "Friend request accepted" });
    } else {
      res.json({ message: "Friend request rejected" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get friends list
// @route   GET /api/users/friends
// @access  Private
const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "friends",
      "username"
    );

    res.json(user.friends);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  searchUsers,
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriends,
};
