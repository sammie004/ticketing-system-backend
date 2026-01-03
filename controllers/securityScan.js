const db = require('../connection/connection')

const GetTickets = (req, res) => {
    const event_id = req.params.id
    const query1 = `select * from tickets where status = 'unused' and event_id = ?`
    db.query(query1,[event_id], (err, results) => { 
        if (err) {
            console.log(`internal server error`, err)
            return res.status(500).json({message:`internal server error`,err})
        } else {
            console.log(results)
            return res.status(200).json({tickets:results})
        }
    })
}
const verifyTicket = (req, res) => {
    const { ticket_reference } = req.body;

    if (!ticket_reference) {
        return res.status(400).json({
            message: "Ticket reference is required"
        });
    }

    const query2 = `
        UPDATE tickets
        SET status = 'used'
        WHERE ticket_reference = ? AND status = 'unused'
    `;
    
    db.query(query2, [ticket_reference], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                message: "Database error"
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Ticket not found or already verified"
            });
        }

        return res.status(200).json({
            message: "Ticket verified successfully"
        });
    });
};
module.exports = {GetTickets,verifyTicket};