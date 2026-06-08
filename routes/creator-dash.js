const express = require("express");
const router = express.Router();

// controller
const { getCreatorDashboardData } = require("../controllers/creator-insights");

// middleware
const protect = require("../middleware/middleware");

/**
 * @openapi
 * /creator/creator-dashboard:
 *   get:
 *     summary: Get creator dashboard analytics data
 *     tags:
 *       - Creator
 *     security:
 *       - bearerAuth: []
 *     description: Returns insights and analytics for event creators (admin-only access)
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 *       500:
 *         description: Server error
 */
router.get("/creator-dashboard", protect("ADMIN"), getCreatorDashboardData);

module.exports = router;