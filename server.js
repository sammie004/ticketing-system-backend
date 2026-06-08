const mysql = require('mysql');
const express = require('express');
const db = require('./connection/connection');
const cors = require('cors');

const swaggerUi = require('swagger-ui-express'); // ✅ FIXED: uncommented
const swaggerFile = require('./swagger-output.json');

const app = express();

// ─────────────────────────────────────────────
// CORS (ALLOW ALL ORIGINS)
// ─────────────────────────────────────────────
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.setHeader("Accept", "application/json");
    next();
});

// ─────────────────────────────────────────────
// WEBHOOK — must be BEFORE express.json()
// ─────────────────────────────────────────────
const webhookRoutes = require('./routes/webhook');
app.use('/api/webhooks', webhookRoutes);

// ─────────────────────────────────────────────
// SWAGGER
// ─────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
const authRoutes        = require('./routes/authRoutes');
const eventRoutes       = require('./routes/events');
const purchaseRoutes    = require('./routes/buy');
const SecurityCheck     = require('./routes/verify');
const UserAuth          = require('./routes/user');
const getDash           = require('./routes/getDash');
const createTicketRoute = require('./routes/create-ticket');
const creatorDash       = require('./routes/creator-dash');
const walletRoutes      = require('./routes/wallet-routes');

app.get('/', (req, res) => {
    res.send('Welcome to the ticketing system backend');
});

app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/tickets', purchaseRoutes);
app.use('/user', UserAuth);
app.use('/security', SecurityCheck);
app.use('/uploads', express.static('uploads'));
app.use('/stats', getDash);
app.use('/creator', creatorDash);
app.use('/create-ticket', createTicketRoute);
app.use('/wallet', walletRoutes);

// ─────────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────────
const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});