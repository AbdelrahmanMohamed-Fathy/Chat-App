// models/Message.js
const mongoose = require("mongoose");
const { encrypt, decrypt } = require("../utils/encryption");

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  readStatus: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save middleware to encrypt message content
MessageSchema.pre("save", function (next) {
  try {
    // Only encrypt if content is modified and exists
    if (this.isModified("content") && this.content) {
      // Store the encrypted content
      this.content = encrypt(this.content);
    }
    next();
  } catch (error) {
    console.error("Error encrypting message content:", error);
    // Continue without encryption on error
    next();
  }
});

// Custom method to decrypt individual document's content
MessageSchema.methods.decryptContent = function () {
  try {
    if (this.content) {
      this.content = decrypt(this.content);
    }
    return this;
  } catch (error) {
    console.error("Error decrypting message content:", error);
    return this;
  }
};

// Middleware to decrypt content in query results
// Hook into the find queries to decrypt content
MessageSchema.post("find", function (docs) {
  if (!docs || !Array.isArray(docs)) return docs;

  docs.forEach((doc) => {
    try {
      if (doc && doc.content) {
        doc.content = decrypt(doc.content);
      }
    } catch (error) {
      console.error("Error decrypting message in find:", error);
      // Keep original content on error
    }
  });
});

// Hook into findOne queries to decrypt content
MessageSchema.post("findOne", function (doc) {
  if (!doc) return doc;

  try {
    if (doc.content) {
      doc.content = decrypt(doc.content);
    }
  } catch (error) {
    console.error("Error decrypting message in findOne:", error);
  }

  return doc;
});

module.exports = mongoose.model("Message", MessageSchema);
