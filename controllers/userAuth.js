const db = require('../connection/connection')
const bcrpyt = require('bcrypt')
const jwt = require("jsonwebtoken")
const dotenv = require("dotenv")
dotenv.config()

// signup route
const SignUp = (req, res) => {
    const { name, email, password } = req.body
    if (!email || !password) {
        console.log(`email and password required`)
        return res.status(404).json({ message: `Those fields cant be left empty` })
    }
    // check if the user already exists
    const query1 = `select * from event_attendees where email =?`
    db.query(query1, [email], async (err, results) => {
        if (err) {
            console.log(`an error occured`, err)
            return res.status(500).json({ message: `internal server error`, err })
        } else if (results.length > 0) {
            console.log(`this user already exists`)
            return res.status(409).json({ message: `this user already exists` })
        } else {
            const query2 = `insert into event_attendees (name, email, password) values (?, ?, ?)`
            const hashed_password = await bcrpyt.hash(password, 10)
            db.query(query2, [name, email, hashed_password], (err, result) => {
                if (err) {
                    console.log(`an error occured`, err)
                    return res.status(500).json({ message: `internal server error`, err })
                } else {
                    console.log(`user created successfully`)
                    return res.status(201).json({ message: `user created successfully` })
                }
            })
        }
    })
}


// login controller setuop
const Login = (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        console.log(`those fields are required`)
        return res.status(400).json({message:`Those fields cant be left empty`})
    } else {
        const query2 = `select * from event_attendees where email = ?`
        db.query(query2, [email], (err, results) => {
            if (err) {
                console.log(`an error occured`, err)
                return res.status(500).json({message:`internal server error`})
            } else {
                if (results.length === 0) {
                    console.log(`No user found with this email \n Please try again!`)
                    return res.status(404).json({ message:`No user found with this email \n Please try again!`})
                }
                const user = results[0]
                const match = bcrpyt.compare(password, user.password)
                if (!match) {
                    console.log(`invalid email or password`)
                    return res.status(400).json({message:`invalid email or password`})
                } else {
                    const token = jwt.sign({ user_id: user.user_id, email: user.email , name:user.name}, process.env.JWT_SECRET, { expiresIn: '1h' })
                    console.log(`login successful`)
                    return res.status(200).json({message:`welcome back user ${email}`,email:user.email,token})
                }
            }
        })
    }
}
module.exports = {
    SignUp,Login
}