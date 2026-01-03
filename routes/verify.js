const express = require('express');
const router = express.Router()
const { verifyTicket, GetTickets } = require('../controllers/securityScan')
const {login} = require('../controllers/securityAuth')  
const protect = require('../middleware/middleware')
router.post('/verify-ticket',protect,verifyTicket)
router.get('/get-tickets/:id', protect, GetTickets)
router.post('/Security-auth-login',login)
module.exports = router;