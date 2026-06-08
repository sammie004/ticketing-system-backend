const express = require("express");
const router = express.Router();

const { getDashboardData } = require("../Dashboard-data/dashboard");
const protect = require("../middleware/middleware");

/**
 * @openapi
 * /stats/dashboard/{event_id}:
 *   get:
 *     summary: Get event dashboard analytics
 *     tags:
 *       - Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       404:
 *         description: Event not found
 *       500:
 *         description: Server error
 */
router.get("/dashboard/:event_id", protect("ADMIN"), getDashboardData);

module.exports = router;