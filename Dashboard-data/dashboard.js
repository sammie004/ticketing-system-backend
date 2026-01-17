const db = require('../connection/connection');

const getDashboardData = (req, res) => {
    const { event_id } = req.params;

    const queries = {
        totalTickets: `
            SELECT SUM(quantity) AS total_tickets
            FROM ticket_types
            WHERE event_id = ? AND is_active = 1
        `,
        ticketsSold: `
            SELECT SUM(quantity) AS tickets_sold
            FROM payments
            WHERE event_id = ? AND status = 'success'
        `,
        totalRevenue: `
            SELECT SUM(amount) AS total_revenue
            FROM payments
            WHERE event_id = ? AND status = 'success'
        `,
        ticketBreakdown: `
            SELECT 
                ticket_type,
                SUM(quantity) AS sold,
                SUM(amount) AS revenue
            FROM payments
            WHERE event_id = ? AND status = 'success'
            GROUP BY ticket_type
        `,
    
    };

    db.query(queries.totalTickets, [event_id], (err, totalTickets) => {
        if (err) return res.status(500).json({ message: "Error fetching total tickets", err });

        db.query(queries.ticketsSold, [event_id], (err, sold) => {
            if (err) return res.status(500).json({ message: "Error fetching sold tickets", err });

            db.query(queries.totalRevenue, [event_id], (err, revenue) => {
                if (err) return res.status(500).json({ message: "Error fetching revenue", err });
                

                db.query(queries.ticketBreakdown, [event_id], (err, breakdown) => {
                    if (err) return res.status(500).json({ message: "Error fetching breakdown", err });

                    const total = totalTickets[0].total_tickets || 0;
                    const soldCount = sold[0].tickets_sold || 0;

                    res.status(200).json({
                        event_id,
                        total_tickets: total,
                        tickets_sold: soldCount,
                        total_revenue: revenue[0].total_revenue || 0,
                        breakdown
                    });
                });
            });
        });
    });
};


module.exports = { getDashboardData };
