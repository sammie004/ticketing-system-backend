// controllers/buyTicket.js
const crypto = require("crypto");
const db = require("../connection/connection");

// 1️⃣ Initialize payment
const buyTicket = async (req, res) => {
  const user_id = req.user.user_id;
  const user_name = req.user.name;
  const user_email = req.user.email;
  const event_id = req.params.id;
  const { ticket_type } = req.body;

  if (!ticket_type) return res.status(400).json({ message: "Ticket type is required" });

  try {
    // Fetch ticket type info
    db.query(
      `SELECT * FROM ticket_types WHERE event_id = ? AND ticket_type = ? AND is_active = 1`,
      [event_id, ticket_type],
      async (err, results) => {
        if (err) return res.status(500).json({ message: "Database error", err });
        if (results.length === 0)
          return res.status(404).json({ message: "Ticket type not found for this event" });

        const ticketInfo = results[0];
        const amount = ticketInfo.price;

        // Generate reference
        const reference = crypto.randomUUID();

        // Initialize Paystack payment
        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user_email,
            amount: amount * 100,
            reference,
            metadata: { user_id, event_id, ticket_type, user_name },
            callback_url: `${process.env.FRONTEND_URL}/payment-success`,
          }),
        });

        const data = await response.json();
        if (!data.status) return res.status(400).json({ message: "Payment initialization failed" });

        res.status(200).json({ authorization_url: data.data.authorization_url, reference });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Payment initialization error" });
  }
};

// 2️⃣ Verify payment and create ticket
const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ message: "Reference is required" });

  try {
    // Verify payment with Paystack
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    const data = await response.json();
    if (!data.status || data.data.status !== "success")
      return res.status(400).json({ message: "Payment not successful" });

    const { event_id, ticket_type, user_id, user_name } = data.data.metadata;
    const user_email = data.data.customer.email;
    const amount_paid = data.data.amount / 100; // convert kobo to naira

    // Use transaction-safe queries to decrement ticket quantity and insert ticket
    db.getConnection((err, connection) => {
      if (err) return res.status(500).json({ message: "DB connection error", err });

      connection.beginTransaction(err => {
        if (err) {
          connection.release();
          return res.status(500).json({ message: "Transaction error", err });
        }

        // Decrement ticket quantity
        const updateQuantityQuery = `
          UPDATE ticket_types 
          SET quantity = quantity - 1 
          WHERE event_id = ? AND ticket_type = ? AND quantity > 0
        `;
        connection.query(updateQuantityQuery, [event_id, ticket_type], (err, result) => {
          if (err || result.affectedRows === 0) {
            return connection.rollback(() => {
              connection.release();
              res.status(400).json({ message: "Ticket not available", err });
            });
          }

          // Insert ticket
          const insertTicketQuery = `
            INSERT INTO tickets
            (event_id, user_id, ticket_reference, ticket_type, status, user_name, user_email, amount_paid)
            VALUES (?, ?, ?, ?, 'unused', ?, ?, ?)
          `;
          const ticket_reference = reference; // use Paystack reference
          connection.query(
            insertTicketQuery,
            [event_id, user_id, ticket_reference, ticket_type, user_name, user_email, amount_paid],
            (err, result) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ message: "Failed to save ticket", err });
                });
              }

              connection.commit(err => {
                connection.release();
                if (err) return res.status(500).json({ message: "Transaction commit failed", err });

                res.status(200).json({
                  message: "Payment verified and ticket created successfully",
                  ticket_id: result.insertId,
                });
              });
            }
          );
        });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Payment verification error" });
  }
};

module.exports = { buyTicket, verifyPayment };
