// dependency definition
const mysql = require('mysql');
const express = require('express');
const db = require('./connection/connection');
const app = express();
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// route definition
const authroutes = require("./routes/authRoutes")
const eventRoutes = require("./routes/events")
const purchaseRoutes = require("./routes/buy")
const SecurityCheck = require('./routes/verify')
const UserAuth = require('./routes/user');

// route usages
app.get('/', (req, res) => {
    res.send("welcome to the ticketing system backend")
})
app.use("/auth", authroutes)
app.use("/events", eventRoutes)
app.use("/tickets", purchaseRoutes)
app.use("/user", UserAuth)
app.use('/security', SecurityCheck)


// server start
const port = 3000
app.listen(port, () => {
    console.log(`the server is running on port ${port}`)
})