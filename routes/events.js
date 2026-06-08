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

// upload middleware
const { safeUpload } = require("../middleware/upload");

const eventUpload = safeUpload([
  { name: "cover_image", maxCount: 1 },
  { name: "poster_image", maxCount: 1 },
]);

/**
 * @openapi
 * /events/create-event:
 *   post:
 *     summary: Create a new event
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               event_name:
 *                 type: string
 *               start_date:
 *                 type: string
 *               end_date:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               performers:
 *                 type: string
 *               location:
 *                 type: string
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               poster_image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Event created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post("/create-event", protect("ADMIN"), eventUpload, CreateEvent);

/**
 * @openapi
 * /events/cancel-event:
 *   put:
 *     summary: Cancel an event
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event cancelled
 *       404:
 *         description: Event not found
 */
router.put("/cancel-event", protect("ADMIN"), cancelEvent);

/**
 * @openapi
 * /events/reactivate-event:
 *   put:
 *     summary: Reactivate a cancelled event
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event reactivated
 */
router.put("/reactivate-event", protect("ADMIN"), reActivate);

/**
 * @openapi
 * /events/update-event-images:
 *   put:
 *     summary: Update event images
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               poster_image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Images updated successfully
 */
router.put(
  "/update-event-images",
  protect("ADMIN"),
  eventUpload,
  updateEventImages
);

/**
 * @openapi
 * /events/get-attendees/{event_id}:
 *   get:
 *     summary: Get event attendees
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: event_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of attendees
 *       404:
 *         description: Event not found
 */
router.get("/get-attendees/:event_id", protect("ADMIN"), getEventAttendees);

module.exports = router;