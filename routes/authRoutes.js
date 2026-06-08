const express = require("express");
const router = express.Router();

// middleware
const protect = require("../middleware/middleware");

// controllers
const { SignUp, login, CSA } = require("../controllers/adminAuth");


/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Create admin account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created
 *       409:
 *         description: User already exists
 */
router.post("/signup", SignUp);


/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login admin
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", login);


/**
 * @swagger
 * /auth/Create-Staff-Account:
 *   post:
 *     summary: Create staff account (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Staff account created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/Create-Staff-Account", protect, CSA);


module.exports = router;