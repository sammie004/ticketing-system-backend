const db = require('../connection/connection');
const bcrpyt = require("bcrypt")
const jwt = require("jsonwebtoken")



// admin signup controller
const SignUp = (req, res) => {
    const {name, email, password } = req.body
    if (!email || !password) {
        console.log(`email and password required`)
        return res.status(404).json({message:`Those fields cant be left empty`})
    } else {
        // check if admin already exists
        const query1 = `select * from event_creators where email = ?`
        db.query(query1, [email], async(err, result) => { 
            if (err) {
                console.log(`an error occured`, err)
                return res.status(500).json({message:`itnernal server error`,err})
            } else if (result.length > 0) {
                console.log(`admin already exists`)
                return res.status(409).json({message:`this user already exists`})
            } else {
                const query2 = `insert into event_creators (name, email, password) values (?, ?, ?)`
                const hashed_password = await bcrpyt.hash(password, 10)
                db.query(query2, [name, email, hashed_password], (err, result) => {
                    if (err) {
                        console.log(`an error occured`, err)
                        return res.status(500).json({message:`itnernal server error`,err})
                    } else {
                        console.log(`admin created successfully`)
                        return res.status(201).json({message:`admin created successfully`})
                    }
                })
            }
        })
    }
}
// admin login controller
const login = (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        console.log(`email and password required`)
        return res.status(404).json({message:`Those fields cant be left empty`})
    }
    const query3 = `select * from event_creators where email =?`
    db.query(query3, [email], async (err, results)=>{
        if (err) {
            console.log(`an error occured`, err)
            return res.status(500).json({message:`internal server error`})
        } else {
            if (results.length === 0) {
                console.log(`no user found with thie email`)
            }
            const user = results[0]
            const match = await bcrpyt.compare(password, user.password)
            if (!match) {
                console.log(`invalid email or password`)
                return res.status(400).json({message:`invalid email or password`})
            } else {
                token = jwt.sign({id:user.id,email: email}, process.env.JWT_SECRET, {expiresIn: '1h'})
                console.log(`user signed in successfully`)
                return res.status(200).json({message:`Login Successful`, name: user.name, email: user.email, token: token})
            }
      }
    })
}

// create staff account
const CSA = async (req, res) => {
    const { name, email, password, role } = req.body
    if (!name || !email || !password || !role) {
        console.log(`those fields cant be left empty`)
    } else {
        const query4 = `select * from  event_staff where email = ?`
        db.query(query4, [email], async (err, results) => {
            if (err) {
                console.log(`internal server error`)
                return res.status(500).json({message:`internal server error`})
            }
            if (results.length > 0) {
                console.log(`this account already exists`)
                return res.status(400).json({message:`this account already exists`})
            } else {
                const query5 = `insert into event_staff (name,email,role,password_hash) values (?,?,?,?)`
                const salt = 10
                const password_hash = await bcrpyt.hash(password, salt)
                db.query(query5, [name, email, role, password_hash],(err, results)=> {
                    if(err){
                        console.log(`internal server error`)
                        return res.status(500).json({message:`internal server error`})
                    } else {
                        console.log(`Staff account created successfully`)
                        return res.status(200).json({message:`Staff account created successfully`})
                    }
                })
            }
        })
    }
}
module.exports = {
    SignUp,login,CSA
}