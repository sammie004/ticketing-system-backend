// SMS sending logic using Termii API
const sendSMS = async (phone, message) => {
  try {
    const response = await fetch(
      `${process.env.TERMII_BASE_URL}/api/sms/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TERMII_API_KEY,
          to: phone, // 2348012345678
          from: process.env.TERMII_SENDER_ID,
          sms: message,
          type: "plain",
          channel: "generic",
        }),
      }
    );

    const data = await response.json();

    if (data.code !== "ok") {
      console.error("Termii SMS failed:", data);
      return false;
    }

    console.log("SMS sent:", data);
    return true;
  } catch (err) {
    console.error("SMS error:", err);
    return false;
  }
};

module.exports = { sendSMS };
