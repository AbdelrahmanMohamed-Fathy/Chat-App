// encryption.js - Utility for message encryption/decryption
const crypto = require("crypto");

// Ensure we have an encryption key available (32 bytes for AES-256)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    console.warn(
      "WARNING: Using fallback encryption key. Set ENCRYPTION_KEY in your .env file for production."
    );
    // Fallback key for development only - 32 bytes (256 bits)
    return "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
  }
  // Ensure key is exactly 32 bytes (for AES-256)
  return key.slice(0, 32);
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16; // For AES, IV is always 16 bytes

/**
 * Safely encrypts text using AES-256-CBC with proper error handling
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text (IV:encrypted format) or original text on error
 */
function encrypt(text) {
  // Don't try to encrypt null/undefined values
  if (!text) return text;

  try {
    // Create initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    // Encrypt the message
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Return iv:encrypted format
    return `${iv.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error.message);
    // Return original text if encryption fails
    return text;
  }
}

/**
 * Safely decrypts text that was encrypted with AES-256-CBC
 * @param {string} encryptedText - Text in IV:encrypted format
 * @returns {string} - Decrypted text or original text on error
 */
function decrypt(encryptedText) {
  // Don't try to decrypt null/undefined/empty values
  if (!encryptedText) return encryptedText;

  try {
    // Check if the text is in the correct format (iv:encrypted)
    if (!encryptedText.includes(":")) {
      // Not encrypted or in wrong format, return as is
      return encryptedText;
    }

    // Split text into iv and encrypted data
    const [ivHex, encryptedHex] = encryptedText.split(":");

    if (!ivHex || !encryptedHex) {
      return encryptedText;
    }

    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    // Create decipher
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv
    );

    // Decrypt
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error.message);
    // Return original text if decryption fails
    return encryptedText;
  }
}

module.exports = {
  encrypt,
  decrypt,
};
