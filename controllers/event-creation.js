const db = require('../connection/connection');

const CreateEvent = (req, res) => {
    const creator_id = req.user.user_id
    const{event_name, event_date, location} = req.body
    if (!creator_id) {
        console.log(`No creator id found`)
        return res.status(400).json({message:`no creator id found!`})
    }
    const checkQuery = 'select * from events where event_name = ? and creator_id = ?'
    db.query(checkQuery, [event_name, creator_id], (err, results) => {
        if (err) {
            console.log(`an error occured`, err)
        } else if (results.length > 0) {
            console.log(`This event has already been created`)
            return res.status(409).json({message:`This event has already been created`})
        } else {
            const query1 = `insert into events (creator_id, event_name, event_date, location) values (?, ?, ?, ?)`
    db.query(query1, [creator_id, event_name, event_date, location], (err, result) => {
        if (err) {
            console.log(`an error occured`, err)
            return res.status(500).json({message:`internal server error`, err})
        } else {
            console.log(`event created successfully`)
            return res.status(201).json({message:`event created successfully`})
        }
    })
        }
    })
}

const cancelEvent = (req, res) => {
    const creator_id = req.user.id
    const { event_id } = req.body

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" })
    }

    const query = `
        UPDATE events
        SET is_active = 0
        WHERE id = ? AND creator_id = ? AND is_active = 1
    `

    db.query(query, [event_id, creator_id], (err, result) => {
        if (err) {
            return res.status(500).json({ message: "Internal server error" })
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Event not found or already inactive" })
        }

        return res.status(200).json({ message: "Event cancelled successfully" })
    })
}


const reActivate = (req, res) => {
    const creator_id = req.user.id
    const { event_id } = req.body

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" })
    }

    const query = `
        UPDATE events
        SET is_active = 1
        WHERE id = ? AND creator_id = ? AND is_active = 0
    `

    db.query(query, [event_id, creator_id], (err, result) => {
        if (err) {
            return res.status(500).json({ message: "Internal server error" })
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Event not found or already active" })
        }

        return res.status(200).json({ message: "Event reactivated successfully" })
    })
}

module.exports = {CreateEvent,cancelEvent,reActivate};