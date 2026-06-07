const express = require("express");
const router  = express.Router();
const { paystackWebhook } = require("../controllers/buyTicket");

// !! IMPORTANT — this route must use raw body, NOT express.json()
// Register this route BEFORE app.use(express.json()) in app.js
router.post(
  "/paystack",
  express.raw({ type: "application/json" }),  // capture raw body for HMAC verification
  (req, res, next) => {
    // parse body back to object after capturing raw bytes
    if (req.body && Buffer.isBuffer(req.body)) {
      req.body = JSON.parse(req.body.toString());
    }
    next();
  },
  paystackWebhook
);

module.exports = router;