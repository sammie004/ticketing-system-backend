const db = require('../connection/connection')
const bcrypt = require('bcrypt')
const jwt = require("jsonwebtoken")
const dotenv = require("dotenv")
dotenv.config()

// signup route
const SignUp = (req, res) => {
    const { name, email, password, phone_number } = req.body
    if (!email || !password) {
        return res.status(400).json({ message: `Email and password are required` })
    }

    const query1 = `SELECT * FROM event_attendees WHERE email = ?`
    db.query(query1, [email], async (err, results) => {
        if (err) {
            console.error(`SignUp DB error:`, err)
            return res.status(500).json({ message: `Internal server error`, err })
        }
        if (results.length > 0) {
            return res.status(409).json({ message: `An account with this email already exists` })
        }

        const hashed_password = await bcrypt.hash(password, 10)
        const query2 = `INSERT INTO event_attendees (name, email, password, phone_number) VALUES (?, ?, ?, ?)`
        db.query(query2, [name, email, hashed_password, phone_number], (err) => {
            if (err) {
                console.error(`SignUp insert error:`, err)
                return res.status(500).json({ message: `Internal server error`, err })
            }
            return res.status(201).json({ message: `Account created successfully` })
        })
    })
}


// login controller
const Login = async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(400).json({ message: `Email and password are required` })
    }

    const query = `SELECT * FROM event_attendees WHERE email = ?`
    db.query(query, [email], async (err, results) => {
        if (err) {
            console.error(`Login DB error:`, err)
            return res.status(500).json({ message: `Internal server error` })
        }
        if (results.length === 0) {
            return res.status(404).json({ message: `No account found with this email` })
        }

        const user = results[0]

        // ✅ FIXED: bcrypt.compare is async — must be awaited
        const match = await bcrypt.compare(password, user.password)
        if (!match) {
            return res.status(401).json({ message: `Invalid email or password` })
        }

        const token = jwt.sign(
            { user_id: user.id, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        )

        return res.status(200).json({
            message: `Welcome back, ${user.name}`,
            email: user.email,
            name: user.name,
            token,
        })
    })
}

module.exports = { SignUp, Login }