const express = require("express")
const protect = require("../middleware/middleware")
const router = express.Router()
const { CreateEvent, cancelEvent, reActivate } = require("../controllers/event-creation")
router.post("/create-event", protect, CreateEvent)
router.put("/cancel-event", protect, cancelEvent)
router.put("/reactivate-event", protect, reActivate)
module.exports = router