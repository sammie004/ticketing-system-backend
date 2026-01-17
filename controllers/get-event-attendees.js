const db = require('../connection/connection');

const getEventAttendees = (req, res) => {
  const { event_id } = req.params;
  const creator_id = req.user.user_id; 

  // 1️⃣ Ensure requester owns the event
  const ownershipCheck = `
    SELECT id FROM events WHERE id = ? AND creator_id = ?
  `;

  db.query(ownershipCheck, [event_id, creator_id], (err, rows) => {
    if (err) return res.status(500).json({ message: "Server error" });
    if (rows.length === 0) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // 2️⃣ Fetch attendees
    const query = `
      SELECT
        u.user_id AS user_id,
        u.name,
        u.email,
        u.phone_number,
        t.ticket_type,
        t.ticket_reference,
        t.status,
        t.amount_paid
      FROM tickets t
      JOIN event_attendees u ON t.user_id = u.user_id
      WHERE t.event_id = ?
      ORDER BY u.name
    `;

    db.query(query, [event_id], (err, attendees) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Internal server error" });
      }

      res.status(200).json({
        event_id,
        total_attendees: attendees.length,
        attendees
      });
    });
  });
};

module.exports = { getEventAttendees };
