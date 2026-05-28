const express = require('express');
const router = express.Router();
const { verifyTicket, GetTickets, scanVerifyTicket } = require('../controllers/securityScan');
const { login } = require('../controllers/securityAuth');
const protect = require('../middleware/middleware');

router.post('/Security-auth-login', login);
router.post('/verify-ticket', protect, verifyTicket);
router.get('/get-tickets/:id', protect, GetTickets);

// Called automatically when a device scans the QR code on a ticket
// No auth needed — this is triggered by the camera scan
router.get('/scan/:reference', scanVerifyTicket);

module.exports = router;