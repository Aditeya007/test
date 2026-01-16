// admin-backend/routes/auth.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middleware/validate');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { name, email, username, password }
 * @security Rate limited to prevent spam registrations
 */
router.post('/register', validateRegister, authController.registerUser);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get JWT token
 * @access  Public
 * @body    { username, password }
 */
router.post('/login', validateLogin, authController.loginUser);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset (forgot password)
 * @access  Public
 * @body    { email } or { username }
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 * @body    { token, password }
 */
router.post('/reset-password', authController.resetPassword);

module.exports = router;
