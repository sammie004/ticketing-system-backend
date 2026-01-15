// SMS sending logic using Twilio API
const twilio = require("twilio");

// Initialize Twilio client with environment variables
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * normalizePhone ensures phone is in E.164 format for Twilio
 * Examples:
 *   08012345678 => +2348012345678
 *   2348012345678 => +2348012345678
 *   +2348012345678 => +2348012345678
 */
const normalizePhone = (phone) => {
  if (!phone) return null;

  const str = String(phone).replace(/\s+/g, ""); // remove spaces

  if (str.startsWith("+")) return str;
  if (str.startsWith("0")) return "+234" + str.slice(1);
  if (str.startsWith("234")) return "+" + str;

  return null;
};

const sendSMS = async (phone, message) => {
  try {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      console.warn("Invalid phone number:", phone);
      return false;
    }

    const res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE, // your Twilio phone number
      to: "+2348132455551",
    });

    console.log("Twilio SMS sent:", res.sid);
    return true;
  } catch (err) {
    console.error("Twilio SMS error:", err.message);
    return false;
  }
};

module.exports = { sendSMS };
