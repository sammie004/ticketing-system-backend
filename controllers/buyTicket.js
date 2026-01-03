// dependency declaration
const crypto = require("crypto")
const transporter = require("../middleware/emailConfig")    
const db = require("../connection/connection")
// main controllers (functions)
const buyTicket = (req, res) => {
    const user_id = req.user.user_id
    const user_name = req.user.name
    const user_email = req.user.email
    const event_id = req.params.id
    const {ticket_type} = req.body

    // 1. Validation
    if (!event_id || !user_id) {
        return res.status(400).json({
            message: "Event ID and User ID are required"
        })
    }

    if (!ticket_type) {
        return res.status(400).json({
            message: "Ticket type is required"
        })
    }

    // 2. Generate ticket reference
    const ticket_reference = crypto.randomUUID()

    // 3. Check event exists & is active
    const checkEventQuery = `
        SELECT id FROM events 
        WHERE id = ? AND is_active = 1
    `

    db.query(checkEventQuery, [event_id], (err, eventResult) => {
        if (err) {
            console.error(err)
            return res.status(500).json({ message: "Database error" })
        }

        if (eventResult.length === 0) {
            return res.status(404).json({
                message: "Event not found or inactive"
            })
        }

        // 4. Insert ticket
        const insertTicketQuery = `
            INSERT INTO tickets 
            (event_id, user_id, ticket_reference, ticket_type, status,user_name,user_email)
            VALUES (?, ?, ?, ?, 'unused',?,?)
        `

        db.query(
            insertTicketQuery,
            [event_id, user_id, ticket_reference, ticket_type,user_name,user_email],
            (err, result) => {
                if (err) {
                    console.error(err)
                    return res.status(500).json({
                        message: "Failed to purchase ticket"
                    })
                }

                // 5. Success response
                return res.status(201).json({
                    message: "Ticket purchased successfully",
                    ticket: {
                        id: result.insertId,
                        event_id,
                        user_id,
                        user_email,
                        user_name,
                        ticket_reference,
                        ticket_type,
                        status: "unused"
                    }
                })
            }
        )
    })
}

module.exports = { buyTicket }
