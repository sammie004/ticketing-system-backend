const express = require('express');
const router = express.Router();

const {
  verifyTicket,
  GetTickets,
  scanVerifyTicket
} = require('../controllers/securityScan');

const { login } = require('../controllers/securityAuth');

const protect = require('../middleware/middleware');

/**
 * @openapi
 * /security/Security-auth-login:
 *   post:
 *     summary: Security staff login
 *     tags:
 *       - Security
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
 *                 example: security@event.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Server error
 */
router.post('/Security-auth-login', login);

/**
 * @openapi
 * /security/verify-ticket:
 *   post:
 *     summary: Manually verify a ticket
 *     tags:
 *       - Security
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ticket_reference
 *             properties:
 *               ticket_reference:
 *                 type: string
 *                 example: "TICKET-123-ABC"
 *     responses:
 *       200:
 *         description: Ticket verified successfully
 *       400:
 *         description: Invalid ticket
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ticket not found
 */
router.post('/verify-ticket', protect, verifyTicket);

/**
 * @openapi
 * /security/get-tickets/{id}:
 *   get:
 *     summary: Get tickets for a user or event
 *     tags:
 *       - Security
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User or event ID
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.get('/get-tickets/:id', protect, GetTickets);

/**
 * @openapi
 * /security/scan/{reference}:
 *   get:
 *     summary: Scan ticket via QR code (no auth required)
 *     tags:
 *       - Security
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket reference scanned from QR code
 *     responses:
 *       200:
 *         description: Ticket scanned successfully
 *       400:
 *         description: Invalid ticket
 *       404:
 *         description: Ticket not found
 */
router.get('/scan/:reference', scanVerifyTicket);

module.exports = router;