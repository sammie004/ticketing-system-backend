const jwt = require("jsonwebtoken");

const protect = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).json({
                    message: "No token provided"
                });
            }

            const token = authHeader.split(" ")[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = {
                user_id: decoded.user_id,
                email: decoded.email,
                name: decoded.name,
                role: decoded.role
            };

            // If roles were supplied, enforce them
            if (
                allowedRoles.length > 0 &&
                !allowedRoles.includes(decoded.role)
            ) {
                return res.status(403).json({
                    message: "Access denied"
                });
            }

            next();

        } catch (err) {
            console.error(err);

            return res.status(401).json({
                message: "Invalid token"
            });
        }
    };
};

module.exports = protect;