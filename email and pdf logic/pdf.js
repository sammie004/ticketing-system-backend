const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const generateTicketPDF = async ({ event, tickets, user }) => {
  const fileName = `tickets-${Date.now()}.pdf`;
  const filePath = path.join(__dirname, "../tickets", fileName);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let ticket of tickets) {
    const qr = await QRCode.toDataURL(ticket.ticket_reference);

    doc
      .fontSize(20)
      .text(event.event_name, { align: "center" })
      .moveDown();

    doc.fontSize(14).text(`Ticket Type: ${ticket.ticket_type}`);
    doc.text(`Name: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Reference: ${ticket.ticket_reference}`);
    doc.text(`Amount Paid: ₦${ticket.amount_paid}`);
    doc.text(`Status: ${ticket.status}`);
    doc.moveDown();

    doc.image(qr, {
      fit: [150, 150],
      align: "center",
    });

    doc.addPage();
  }

  doc.end();

  return filePath;
};

module.exports = generateTicketPDF;
