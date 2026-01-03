const express = require("express")
const router = express.Router()

const { buyTicket } = require("../controllers/buyTicket")
const protect = require("../middleware/middleware")
router.post("/events/:id/buy-ticket", protect, buyTicket)

module.exports = router