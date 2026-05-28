const db = require('../connection/connection');

const createTicket = (req, res) => {
    const { event_id } = req.params;
    const { ticket_type, price, quantity } = req.body;

    if (!event_id || !ticket_type || !price || !quantity) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const check = `
        SELECT * FROM ticket_types 
        WHERE event_id = ? AND name = ?
    `;

    db.query(check, [event_id, ticket_type], (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ message: "internal server error" });
        }

        if (results.length > 0) {
            return res.status(409).json({
                message: "This ticket type already exists"
            });
        }

        const insert = `
            INSERT INTO ticket_types 
            (event_id, name, price, quantity, remaining_quantity, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        `;

        db.query(
            insert,
            [
                event_id,
                ticket_type,
                price,
                quantity,
                quantity // important: remaining_quantity starts equal
            ],
            (err) => {
                if (err) {
                    console.log(err);
                    return res.status(500).json({ message: "internal server error" });
                }

                return res.status(201).json({
                    message: "Ticket created successfully"
                });
            }
        );
    });
};
module.exports = { createTicket };