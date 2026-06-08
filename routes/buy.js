const express = require("express");
const router  = express.Router();
const { buyTicket, verifyPayment } = require("../controllers/buyTicket");

/**
 * @openapi
 * /tickets/events/{id}/buy-ticket:
 *   post:
 *     summary: Buy a ticket for an event (guest checkout — no auth required)
 *     tags:
 *       - Tickets
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
 *               - name
 *               - email
 *               - ticket_type
 *               - quantity
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sammie
 *               email:
 *                 type: string
 *                 example: samzie12346@gmail.com
 *               phone_number:
 *                 type: string
 *                 example: "08031234567"
 *               ticket_type:
 *                 type: string
 *                 example: VIP
 *               quantity:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authorization_url:
 *                   type: string
 *                   example: https://checkout.paystack.com/xxxx
 *                 reference:
 *                   type: string
 *                   example: 0ce94f59-4b63-4814-9a4a-fdc16aa6277e
 *       400:
 *         description: Bad request — missing fields or not enough tickets
 *       404:
 *         description: Ticket type not found
 *       500:
 *         description: Server error
 */
router.post("/events/:id/buy-ticket", buyTicket);

/**
 * @openapi
 * /tickets/verify-payment:
 *   post:
 *     summary: Manually verify Paystack payment and issue tickets (local dev fallback)
 *     description: >
 *       Used as a fallback when the Paystack webhook cannot reach the server
 *       (e.g. local development without ngrok). In production the webhook
 *       handles verification automatically.
 *     tags:
 *       - Tickets
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *             properties:
 *               reference:
 *                 type: string
 *                 example: 0ce94f59-4b63-4814-9a4a-fdc16aa6277e
 *     responses:
 *       200:
 *         description: Payment verified and tickets issued — PDF emailed to buyer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 ticket_count:
 *                   type: integer
 *                 payment_reference:
 *                   type: string
 *       400:
 *         description: Payment not successful or reference missing
 *       500:
 *         description: Server error
 */
router.post("/verify-payment", verifyPayment);

module.exports = router;