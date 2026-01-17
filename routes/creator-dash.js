const express = require("express")
const router = express.Router()

// call the controller
const { getCreatorDashboardData } = require("../controllers/creator-insights")
// autherntication middleware
const protect = require("../middleware/middleware")

// route to get creator dashboard data
router.get("/creator-dashboard", protect, getCreatorDashboardData)

module.exports = router