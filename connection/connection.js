const mysql = require('mysql');
const dotenv = require("dotenv")
dotenv.config()
// connection to database
const connection = mysql.createConnection({
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    database:process.env.DB_NAME,
    port:process.env.DB_PORT
})
connection.connect((err) => {
    if (err) {
        console.log(`unable to connect to database\n\n please try again later\n${err}❌`)
    } else {
        console.log("connected to database successfully ✅")
    }
})
module.exports = connection;