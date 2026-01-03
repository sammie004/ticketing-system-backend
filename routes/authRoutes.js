const express = require("express")
const router = express.Router()
// middleware
const  protect = require("../middleware/middleware") 
const { SignUp, login,CSA } = require("../controllers/adminAuth")
router.post("/signup", SignUp)
router.post("/login", login)
router.post("/Create-Staff-Account",protect,CSA)
module.exports = router