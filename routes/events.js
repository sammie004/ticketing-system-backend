const express = require("express");
const protect = require("../middleware/middleware");
const router = express.Router();

const {
  CreateEvent,
  cancelEvent,
  reActivate,
  updateEventImages
} = require("../controllers/event-creation");

const { getEventAttendees } = require("../controllers/get-event-attendees");

// ONLY import safeUpload (clean version)
const { safeUpload } = require("../middleware/upload");

// ─────────────────────────────────────────────
// FILE UPLOAD MIDDLEWARE
// ─────────────────────────────────────────────
const eventUpload = safeUpload([
  { name: "cover_image", maxCount: 1 },
  { name: "poster_image", maxCount: 1 },
]);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
router.post("/create-event", protect, eventUpload, CreateEvent);

router.put("/cancel-event", protect, cancelEvent);

router.put("/reactivate-event", protect, reActivate);

router.put("/update-event-images", protect, eventUpload, updateEventImages);

router.get("/get-attendees/:event_id", protect, getEventAttendees);

module.exports = router;