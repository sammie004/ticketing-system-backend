const db = require('../connection/connection')

const getCreatorDashboardData = (req, res) => {
    const creator_id = req.user.user_id; // creator_id from logged-in user

    const queries = {
        totalTickets: `
            SELECT SUM(tt.quantity) AS total_tickets
            FROM ticket_types tt
            JOIN events e ON tt.event_id = e.id
            WHERE e.creator_id = ? AND tt.is_active = 1
        `,
        ticketsSold: `
            SELECT SUM(p.quantity) AS tickets_sold
            FROM payments p
            JOIN events e ON p.event_id = e.id
            WHERE e.creator_id = ? AND p.status = 'success'
        `,
        totalRevenue: `
            SELECT SUM(p.amount) AS total_revenue
            FROM payments p
            JOIN events e ON p.event_id = e.id
            WHERE e.creator_id = ? AND p.status = 'success'
        `,
        ticketBreakdown: `
            SELECT p.ticket_type, SUM(p.quantity) AS sold, SUM(p.amount) AS revenue
            FROM payments p
            JOIN events e ON p.event_id = e.id
            WHERE e.creator_id = ? AND p.status = 'success'
            GROUP BY p.ticket_type
        `,
        activeEvents: `SELECT * FROM events WHERE is_active = 1 AND creator_id = ?`,
        event_breakdown:`SELECT 
                        e.id AS event_id,
                        e.event_name,
                        e.event_date,
                        e.location,
                        COALESCE(SUM(p.quantity), 0) AS tickets_sold,
                        COALESCE(SUM(p.amount), 0) AS total_revenue
                        FROM events e
                        LEFT JOIN payments p ON e.id = p.event_id AND p.status = 'success'
                        WHERE e.creator_id = ?
                        GROUP BY e.id, e.event_name, e.event_date, e.location
                        ORDER BY e.event_date DESC;
`
    };

    db.query(queries.totalTickets, [creator_id], (err, totalTickets) => {
        if (err) return res.status(500).json({ message: "Error fetching total tickets", err });

        db.query(queries.ticketsSold, [creator_id], (err, sold) => {
            if (err) return res.status(500).json({ message: "Error fetching sold tickets", err });

            db.query(queries.totalRevenue, [creator_id], (err, revenue) => {
                if (err) return res.status(500).json({ message: "Error fetching revenue", err });

                db.query(queries.activeEvents, [creator_id], (err, events) => {
                    if (err) return res.status(500).json({ message: "Error fetching active events", err });

                    db.query(queries.ticketBreakdown, [creator_id], (err, breakdown) => {
                        if (err) return res.status(500).json({ message: "Error fetching breakdown", err });

                        db.query(queries.event_breakdown, [creator_id, creator_id], (err, eventBreakdown) => {
                            if (err) return res.status(500).json({ message: "Error fetching event breakdown", err });

                            const total = totalTickets[0]?.total_tickets || 0;
                            const soldCount = sold[0]?.tickets_sold || 0;
                            console.log(creator_id)
                            res.status(200).json({
                                total_tickets: total,
                                tickets_sold: soldCount,
                                total_revenue: revenue[0]?.total_revenue || 0,
                                breakdown,
                                active_events: events,
                                event_breakdown: eventBreakdown
                            });
                        });
                    });
                });
            });
        });
    });
};

module.exports = { getCreatorDashboardData };