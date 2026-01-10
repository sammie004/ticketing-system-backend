const express = require("express")
const router = express.Router()

const { buyTicket,verifyPayment } = require("../controllers/buyTicket")
const protect = require("../middleware/middleware")
router.post("/events/:id/buy-ticket", protect, buyTicket)
router.get("/verify-payment", protect, verifyPayment)
module.exports = router