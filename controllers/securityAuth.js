const db = require('../connection/connection')
const jwt = require("jsonwebtoken")
const bcrypt = require('bcrypt')


// main controller functions
const login = (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        console.log(`Email and password are required`)
        return res.statuss(400).json({message:`Email and password are required`})
    } else {
        const query1 = `select * from event_staff where email = ?`
        db.query(query1, [email, password], (err, results) => {
            if (err) {
                console.log(`an error occured`, err)
                return res.status(500).json({message:`internal server error`})
            } else {
                const user = results[0]
                const match = bcrypt.compare(password, user.password_hash)
                if (!match) {
                    console.log(`invalid password entered`)
                    return res.status(400).json({message:`Invalid password has been entered`})
                } else {
                    const token = jwt.sign({ email: email, id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' })
                    console.log(`login successful`)
                    return res.status(200).json({ message:`login successful`,token,email:user.email,name:user.name})
                }
            }
        })
    }
}

module.exports={login}