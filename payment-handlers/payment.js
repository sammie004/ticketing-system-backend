// backend code for payment verification goes here
const db = require("../connection/connection");

const verifyPayment = async (req, res) => {
    const { reference } = req.query;

    if (!reference) {
        return res.status(400).json({ message: "Payment reference required" });
    }

    try {
        const response = await fetch(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            }
        );

        const data = await response.json();

        if (!data.status || data.data.status !== "success") {
            return res.status(400).json({
                message: "Payment not successful"
            });
        }

        const {
            user_id,
            event_id,
            ticket_type,
            user_name
        } = data.data.metadata;

        const amountPaid = data.data.amount / 100;

        // 1. Ensure ticket not already created
        const checkQuery = `
            SELECT id FROM tickets WHERE ticket_reference = ?
        `;

        db.query(checkQuery, [reference], (err, existing) => {
            if (existing.length > 0) {
                return res.status(200).json({
                    message: "Ticket already verified"
                });
            }

            // 2. Decrement ticket quantity
            const decrementQuery = `
                UPDATE ticket_types
                SET quantity = quantity - 1
                WHERE event_id = ?
                  AND ticket_type = ?
                  AND quantity > 0
            `;

            db.query(decrementQuery, [event_id, ticket_type], (err, result) => {
                if (err || result.affectedRows === 0) {
                    return res.status(400).json({
                        message: "Ticket sold out"
                    });
                }

                // 3. Save ticket
                const insertTicketQuery = `
                    INSERT INTO tickets
                    (event_id, user_id, ticket_reference, ticket_type, status,
                     user_name, user_email, amount_paid)
                    VALUES (?, ?, ?, ?, 'unused', ?, ?, ?)
                `;

                db.query(
                    insertTicketQuery,
                    [
                        event_id,
                        user_id,
                        reference,
                        ticket_type,
                        user_name,
                        data.data.customer.email,
                        amountPaid
                    ],
                    (err) => {
                        if (err) {
                            return res.status(500).json({
                                message: "Failed to save ticket"
                            });
                        }

                        return res.status(200).json({
                            message: "Payment verified & ticket issued"
                        });
                    }
                );
            });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Verification failed" });
    }
};

module.exports = { verifyPayment };
