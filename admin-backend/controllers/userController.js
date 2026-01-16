// admin-backend/controllers/userController.js

const User = require("../models/User");
const Bot = require("../models/Bot");
const bcrypt = require("bcryptjs");
const {
  provisionResourcesForUser,
  provisionResourcesForBot,
  ensureUserResources,
} = require("../services/provisioningService");
const {
  invalidateUserTenantContext,
  getUserTenantContext,
} = require("../services/userContextService");

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10;

// Cache for tenant database connections (for agent queries)
const tenantConnections = new Map();

/**
 * Get or create a connection to the tenant's database
 */
const getTenantConnection = async (databaseUri) => {
  if (!databaseUri) {
    throw new Error("databaseUri is required for tenant database connection");
  }

  if (tenantConnections.has(databaseUri)) {
    return tenantConnections.get(databaseUri);
  }

  const mongoose = require("mongoose");
  const conn = await mongoose
    .createConnection(databaseUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    .asPromise();

  tenantConnections.set(databaseUri, conn);
  return conn;
};

/**
 * Get Agent model for a specific tenant database
 */
const getAgentModel = async (databaseUri) => {
  const tenantDB = await getTenantConnection(databaseUri);
  const AgentSchema = require("../models/Agent");

  if (tenantDB.models.Agent) {
    return tenantDB.models.Agent;
  }

  return tenantDB.model("Agent", AgentSchema);
};

const toSafeUser = (userDoc, { includeVectorStore = false } = {}) => {
  if (!userDoc) {
    return null;
  }

  const safeUser = userDoc.toObject({ versionKey: false });
  delete safeUser.password;

  if (!includeVectorStore) {
    delete safeUser.vectorStorePath;
  }

  return {
    ...safeUser,
    id: safeUser._id,
  };
};

const normalizeBoolean = (value, defaultValue) => {
  if (typeof value === "undefined") {
    return typeof defaultValue === "undefined" ? true : !!defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return typeof defaultValue === "undefined" ? true : !!defaultValue;
};

/**
 * Get the currently logged-in user's profile
 * @route   GET /api/user/me
 * @access  Protected (requires JWT)
 * @returns {Object} User object (without password)
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const safeUser = toSafeUser(user, { includeVectorStore: true });

    res.json(safeUser);
  } catch (err) {
    console.error("❌ Error fetching user profile:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Server error fetching profile" });
  }
};

/**
 * Update the currently logged-in user's profile
 * @route   PUT /api/user/me
 * @access  Protected (requires JWT)
 * @param   {Object} req.body - { name?, email?, username?, password? }
 * @returns {Object} Updated user object (without password)
 */
exports.updateMe = async (req, res) => {
  const updates = {};
  const { name, email, username, password, apiKey } = req.body;

  if (name) updates.name = name.trim();
  if (email) updates.email = email.toLowerCase().trim();
  if (username) updates.username = username.trim();

  // Allow admins to update their API key
  if (typeof apiKey !== "undefined") {
    updates.apiKey = apiKey ? apiKey.trim() : null;
  }

  // Hash password if provided
  if (password) {
    try {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(password, salt);
    } catch (err) {
      console.error("❌ Error hashing password:", err);
      return res.status(500).json({ error: "Error updating password" });
    }
  }

  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check for duplicate email/username before updating
    // Email: For admins, check globally; for regular users, check within their admin's scope
    if (email) {
      const emailQuery = {
        email: email.toLowerCase().trim(),
        _id: { $ne: req.user.userId }, // Exclude current user
      };

      // If current user is a regular user, scope email check to their admin
      if (currentUser.role === "user" && currentUser.adminId) {
        emailQuery.adminId = currentUser.adminId;
      } else if (currentUser.role === "admin") {
        // For admins, check only among other admins
        emailQuery.role = "admin";
      }

      const existingEmail = await User.findOne(emailQuery);
      if (existingEmail) {
        return res.status(400).json({
          error: "Email already in use by another user",
          field: "email",
        });
      }
    }

    // Username: Check global uniqueness across ALL users
    if (username) {
      const existingUsername = await User.findOne({
        username: username.trim(),
        _id: { $ne: req.user.userId }, // Exclude current user
      });
      if (existingUsername) {
        return res.status(400).json({
          error: "Username already taken. Please choose a different username.",
          field: "username",
        });
      }
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log(`✅ User profile updated: ${user.username}`);

    invalidateUserTenantContext(req.user.userId);

    const responseUser = user.toObject({ versionKey: false });
    if (responseUser.role !== "admin") {
      delete responseUser.vectorStorePath;
    }

    res.json({
      message: "Profile updated successfully",
      user: responseUser,
    });
  } catch (err) {
    console.error("❌ Profile update error:", err);

    // Handle mongoose validation errors
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    // Handle duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({
        error: `${field.charAt(0).toUpperCase() + field.slice(1)
          } already in use`,
        field,
      });
    }

    res.status(500).json({ error: "Update failed" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // If the current user is an admin, only show users they created
    // If somehow a regular user accesses this, show nothing
    let query = {};
    if (currentUserRole === "admin") {
      query.adminId = currentUserId;
    } else {
      // Regular users shouldn't access this endpoint, but just in case
      return res.status(403).json({ error: "Access denied" });
    }

    // Search functionality
    const searchTerm = req.query.search?.trim();
    if (searchTerm) {
      // Case-insensitive search across name, username, and email
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { username: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
      ];
    }

    // Pagination parameters - default to 5 per page
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * limit;

    // Get total count for pagination (with search filter applied)
    const totalCount = await User.countDocuments(query);

    // Fetch users with pagination - ONLY the current page's data
    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const payload = users.map((user) =>
      toSafeUser(user, { includeVectorStore: true })
    );

    const totalPages = Math.ceil(totalCount / limit);

    console.log(
      `📄 Pagination: Page ${page}, Limit ${limit}, Search: "${searchTerm || "none"
      }", Total: ${totalCount}, Pages: ${totalPages}, Returning: ${payload.length
      } users`
    );

    res.json({
      users: payload,
      count: payload.length,
      totalCount,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.createUser = async (req, res) => {
  const { name, email, username, password, maxBots, maxAgents, apiKey } = req.body;
  const requestedActive = req.body.isActive;

  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Only admins can create users
    if (currentUserRole !== "admin") {
      return res
        .status(403)
        .json({ error: "Only administrators can create users" });
    }

    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedUsername = username.trim();
    const sanitizedName = name.trim();
    const isActive = normalizeBoolean(requestedActive, true);

    // Parse maxBots exactly as provided by admin
    const userMaxBots = Number(maxBots);

    // Parse maxAgents (default to 0 if not provided)
    const userMaxAgents = maxAgents !== undefined ? Number(maxAgents) : 0;

    // Check for duplicate email and username for the ONE user
    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: sanitizedEmail, adminId: currentUserId }),
      User.findOne({ username: sanitizedUsername }),
    ]);

    if (existingEmail) {
      return res.status(400).json({
        error: `Email ${sanitizedEmail} already in use by another user under your account`,
        field: "email",
      });
    }

    if (existingUsername) {
      return res.status(400).json({
        error: `Username ${sanitizedUsername} already taken. Please choose a different username.`,
        field: "username",
      });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create ONE user
    const user = new User({
      name: sanitizedName,
      email: sanitizedEmail,
      username: sanitizedUsername,
      password: hashedPassword,
      role: "user",
      isActive,
      adminId: currentUserId,
      maxBots: userMaxBots,
      maxAgents: userMaxAgents,
      apiKey: apiKey ? apiKey.trim() : undefined, // Store API key if provided
    });

    // Provision user-level resources
    try {
      const resources = provisionResourcesForUser({
        userId: user._id.toString(),
        username: sanitizedUsername,
      });
      user.set(resources);
    } catch (provisionErr) {
      console.error("❌ User provisioning failed:", provisionErr);
      return res
        .status(500)
        .json({ error: "Failed to provision user resources" });
    }

    await user.save();
    console.log(`✅ User created: ${sanitizedUsername}`);

    // Return response
    const safeUser = toSafeUser(user, { includeVectorStore: true });

    res.status(201).json({
      message: "User created successfully",
      user: safeUser,
    });
  } catch (err) {
    console.error("❌ Create user error:", err);

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({
        error: `${field.charAt(0).toUpperCase() + field.slice(1)
          } already in use`,
        field,
      });
    }

    res.status(500).json({ error: "Failed to create user" });
  }
};

exports.getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only view users they created
    if (
      currentUserRole === "admin" &&
      user.adminId &&
      user.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only view users you created" });
    }

    // Regular users can only view their own profile
    if (currentUserRole === "user" && user._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only view your own profile" });
    }

    res.json({ user: toSafeUser(user, { includeVectorStore: true }) });
  } catch (err) {
    console.error(`❌ Error fetching user ${id}:`, err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

exports.getUserResources = async (req, res) => {
  const { id } = req.params;

  try {
    const tenantContext = await getUserTenantContext(id, {
      forceRefresh: true,
    });
    res.json({
      tenant: tenantContext,
    });
  } catch (err) {
    console.error(`❌ Error loading tenant context for ${id}:`, err);
    const status = err.statusCode || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to load tenant resources" });
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, username, password, isActive, maxBots, maxAgents, apiKey } =
    req.body;

  const updates = {};

  if (name) {
    updates.name = name.trim();
  }
  if (email) {
    updates.email = email.toLowerCase().trim();
  }
  if (username) {
    updates.username = username.trim();
  }
  if (typeof isActive !== "undefined") {
    updates.isActive = normalizeBoolean(isActive, true);
  }
  // Allow admins to update maxBots
  if (typeof maxBots !== "undefined") {
    const parsedMaxBots = Number(maxBots);
    if (isNaN(parsedMaxBots) || parsedMaxBots < 1 || parsedMaxBots > 10) {
      return res.status(400).json({
        error: "maxBots must be a number between 1 and 10",
        field: "maxBots",
      });
    }
    updates.maxBots = parsedMaxBots;
  }
  // Allow admins to update maxAgents
  if (typeof maxAgents !== "undefined") {
    const parsedMaxAgents = Number(maxAgents);
    if (isNaN(parsedMaxAgents) || parsedMaxAgents < 0 || parsedMaxAgents > 50) {
      return res.status(400).json({
        error: "maxAgents must be a number between 0 and 50",
        field: "maxAgents",
      });
    }
    updates.maxAgents = parsedMaxAgents;
  }
  // Allow admins to update their API key
  if (typeof apiKey !== "undefined") {
    updates.apiKey = apiKey ? apiKey.trim() : null;
  }

  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    // Check if user exists and verify ownership
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only update users they created
    if (
      currentUserRole === "admin" &&
      userToUpdate.adminId &&
      userToUpdate.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error: "Access denied: You can only update users you created",
        });
    }

    // Regular users can only update their own profile
    if (
      currentUserRole === "user" &&
      userToUpdate._id.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only update your own profile" });
    }

    // Get the adminId for scoping duplicate checks
    const adminIdForCheck =
      currentUserRole === "admin" ? currentUserId : userToUpdate.adminId;

    // Email: Check uniqueness within the same admin's scope
    if (updates.email) {
      const existingEmail = await User.findOne({
        email: updates.email,
        adminId: adminIdForCheck,
        _id: { $ne: id },
      });
      if (existingEmail) {
        return res
          .status(400)
          .json({
            error: "Email already in use by another user under this admin",
            field: "email",
          });
      }
    }

    // Username: Check global uniqueness across ALL users
    if (updates.username) {
      const existingUsername = await User.findOne({
        username: updates.username,
        _id: { $ne: id },
      });
      if (existingUsername) {
        return res
          .status(400)
          .json({
            error:
              "Username already taken. Please choose a different username.",
            field: "username",
          });
      }
    }

    if (password) {
      updates.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    invalidateUserTenantContext(id);

    res.json({
      message: "User updated successfully",
      user: toSafeUser(updatedUser, { includeVectorStore: true }),
    });
  } catch (err) {
    console.error(`❌ Error updating user ${id}:`, err);

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    res.status(500).json({ error: "Failed to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  if (req.user.userId === id) {
    return res.status(400).json({
      error: "You cannot delete your own account while signed in",
    });
  }

  try {
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only delete users they created
    if (
      currentUserRole === "admin" &&
      user.adminId &&
      user.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error: "Access denied: You can only delete users you created",
        });
    }

    // Regular users shouldn't be able to delete anyone
    if (currentUserRole === "user") {
      return res
        .status(403)
        .json({ error: "Access denied: Users cannot delete accounts" });
    }

    // Delete all bots owned by this user
    await Bot.deleteMany({ userId: id });

    await user.deleteOne();
    invalidateUserTenantContext(id);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(`❌ Error deleting user ${id}:`, err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

/**
 * Get or generate API token for widget authentication
 * @route   GET /api/user/api-token
 * @access  Protected (requires JWT)
 * @query   {boolean} regenerate - Force regenerate a new token
 * @returns {Object} { apiToken: string }
 */
exports.getApiToken = async (req, res) => {
  try {
    const userId = req.user.userId;
    const regenerate = req.query.regenerate === "true";

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If user already has a token and regenerate not requested, return it
    if (user.apiToken && !regenerate) {
      return res.json({ apiToken: user.apiToken });
    }

    // Generate new API token
    const apiToken = user.generateApiToken();
    await user.save();

    console.log(
      `🔑 API token ${regenerate ? "regenerated" : "generated"} for user: ${user.username
      }`
    );

    res.json({ apiToken });
  } catch (err) {
    console.error("❌ Error generating API token:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Failed to generate API token" });
  }
};

/**
 * Get API token for a specific user (admin only)
 * @route   GET /api/users/:id/api-token
 * @access  Protected (requires JWT, admin only)
 * @param   {string} id - User ID
 * @query   {boolean} regenerate - Force regenerate a new token
 * @returns {Object} { apiToken: string }
 */
exports.getUserApiToken = async (req, res) => {
  try {
    const { id } = req.params;
    const regenerate = req.query.regenerate === "true";
    const currentUserRole = req.user.role;
    const currentUserId = req.user.userId;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only get tokens for users they created
    if (
      currentUserRole === "admin" &&
      user.adminId &&
      user.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error:
            "Access denied: You can only access tokens for users you created",
        });
    }

    // Regular users can only get their own token
    if (currentUserRole === "user" && user._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only access your own token" });
    }

    // If user already has a token and regenerate not requested, return it
    if (user.apiToken && !regenerate) {
      return res.json({ apiToken: user.apiToken });
    }

    // Generate new API token
    const apiToken = user.generateApiToken();
    await user.save();

    console.log(
      `🔑 API token ${regenerate ? "regenerated" : "generated"} for user: ${user.username
      } (by ${req.user.username})`
    );

    res.json({ apiToken });
  } catch (err) {
    console.error("❌ Error generating API token:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Failed to generate API token" });
  }
};

/**
 * Get API token for a specific bot
 * @route   GET /api/bots/:botId/api-token
 * @access  Protected (requires JWT)
 * @param   {string} botId - Bot ID
 * @returns {Object} { apiToken: string }
 */
exports.getBotApiToken = async (req, res) => {
  try {
    const { botId } = req.params;
    const currentUserRole = req.user.role;
    const currentUserId = req.user.userId;

    const bot = await Bot.findById(botId).populate("userId");

    if (!bot) {
      return res.status(404).json({ error: "Bot not found" });
    }

    // Admins can only get tokens for bots of users they created
    if (
      currentUserRole === "admin" &&
      bot.userId.adminId &&
      bot.userId.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error: "Access denied: You can only access tokens for your bots",
        });
    }

    // Regular users can only get tokens for their own bots
    if (
      currentUserRole === "user" &&
      bot.userId._id.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only access your own bots" });
    }

    res.json({ apiToken: bot.apiToken });
  } catch (err) {
    console.error("❌ Error fetching bot API token:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch bot API token" });
  }
};

/**
 * Get all bots for a user
 * @route   GET /api/users/:id/bots
 * @access  Protected (requires JWT)
 * @param   {string} id - User ID
 * @returns {Object} { bots: Array }
 */
exports.getUserBots = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserRole = req.user.role;
    const currentUserId = req.user.userId;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only view bots for users they created
    if (
      currentUserRole === "admin" &&
      user.adminId &&
      user.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error: "Access denied: You can only view bots for users you created",
        });
    }

    // Regular users can only view their own bots
    if (currentUserRole === "user" && user._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only view your own bots" });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await Bot.countDocuments({ userId: id });

    // Find bots with pagination
    const bots = await Bot.find({ userId: id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const botsWithId = bots.map((bot) => {
      const botObj = bot.toObject({ versionKey: false });
      return {
        ...botObj,
        id: botObj._id,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      bots: botsWithId,
      count: botsWithId.length,
      totalCount,
      page,
      limit,
      totalPages
    });
  } catch (err) {
    console.error("❌ Error fetching user bots:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch user bots" });
  }
};

/**
 * Get all agents for a user
 * @route   GET /api/users/:id/agents
 * @access  Protected (requires JWT, admin only for viewing other users' agents)
 * @param   {string} id - User ID
 * @returns {Object} { agents: Array, count: number, maxAgents: number }
 */
exports.getUserAgents = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserRole = req.user.role;
    const currentUserId = req.user.userId;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Admins can only view agents for users they created
    if (
      currentUserRole === "admin" &&
      user.adminId &&
      user.adminId.toString() !== currentUserId
    ) {
      return res
        .status(403)
        .json({
          error:
            "Access denied: You can only view agents for users you created",
        });
    }

    // Regular users can only view their own agents
    if (currentUserRole === "user" && user._id.toString() !== currentUserId) {
      return res
        .status(403)
        .json({ error: "Access denied: You can only view your own agents" });
    }

    // Check if user has agents enabled
    if (!user.databaseUri) {
      return res.json({ agents: [], count: 0, maxAgents: user.maxAgents || 0 });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get agents from tenant database
    const Agent = await getAgentModel(user.databaseUri);

    // Get total count for pagination
    const totalCount = await Agent.countDocuments();

    // Find agents with pagination
    const agents = await Agent.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const agentsWithId = agents.map((agent) => agent.toPublicProfile());
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      agents: agentsWithId,
      count: agentsWithId.length,
      totalCount,
      page,
      limit,
      totalPages,
      maxAgents: user.maxAgents || 0,
    });
  } catch (err) {
    console.error("❌ Error fetching user agents:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch user agents" });
  }
};
/**
 * Get all conversations for the current user's tenant
 * Used by the ChatsPage for supervisor view
 * @route   GET /api/user/conversations
 * @access  Protected (requires JWT)
 * @returns {Object} { conversations: Array<Conversation> }
 */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get tenant context
    const tenantContext = await getUserTenantContext(userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: "Tenant database not provisioned"
      });
    }

    // Get tenant connection and models
    const mongoose = require("mongoose");
    const tenantConn = await getTenantConnection(tenantContext.databaseUri);

    // Load Conversation model
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bot',
        required: true,
        index: true
      },
      sessionId: {
        type: String,
        required: true,
        index: true,
        trim: true
      },
      status: {
        type: String,
        enum: ['bot', 'waiting', 'active', 'queued', 'assigned', 'closed', 'ai', 'human'],
        default: 'bot',
        required: true
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      requestedAt: {
        type: Date,
        default: null
      },
      endedAt: {
        type: Date,
        default: null
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    });

    const Conversation = tenantConn.models.Conversation ||
      tenantConn.model('Conversation', ConversationSchema);

    // Load Lead model to fetch visitor names
    const LeadSchema = new mongoose.Schema({
      name: { type: String, default: null, trim: true },
      phone: { type: String, default: null, trim: true },
      email: { type: String, default: null, lowercase: true, trim: true },
      session_id: { type: String, required: true, index: true, trim: true },
      created_at: { type: Date, default: Date.now }
    });

    const Lead = tenantConn.models.Lead || tenantConn.model('Lead', LeadSchema);

    // Fetch all conversations for this tenant, sorted by most recent first
    const conversations = await Conversation.find({})
      .sort({ lastActiveAt: -1 })
      .lean();

    console.log(`✅ Retrieved ${conversations.length} conversations for user ${userId}`);

    // Fetch visitor names from Lead collection
    const sessionIds = conversations.map((c) => c.sessionId).filter(Boolean);
    const leads = await Lead.find({ session_id: { $in: sessionIds } })
      .select("session_id name")
      .lean();
    const leadMap = Object.fromEntries(leads.map((l) => [l.session_id, l.name]));

    res.json({
      success: true,
      conversations: conversations.map(conv => ({
        _id: conv._id,
        botId: conv.botId,
        sessionId: conv.sessionId,
        visitorName: leadMap[conv.sessionId] || null, // Add visitor name from Lead collection
        status: conv.status,
        assignedAgent: conv.assignedAgent,
        agentId: conv.agentId,
        requestedAt: conv.requestedAt,
        endedAt: conv.endedAt,
        createdAt: conv.createdAt,
        lastActiveAt: conv.lastActiveAt
      }))
    });
  } catch (err) {
    console.error("❌ Error fetching conversations:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: "Failed to fetch conversations",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
};

/**
 * Get conversations for a specific agent (per-agent supervisor view)
 * @route   GET /api/user/agents/:agentId/conversations
 * @access  Protected (requires JWT)
 * @param   agentId - The agent ID
 * @returns {Object} { conversations: Array<Conversation> }
 */
exports.getAgentConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: "agentId is required"
      });
    }

    // Get tenant context
    const tenantContext = await getUserTenantContext(userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: "Tenant database not provisioned"
      });
    }

    // Get tenant connection and models
    const mongoose = require("mongoose");
    const tenantConn = await getTenantConnection(tenantContext.databaseUri);

    // Load Conversation model
    const ConversationSchema = new mongoose.Schema({
      botId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bot',
        required: true,
        index: true
      },
      sessionId: {
        type: String,
        required: true,
        index: true,
        trim: true
      },
      status: {
        type: String,
        enum: ['bot', 'waiting', 'active', 'queued', 'assigned', 'closed', 'ai', 'human'],
        default: 'bot',
        required: true
      },
      assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        default: null
      },
      requestedAt: {
        type: Date,
        default: null
      },
      endedAt: {
        type: Date,
        default: null
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      lastActiveAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    });

    const Conversation = tenantConn.models.Conversation ||
      tenantConn.model('Conversation', ConversationSchema);

    // Load Lead model to fetch visitor names
    const LeadSchema = new mongoose.Schema({
      name: { type: String, default: null, trim: true },
      phone: { type: String, default: null, trim: true },
      email: { type: String, default: null, lowercase: true, trim: true },
      session_id: { type: String, required: true, index: true, trim: true },
      created_at: { type: Date, default: Date.now }
    });

    const Lead = tenantConn.models.Lead || tenantConn.model('Lead', LeadSchema);

    // Fetch conversations for this specific agent, sorted by most recent first
    // Match either assignedAgent or agentId to be safe
    const conversations = await Conversation.find({
      $or: [
        { assignedAgent: agentId },
        { agentId: agentId }
      ]
    })
      .sort({ lastActiveAt: -1 })
      .lean();

    console.log(`✅ Retrieved ${conversations.length} conversations for agent ${agentId}`);

    // Fetch visitor names from Lead collection
    const sessionIds = conversations.map((c) => c.sessionId).filter(Boolean);
    const leads = await Lead.find({ session_id: { $in: sessionIds } })
      .select("session_id name")
      .lean();
    const leadMap = Object.fromEntries(leads.map((l) => [l.session_id, l.name]));

    res.json({
      success: true,
      conversations: conversations.map(conv => ({
        _id: conv._id,
        botId: conv.botId,
        sessionId: conv.sessionId,
        visitorName: leadMap[conv.sessionId] || null, // Add visitor name from Lead collection
        status: conv.status,
        assignedAgent: conv.assignedAgent,
        agentId: conv.agentId,
        requestedAt: conv.requestedAt,
        endedAt: conv.endedAt,
        createdAt: conv.createdAt,
        lastActiveAt: conv.lastActiveAt
      }))
    });
  } catch (err) {
    console.error("❌ Error fetching agent conversations:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: "Failed to fetch agent conversations",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
};
/**
 * Get messages for a specific conversation (read-only for supervisors)
 * @route   GET /api/user/conversations/:conversationId/messages
 * @access  Protected (requires JWT)
 * @param   conversationId - The conversation ID
 * @returns {Object} { messages: Array<Message> }
 */
exports.getConversationMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: "conversationId is required"
      });
    }

    // Get tenant context
    const tenantContext = await getUserTenantContext(userId);
    if (!tenantContext.databaseUri) {
      return res.status(503).json({
        success: false,
        error: "Tenant database not provisioned"
      });
    }

    // Get tenant connection and models
    const mongoose = require("mongoose");
    const tenantConn = await getTenantConnection(tenantContext.databaseUri);

    // Load Message model
    const MessageSchema = new mongoose.Schema({
      conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
      },
      sender: {
        type: String,
        enum: ['user', 'bot', 'agent'],
        required: true
      },
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 10000
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      },
      sources: {
        type: [String],
        default: undefined
      },
      metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined
      }
    });

    const Message = tenantConn.models.Message ||
      tenantConn.model('Message', MessageSchema);

    // Fetch messages for this conversation
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .lean();

    console.log(`✅ Retrieved ${messages.length} messages for conversation ${conversationId}`);

    res.json({
      success: true,
      messages: messages.map(msg => ({
        _id: msg._id,
        conversationId: msg.conversationId,
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
        sources: msg.sources,
        metadata: msg.metadata
      }))
    });
  } catch (err) {
    console.error("❌ Error fetching conversation messages:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    res.status(500).json({
      success: false,
      error: "Failed to fetch messages",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
};