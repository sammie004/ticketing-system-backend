// Simple test to generate tickets PDF without sending email
process.env.SKIP_EMAIL = "true";

const { sendTicketsPDF } = require("./controllers/buyTicket");

(async () => {
  try {
    const ticketsData = [
      [1, 1, "TEST-REF-1", "VIP", "unused", "Test User", "test@example.com", 500],
      [1, 1, "TEST-REF-2", "VIP", "unused", "Test User", "test@example.com", 500],
    ];

    await sendTicketsPDF("Test User", "test@example.com", 1, "VIP", ticketsData, "Test Event");
    console.log("sendTicketsPDF completed (SKIP_EMAIL=true)");
  } catch (err) {
    console.error("Test failed:", err);
  }
})();
