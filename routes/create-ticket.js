const express = require("express")
const router = express.Router()
const { createTicket } = require("../controllers/create-ticket")
const protect = require("../middleware/middleware")
router.post('/create/:event_id', protect, createTicket)

module.exports = router