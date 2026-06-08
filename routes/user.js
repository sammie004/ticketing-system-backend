const express = require("express");
const router = express.Router();

const { SignUp, Login } = require("../controllers/userAuth");

/**
 * @openapi
 * /user/signup:
 *   post:
 *     summary: User registration
 *     tags:
 *       - User Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: johndoe@email.com
 *               password:
 *                 type: string
 *                 example: strongpassword123
 *               phone_number:
 *                 type: string
 *                 example: "08012345678"
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Bad request
 *       409:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
router.post("/signup", SignUp);

/**
 * @openapi
 * /user/login:
 *   post:
 *     summary: User login
 *     tags:
 *       - User Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@email.com
 *               password:
 *                 type: string
 *                 example: strongpassword123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post("/login", Login);

module.exports = router;