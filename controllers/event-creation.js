const db = require('../connection/connection');
const { upload, cloudinary } = require('../middleware/upload');


// ─────────────────────────────────────────────
// CREATE EVENT
// ─────────────────────────────────────────────
const CreateEvent = (req, res) => {
    try {
        const creator_id = req.user.user_id || req.user.id;

        if (!creator_id) {
            return res.status(401).json({ message: "Unauthorized: no creator ID found" });
        }

        const {
            event_name,
            start_date,
            end_date,
            category,
            description,
            performers,
            location,
        } = req.body;

        if (!event_name || !start_date || !end_date || !location || !category) {
            return res.status(400).json({
                message: "event_name, start_date, end_date, location and category are required"
            });
        }

        const validCategories = [
            "concert","festival","house_party","private_party",
            "club_event","live_show","conference","church_event",
            "campus_event","other"
        ];

        if (!validCategories.includes(category)) {
            return res.status(400).json({
                message: `Invalid category. Must be one of: ${validCategories.join(", ")}`
            });
        }

        const checkQuery = `
            SELECT id FROM events
            WHERE event_name = ? AND creator_id = ?
        `;

        db.query(checkQuery, [event_name, creator_id], (err, results) => {
            if (err) {
                return res.status(500).json({
                    message: "DB error during event check",
                    error: err?.message
                });
            }

            if (results.length > 0) {
                return res.status(409).json({
                    message: "You already have an event with this name"
                });
            }

            const cover_image = req.files?.cover_image?.[0]?.path || null;
            const poster_image = req.files?.poster_image?.[0]?.path || null;
            const image_url = cover_image || poster_image || null;

            const insertQuery = `
                INSERT INTO events
                (creator_id, event_name, start_date, end_date, category,
                 description, performers, location, image_url, cover_image, poster_image, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;

            db.query(
                insertQuery,
                [
                    creator_id,
                    event_name,
                    start_date,
                    end_date,
                    category,
                    description || null,
                    performers || null,
                    location,
                    image_url,
                    cover_image,
                    poster_image
                ],
                (err, result) => {
                    if (err) {
                        return res.status(500).json({
                            message: "Event creation failed",
                            error: err?.message
                        });
                    }

                    return res.status(201).json({
                        message: "Event created successfully",
                        event_id: result.insertId,
                        cover_image,
                        poster_image
                    });
                }
            );
        });

    } catch (err) {
        return res.status(500).json({
            message: "Unexpected server error",
            error: err.message
        });
    }
};


// ─────────────────────────────────────────────
// UPDATE EVENT IMAGES
// ─────────────────────────────────────────────
const updateEventImages = (req, res) => {
    const creator_id = req.user.user_id || req.user.id;
    const { event_id } = req.params;

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    db.query(
        `SELECT cover_image, poster_image FROM events WHERE id = ? AND creator_id = ?`,
        [event_id, creator_id],
        async (err, results) => {

            if (err) {
                return res.status(500).json({
                    message: "DB error",
                    error: err?.message
                });
            }

            if (!results.length) {
                return res.status(404).json({ message: "Event not found" });
            }

            const existing = results[0];
            const updates = {};
            const setClauses = [];
            const values = [];

            // safe cloudinary delete
            const deleteOld = async (oldUrl) => {
                if (!oldUrl) return;

                try {
                    const parts = oldUrl.split("/");
                    const file = parts[parts.length - 1].split(".")[0];
                    const folder = parts[parts.length - 2];

                    await cloudinary.uploader.destroy(`${folder}/${file}`);
                } catch (e) {
                    console.warn("Cloudinary delete failed:", e?.message || e);
                }
            };

            try {
                if (req.files?.cover_image?.[0]) {
                    await deleteOld(existing.cover_image);

                    updates.cover_image = req.files.cover_image[0].path;
                    updates.image_url = updates.cover_image;

                    setClauses.push("cover_image = ?", "image_url = ?");
                    values.push(updates.cover_image, updates.cover_image);
                }

                if (req.files?.poster_image?.[0]) {
                    await deleteOld(existing.poster_image);

                    updates.poster_image = req.files.poster_image[0].path;

                    setClauses.push("poster_image = ?");
                    values.push(updates.poster_image);
                }

                if (!setClauses.length) {
                    return res.status(400).json({ message: "No images provided" });
                }

                values.push(event_id, creator_id);

                db.query(
                    `UPDATE events SET ${setClauses.join(", ")} WHERE id = ? AND creator_id = ?`,
                    values,
                    (err) => {
                        if (err) {
                            return res.status(500).json({
                                message: "Image update failed",
                                error: err?.message
                            });
                        }

                        return res.status(200).json({
                            message: "Images updated successfully",
                            ...updates
                        });
                    }
                );

            } catch (err) {
                return res.status(500).json({
                    message: "Unexpected error during image update",
                    error: err.message
                });
            }
        }
    );
};


// ─────────────────────────────────────────────
// CANCEL EVENT
// ─────────────────────────────────────────────
const cancelEvent = (req, res) => {
    const creator_id = req.user.user_id || req.user.id;
    const { event_id } = req.body;

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    db.query(
        `UPDATE events SET is_active = 0 WHERE id = ? AND creator_id = ? AND is_active = 1`,
        [event_id, creator_id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: "Internal server error",
                    error: err?.message
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Event not found or already inactive"
                });
            }

            return res.status(200).json({
                message: "Event cancelled successfully"
            });
        }
    );
};


// ─────────────────────────────────────────────
// REACTIVATE EVENT
// ─────────────────────────────────────────────
const reActivate = (req, res) => {
    const creator_id = req.user.user_id || req.user.id;
    const { event_id } = req.body;

    if (!event_id) {
        return res.status(400).json({ message: "Event ID is required" });
    }

    db.query(
        `UPDATE events SET is_active = 1 WHERE id = ? AND creator_id = ? AND is_active = 0`,
        [event_id, creator_id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    message: "Internal server error",
                    error: err?.message
                });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    message: "Event not found or already active"
                });
            }

            return res.status(200).json({
                message: "Event reactivated successfully"
            });
        }
    );
};


module.exports = {
    CreateEvent,
    updateEventImages,
    cancelEvent,
    reActivate
};