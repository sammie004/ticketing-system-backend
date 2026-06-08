const express = require("express");
const router = express.Router();

const { buyTicket, verifyPayment } = require("../controllers/buyTicket");
const protect = require("../middleware/middleware");

/**
 * @openapi
 * /tickets/events/{id}/buy-ticket:
 *   post:
 *     summary: Buy a ticket for an event
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               - quantity
 *             properties:
 *               ticket_type:
 *                 type: string
 *                 example: VIP
 *               quantity:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.post("/events/:id/buy-ticket", protect, buyTicket);

/**
 * @openapi
 * /tickets/verify-payment:
 *   get:
 *     summary: Verify Paystack payment and issue tickets
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reference
 *         required: false
 *         schema:
 *           type: string
 *         description: Payment reference from Paystack (if required by controller)
 *     responses:
 *       200:
 *         description: Payment verified and tickets issued
 *       400:
 *         description: Payment not successful or invalid reference
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/verify-payment", protect, verifyPayment);

module.exports = router;