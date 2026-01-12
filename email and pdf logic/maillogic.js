const nodemailer = require("nodemailer");

const sendTicketMail = async ({ to, pdfPath }) => {
  const transporter = nodemailer.createTransport({
    service: "gmail", // or SMTP
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Ticketing Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: "🎟️ Your Event Ticket",
    html: `
      <h2>Payment Successful 🎉</h2>
      <p>Your ticket(s) are attached.</p>
      <p>Please present the QR code at the event entrance.</p>
    `,
    attachments: [
      {
        filename: "tickets.pdf",
        path: pdfPath,
      },
    ],
  });
};

module.exports = sendTicketMail;
