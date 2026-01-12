const express = require("express")
const router = express.Router()

const { getDashboardData } = require("../Dashboard-data/dashboard")
const  protect  = require("../middleware/middleware")
router.get("/dashboard/:event_id", protect, getDashboardData)
module.exports = router

