const express = require("express");
const router = express.Router();

const { createTicket } = require("../controllers/create-ticket");
const protect = require("../middleware/middleware");

/**
 * @openapi
 * /create-ticket/create/{event_id}:
 *   post:
 *     summary: Create ticket type for an event (Admin only)
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ticket_type
 *               - price
 *               - quantity
 *             properties:
 *               ticket_type:
 *                 type: string
 *                 example: VIP
 *               price:
 *                 type: number
 *                 example: 15000
 *               quantity:
 *                 type: integer
 *                 example: 100
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       500:
 *         description: Server error
 */
router.post("/create/:event_id", protect("ADMIN"), createTicket);

module.exports = router;