// backend code for ticket creation
const db = require('../connection/connection');

const createTicket = (req, res) => {
    const { event_id } = req.params
    const{ticket_type,price,quantity}= req.body

    if (!event_id || !ticket_type || !price || !quantity) {
        return res.status(400).json({ message: "All fields are required" });
    } else {
        const check = `select * from ticket_types where event_id = ? and ticket_type = ?`
        db.query(check, [event_id, ticket_type], (err, results) => {
            if (err) {
                console.log(`${err}`)
                return res.status(500).json({message:`internal server error`})
            }
            if (results.length > 0) {
                return res.status(409).json({message:`This ticket has been created already`})
            } else {
                const query1 = `insert into ticket_types (event_id,ticket_type,price,quantity,is_active) values (?,?,?,?,1)`
        db.query(query1, [event_id, ticket_type, price, quantity], (err, results) => {
            if (err) {
                console.log(`an errr occured \n ${err}`)
                return res.status(500).json({message:`internal server error`})
            } else {
                console.log(`ticket created successfully`)
                return res.status(201).json({message:`Ticket created Successfully!`})
            }
        })
            }
        })
    }
}
module.exports = { createTicket }