// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const {
  searchUsers,
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriends,
} = require("../controllers/userController");
const { protect } = require("../middleware/auth");

// All routes are protected
router.use(protect);

router.get("/search", searchUsers);
router.post("/friend-request", sendFriendRequest);
router.get("/friend-requests", getFriendRequests);
router.put("/friend-request/:id", respondToFriendRequest);
router.get("/friends", getFriends);

module.exports = router;
