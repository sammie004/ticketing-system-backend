const db = require('../connection/connection');

// -------------------------------------------------------
// GET ALL UNUSED TICKETS FOR AN EVENT
// Route: GET /api/security/tickets/:id
// -------------------------------------------------------
const GetTickets = (req, res) => {
    const event_id = req.params.id;

    const query = `
        SELECT 
            t.id,
            t.ticket_reference,
            t.ticket_type,
            t.status,
            t.user_name,
            t.user_email,
            t.amount_paid,
            t.scanned_at,
            e.event_name,
            e.event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.status = 'unused' AND t.event_id = ?
    `;

    db.query(query, [event_id], (err, results) => {
        if (err) {
            console.error('GetTickets DB error:', err);
            return res.status(500).json({ message: 'Internal server error', err });
        }

        return res.status(200).json({
            total: results.length,
            tickets: results,
        });
    });
};


// -------------------------------------------------------
// VERIFY TICKET BY REFERENCE (manual input by security)
// Route: POST /api/security/verify
// Body: { ticket_reference }
// -------------------------------------------------------
const verifyTicket = (req, res) => {
    const { ticket_reference } = req.body;

    if (!ticket_reference) {
        return res.status(400).json({ message: 'Ticket reference is required' });
    }

    // First fetch the ticket so we can return attendee details
    const selectQuery = `
        SELECT 
            t.ticket_reference,
            t.ticket_type,
            t.status,
            t.user_name,
            t.user_email,
            t.amount_paid,
            t.scanned_at,
            e.event_name,
            e.event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.ticket_reference = ?
    `;

    db.query(selectQuery, [ticket_reference], (err, results) => {
        if (err) {
            console.error('verifyTicket select error:', err);
            return res.status(500).json({ message: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({
                valid: false,
                message: '❌ Ticket not found',
            });
        }

        const ticket = results[0];

        // Ticket already used — return details of when it was scanned
        if (ticket.status === 'used') {
            return res.status(200).json({
                valid: false,
                message: '⚠️ Ticket already used',
                ticket: {
                    event_name: ticket.event_name,
                    event_date: ticket.event_date,
                    ticket_type: ticket.ticket_type,
                    user_name: ticket.user_name,
                    user_email: ticket.user_email,
                    ticket_reference: ticket.ticket_reference,
                    scanned_at: ticket.scanned_at,
                },
            });
        }

        // Mark as used
        const updateQuery = `
            UPDATE tickets 
            SET status = 'used', scanned_at = NOW()
            WHERE ticket_reference = ? AND status = 'unused'
        `;

        db.query(updateQuery, [ticket_reference], (err, result) => {
            if (err) {
                console.error('verifyTicket update error:', err);
                return res.status(500).json({ message: 'Failed to update ticket status' });
            }

            if (result.affectedRows === 0) {
                // Edge case: another request marked it used between select and update
                return res.status(409).json({
                    valid: false,
                    message: '⚠️ Ticket was just used by another scan',
                });
            }

            return res.status(200).json({
                valid: true,
                message: '✅ Entry granted',
                ticket: {
                    event_name: ticket.event_name,
                    event_date: ticket.event_date,
                    ticket_type: ticket.ticket_type,
                    user_name: ticket.user_name,
                    user_email: ticket.user_email,
                    ticket_reference: ticket.ticket_reference,
                },
            });
        });
    });
};


// -------------------------------------------------------
// SCAN & VERIFY TICKET VIA QR CODE
// Route: GET /api/security/scan/:reference
// Called automatically when a device scans the QR code
// -------------------------------------------------------
const scanVerifyTicket = (req, res) => {
    const { reference } = req.params;

    if (!reference) {
        return res.status(400).json({ valid: false, message: 'No ticket reference provided' });
    }

    const selectQuery = `
        SELECT 
            t.ticket_reference,
            t.ticket_type,
            t.status,
            t.user_name,
            t.user_email,
            t.amount_paid,
            t.scanned_at,
            e.event_name,
            e.event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.ticket_reference = ?
    `;

    db.query(selectQuery, [reference], (err, results) => {
        if (err) {
            console.error('scanVerifyTicket DB error:', err);
            return res.status(500).json({ valid: false, message: 'Database error', err });
        }

        if (results.length === 0) {
            return res.status(404).json({ valid: false, message: '❌ Ticket not found' });
        }

        const ticket = results[0];

        // Already scanned
        if (ticket.status === 'used') {
            return res.status(200).json({
                valid: false,
                message: '⚠️ Ticket already used',
                ticket: {
                    event_name: ticket.event_name,
                    event_date: ticket.event_date,
                    ticket_type: ticket.ticket_type,
                    user_name: ticket.user_name,
                    user_email: ticket.user_email,
                    ticket_reference: ticket.ticket_reference,
                    scanned_at: ticket.scanned_at,
                },
            });
        }

        // Mark as used and record scan time
        const updateQuery = `
            UPDATE tickets 
            SET status = 'used', scanned_at = NOW()
            WHERE ticket_reference = ? AND status = 'unused'
        `;

        db.query(updateQuery, [reference], (err, result) => {
            if (err) {
                console.error('scanVerifyTicket update error:', err);
                return res.status(500).json({ valid: false, message: 'Failed to update ticket status' });
            }

            if (result.affectedRows === 0) {
                return res.status(409).json({
                    valid: false,
                    message: '⚠️ Ticket was just used by another scan',
                });
            }

            return res.status(200).json({
                valid: true,
                message: '✅ Valid ticket! Entry granted.',
                ticket: {
                    event_name: ticket.event_name,
                    event_date: ticket.event_date,
                    ticket_type: ticket.ticket_type,
                    user_name: ticket.user_name,
                    user_email: ticket.user_email,
                    ticket_reference: ticket.ticket_reference,
                },
            });
        });
    });
};


module.exports = { GetTickets, verifyTicket, scanVerifyTicket };