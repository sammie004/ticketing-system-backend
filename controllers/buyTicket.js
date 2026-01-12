const crypto = require("crypto");
const db = require("../connection/connection");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");

/**
 * 1️⃣ INITIALIZE PAYMENT
 */
const buyTicket = async (req, res) => {
  const { user_id, name: user_name, email: user_email } = req.user;
  const event_id = req.params.id;
  const { ticket_type, quantity } = req.body;

  if (!ticket_type || !quantity) {
    return res.status(400).json({ message: "Ticket type and quantity are required" });
  }

  try {
    db.query(
      `SELECT * FROM ticket_types 
       WHERE event_id = ? AND ticket_type = ? AND is_active = 1`,
      [event_id, ticket_type],
      async (err, results) => {
        if (err) return res.status(500).json({ message: "DB error", err });
        if (results.length === 0)
          return res.status(404).json({ message: "Ticket type not found" });

        const ticket = results[0];

        if (ticket.quantity < quantity) {
          return res.status(400).json({ message: `Only ${ticket.quantity} tickets left for this type` });
        }

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
            amount: ticket.price * quantity * 100, // multiply by quantity
            reference,
            metadata: { user_id, event_id, ticket_type, user_name, quantity },
            callback_url: `${process.env.FRONTEND_URL}/payment-success`,
          }),
        });

        const data = await response.json();
        if (!data.status) return res.status(400).json({ message: "Payment init failed" });

        res.status(200).json({
          authorization_url: data.data.authorization_url,
          reference,
        });
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Payment initialization error" });
  }
};

/**
 * 2️⃣ VERIFY PAYMENT + SAVE PAYMENT + CREATE TICKETS
 */

const generateTicketPDF = (ticket, event_name) => {
  return new Promise((resolve, reject) => {
    const ticketsDir = path.join(__dirname, "../tickets");
    if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir);

    const filePath = path.join(ticketsDir, `${ticket.ticket_reference}.pdf`);
    const doc = new PDFDocument();

    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(20).text(`Event Ticket`, { align: "center" });
    doc.moveDown();
    doc.fontSize(16).text(`Event: ${event_name}`);
    doc.text(`Ticket Type: ${ticket.ticket_type}`);
    doc.text(`Ticket Reference: ${ticket.ticket_reference}`);
    doc.text(`Name: ${ticket.user_name}`);
    doc.text(`Amount Paid: ₦${ticket.amount_paid}`);
    doc.end();

    doc.on("finish", () => resolve(filePath));
    doc.on("error", reject);
  });
};

/**
 * HELPER: Send ticket email
 */
// Configure nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// -----------------------------
// PDF generation & email
// -----------------------------
const sendTicketsPDF = async (user_name, user_email, event_id, ticket_type, ticketsData, event_name) => {
  try {
    // Prefer a Unicode TTF that includes currency glyphs (e.g. NotoSans).
    // Register fontkit and embed the TTF if present; otherwise fall back to StandardFonts.
    const unicodeFontPath = path.join(__dirname, "../fonts/NotoSans-Regular.ttf");
    const pdfDoc = await PDFDocument.create();
    let font;
    let usingUnicodeFont = false;
    if (fs.existsSync(unicodeFontPath)) {
      try {
        const fontkit = require("@pdf-lib/fontkit");
        pdfDoc.registerFontkit(fontkit);
        const fontBytes = fs.readFileSync(unicodeFontPath);
        font = await pdfDoc.embedFont(fontBytes);
        usingUnicodeFont = true;
      } catch (e) {
        console.warn("Could not load unicode font, falling back to StandardFonts.", e);
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
    } else {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
    const headerPrefix = ""; // avoid embedding color emoji; use plain text

    for (const ticket of ticketsData) {
      const page = pdfDoc.addPage([400, 250]);
      const { width, height } = page.getSize();

      // Background & border
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.98, 0.98) });
      page.drawRectangle({ x: 10, y: 10, width: width - 20, height: height - 20, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });

      
      // Event info
      page.drawText(`Event: ${event_name}`, { x: 20, y: height - 70, size: 14, font, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(`Ticket Ref: ${ticket[2]}`, { x: 20, y: height - 95, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(`Name: ${user_name}`, { x: 20, y: height - 120, size: 12, font });
      page.drawText(`Email: ${user_email}`, { x: 20, y: height - 140, size: 12, font });
      // Header
      page.drawText(`${headerPrefix}${ticket_type.toUpperCase()} TICKET`, { x: 20, y: height - 40, size: 18, font, color: rgb(0.1, 0.1, 0.1) });

      // Amount: use Naira symbol only if Unicode font is available
      const amountText = usingUnicodeFont ? `Amount Paid: ₦${ticket[7]}` : `Amount Paid: NGN${ticket[7]}`;
      page.drawText(amountText, { x: 20, y: height - 160, size: 12, font, color: rgb(0.3, 0.1, 0.1) });
      // QR code for ticket reference
      const qrDataUrl = await QRCode.toDataURL(ticket[2]);
      const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
      const qrImage = await pdfDoc.embedPng(qrImageBytes);
      page.drawImage(qrImage, { x: width - 110, y: 20, width: 90, height: 90 });
    }

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    const ticketsDir = path.join(__dirname, "../tickets");
    if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir);
    const pdfPath = path.join(ticketsDir, `${crypto.randomUUID()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    // If SKIP_EMAIL is set, skip sending and leave the PDF for inspection
    if (process.env.SKIP_EMAIL === "true") {
      console.log(`SKIP_EMAIL=true, PDF written to ${pdfPath}`);
    } else {
      // Send email
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user_email,
        subject: `Your Tickets for ${event_name}`,
        text: `Hello ${user_name},\n\nAttached are your tickets for the event.`,
        attachments: [{ filename: "tickets.pdf", path: pdfPath }],
      });

      try { fs.unlinkSync(pdfPath); } catch (e) { /* ignore */ }
      console.log(`Tickets emailed to ${user_email}`);
    }
  } catch (err) {
    console.error("Error generating/sending ticket PDF:", err);
  }
};

// -----------------------------
// Payment verification & ticket creation
// -----------------------------
const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ message: "Reference is required" });

  try {
    // 1️⃣ Verify payment via Paystack
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await response.json();

    if (!data.status || data.data.status !== "success") return res.status(400).json({ message: "Payment not successful" });

    const { event_id, ticket_type, user_id, user_name, quantity } = data.data.metadata;
    const user_email = data.data.customer.email;
    const total_amount_paid = data.data.amount / 100;

    if (!quantity || quantity < 1) return res.status(400).json({ message: "Invalid ticket quantity" });

    db.getConnection((err, connection) => {
      if (err) return res.status(500).json({ message: "DB error", err });

      connection.beginTransaction(async err => {
        if (err) return connection.release();

        try {
          // 2️⃣ Save payment
          await new Promise((resolve, reject) => {
            const paymentQuery = `INSERT INTO payments (reference, user_id, event_id, ticket_type, quantity, amount, status, payment_gateway) VALUES (?, ?, ?, ?, ?, ?, 'success', 'paystack')`;
            connection.query(paymentQuery, [reference, user_id, event_id, ticket_type, quantity, total_amount_paid], (err) => err ? reject(err) : resolve());
          });

          // 3️⃣ Decrement ticket quantity
          const updateQty = `UPDATE ticket_types SET quantity = quantity - ? WHERE event_id = ? AND ticket_type = ? AND quantity >= ?`;
          const resultQty = await new Promise((resolve, reject) => {
            connection.query(updateQty, [quantity, event_id, ticket_type, quantity], (err, result) => err ? reject(err) : resolve(result));
          });
          if (resultQty.affectedRows === 0) throw new Error("Not enough tickets available");

          // 4️⃣ Create tickets in DB
          const ticketQuery = `INSERT INTO tickets (event_id, user_id, ticket_reference, ticket_type, status, user_name, user_email, amount_paid) VALUES ?`;
          const perTicketAmount = total_amount_paid / quantity;
          const ticketsData = Array.from({ length: quantity }, () => [
            event_id,
            user_id,
            crypto.randomUUID(),
            ticket_type,
            "unused",
            user_name,
            user_email,
            perTicketAmount,
          ]);

          await new Promise((resolve, reject) => {
            connection.query(ticketQuery, [ticketsData], (err) => err ? reject(err) : resolve());
          });

          // Commit DB
          connection.commit(err => connection.release());

          // 5️⃣ Respond immediately
          res.status(200).json({
            message: "Payment verified & tickets issued. PDF will be emailed shortly!",
            ticket_count: quantity,
            payment_reference: reference,
          });

          // 6️⃣ Generate PDFs & send emails asynchronously
          sendTicketsPDF(user_name, user_email, event_id, ticket_type, ticketsData, `Event #${event_id}`);
        } catch (error) {
          connection.rollback(() => connection.release());
          console.error("Error processing payment/tickets:", error);
        }
      });
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Verification error", error });
  }
};
module.exports = { buyTicket, verifyPayment };
