const crypto     = require("crypto");
const db         = require("../connection/connection");
const fs         = require("fs");
const path       = require("path");
const https      = require("https");
const http       = require("http");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode     = require("qrcode");
const bwipjs     = require("bwip-js");
const nodemailer = require("nodemailer");
const twilio     = require("twilio");
const { sendSMS }                   = require("../smsLogic/sms");
const { creditWalletForTicketSale } = require("../wallets/wallet");

// ─────────────────────────────────────────────
// HELPER — find or auto-create a guest user row
// No password set — just name, email, phone
// ─────────────────────────────────────────────
const findOrCreateGuest = (name, email, phone_number) => new Promise((resolve, reject) => {
  console.log(`[GUEST] Looking up email: ${email}`);

  db.query(
    `SELECT id, name, email FROM event_attendees WHERE email = ?`,
    [email],
    (err, results) => {
      if (err) {
        console.error(`[GUEST] Select error:`, err);
        return reject(err);
      }

      // already exists — return existing user
      if (results.length > 0) {
        console.log(`[GUEST] ✅ Existing user found — id: ${results[0].id}, name: ${results[0].name}`);
        return resolve(results[0]);
      }

      // does not exist — auto-create with no password
      console.log(`[GUEST] No existing user — creating guest row for: ${email}`);
      db.query(
        `INSERT INTO event_attendees (name, email, phone_number)
         VALUES (?, ?, ?)`,
        [name, email, phone_number || null],
        (err, result) => {
          if (err) {
            console.error(`[GUEST] ❌ Insert error:`, err);
            console.error(`[GUEST] Insert values — name:${name} email:${email} phone:${phone_number}`);
            return reject(err);
          }
          console.log(`[GUEST] ✅ Guest user created — id: ${result.insertId}`);
          resolve({ id: result.insertId, name, email });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────
// 1. INITIALIZE PAYMENT (guest checkout)
// No auth required — buyer details from body
// ─────────────────────────────────────────────
const buyTicket = async (req, res) => {
  console.log(`\n[BUY] ===== buyTicket called =====`);
  console.log(`[BUY] Body:`, JSON.stringify(req.body));
  console.log(`[BUY] Params:`, JSON.stringify(req.params));

  const event_id = req.params.id;
  const { name, email, phone_number, ticket_type, quantity } = req.body;

  // validate required fields
  if (!name || !email) {
    console.warn(`[BUY] Missing name or email — name:${name} email:${email}`);
    return res.status(400).json({ message: "Name and email are required" });
  }
  if (!ticket_type || !quantity) {
    console.warn(`[BUY] Missing ticket_type or quantity`);
    return res.status(400).json({ message: "Ticket type and quantity are required" });
  }

  // basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.warn(`[BUY] Invalid email format: ${email}`);
    return res.status(400).json({ message: "Invalid email address" });
  }

  console.log(`[BUY] Validation passed — event_id:${event_id} ticket_type:${ticket_type} qty:${quantity}`);

  try {
    // find or auto-create guest user
    console.log(`[BUY] Calling findOrCreateGuest...`);
    const guest = await findOrCreateGuest(name, email, phone_number);
    console.log(`[BUY] Guest resolved — id:${guest.id} name:${guest.name} email:${guest.email}`);

    console.log(`[BUY] Querying ticket_types — event_id:${event_id} name:${ticket_type}`);
    db.query(
      `SELECT * FROM ticket_types WHERE event_id = ? AND name = ? AND is_active = 1`,
      [event_id, ticket_type],
      async (err, results) => {
        if (err) {
          console.error(`[BUY] ticket_types query error:`, err);
          return res.status(500).json({ message: "DB error", err });
        }

        console.log(`[BUY] ticket_types results count: ${results.length}`);
        if (!results.length) {
          console.warn(`[BUY] Ticket type not found — event_id:${event_id} type:${ticket_type}`);
          return res.status(404).json({ message: "Ticket type not found" });
        }

        const ticket = results[0];
        console.log(`[BUY] Ticket found — price:${ticket.price} remaining_qty:${ticket.quantity}`);

        if (ticket.quantity < quantity) {
          console.warn(`[BUY] Not enough tickets — available:${ticket.quantity} requested:${quantity}`);
          return res.status(400).json({ message: `Only ${ticket.quantity} tickets left` });
        }

        const reference = crypto.randomUUID();
        const amount    = ticket.price * quantity * 100;  // in kobo
        console.log(`[BUY] Initializing Paystack — amount:₦${ticket.price * quantity} (${amount} kobo) ref:${reference}`);

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: guest.email,
            amount,
            reference,
            metadata: {
              user_id:      guest.id,
              event_id,
              ticket_type,
              user_name:    guest.name,
              quantity,
              phone_number: phone_number || null,
            },
            callback_url: `${process.env.FRONTEND_URL}/payment-success`,
          }),
        });

        const data = await response.json();
        console.log(`[BUY] Paystack init response status: ${data.status}`);
        console.log(`[BUY] Paystack message: ${data.message}`);

        if (!data.status) {
          console.error(`[BUY] Paystack init failed:`, data);
          return res.status(400).json({ message: "Payment init failed" });
        }

        console.log(`[BUY] ✅ Payment initialized — authorization_url: ${data.data.authorization_url}`);
        res.status(200).json({ authorization_url: data.data.authorization_url, reference });
      }
    );
  } catch (e) {
    console.error("[BUY] ❌ Unexpected error:", e.message);
    console.error(e.stack);
    res.status(500).json({ message: "Payment initialization error", error: e.message });
  }
};

// ─────────────────────────────────────────────
// NODEMAILER
// ─────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const normalizePhone = (phone) => {
  if (!phone) return "";
  const s = String(phone).trim();
  if (!s) return "";
  return s.startsWith("+") ? s : "+234" + s.replace(/^0/, "");
};

// ─────────────────────────────────────────────
// HELPER — fetch remote image as buffer
// ─────────────────────────────────────────────
const fetchImageBuffer = (url) => new Promise((resolve, reject) => {
  const client = url.startsWith("https") ? https : http;
  client.get(url, (res) => {
    const chunks = [];
    res.on("data", chunk => chunks.push(chunk));
    res.on("end",  ()    => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  }).on("error", reject);
});

// ─────────────────────────────────────────────
// PDF HELPERS
// ─────────────────────────────────────────────
const rr = (page, x, y, w, h, r, col) => {
  r = Math.min(r, w/2, h/2);
  page.drawRectangle({ x:x+r, y,     width:w-2*r, height:h,     color:col });
  page.drawRectangle({ x,     y:y+r, width:w,     height:h-2*r, color:col });
  [[x+r,y+r],[x+w-r,y+r],[x+r,y+h-r],[x+w-r,y+h-r]].forEach(([cx,cy]) =>
    page.drawEllipse({ x:cx, y:cy, xScale:r, yScale:r, color:col })
  );
};

const ctr = (page, text, y, size, font, color, ox, ow) => {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: ox + (ow - tw)/2, y, size, font, color });
};

const trunc = (font, text, size, max) => {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  while (text.length > 1 && font.widthOfTextAtSize(text+"...", size) > max) text = text.slice(0,-1);
  return text+"...";
};

const wrapText = (font, text, size, maxWidth) => {
  const words = (text || "").split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const gradBg = (page, x, y, w, h) => {
  const steps = 80;
  for (let i = 0; i < steps; i++) {
    const t = i/steps;
    page.drawRectangle({
      x, y: y + i*(h/steps), width: w, height: h/steps + 1,
      color: rgb(0.031 + t*0.06, 0.031 + t*0.01, 0.16 + t*0.14)
    });
  }
};

// ─────────────────────────────────────────────
// PDF GENERATION
// ─────────────────────────────────────────────
const sendTicketsPDF = async (
  user_name, user_email, event_id, ticket_type, ticketsData, event_name,
  event_description, poster_image_url
) => {
  try {
    const pdfDoc = await PDFDocument.create();
    const fBold  = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fReg   = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const C = {
      purpleL:    rgb(0.50, 0.30, 0.95),
      purplePill: rgb(0.40, 0.20, 0.88),
      purpleText: rgb(0.38, 0.20, 0.85),
      white:      rgb(1,    1,    1   ),
      offWhite:   rgb(0.97, 0.97, 0.99),
      dark:       rgb(0.08, 0.08, 0.20),
      mid:        rgb(0.30, 0.30, 0.42),
      muted:      rgb(0.55, 0.55, 0.68),
      divider:    rgb(0.87, 0.87, 0.93),
      darkBand:   rgb(0.07, 0.07, 0.20),
      iconTint:   rgb(0.72, 0.72, 0.92),
    };

    const PW = 760, PH = 560;
    const LW = 460, SEP = 460, LP = 24;
    const BAND_H = 68, WHITE_H = 188;
    const RC_L = SEP + 18, RC_R = PW - 18, RC_W = RC_R - RC_L;

    let posterImg = null;
    if (poster_image_url) {
      try {
        const buf   = await fetchImageBuffer(poster_image_url);
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        posterImg   = isPng ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
      } catch (e) { console.warn("Could not embed poster image:", e.message); }
    }

    const descText  = event_description
      ? event_description.replace(/\n/g, " ").trim()
      : "Join us for an unforgettable experience.";
    const descLines = wrapText(fReg, descText, 9.5, LW - LP*2 - 10).slice(0, 2);

    for (const ticket of ticketsData) {
      const ref      = ticket[2];
      const shortRef = ref.split("-")[0].toUpperCase();
      const page     = pdfDoc.addPage([PW, PH]);

      gradBg(page, 0, 0, LW, PH);

      const HERO_BOTTOM = BAND_H + WHITE_H;
      const HERO_H      = PH - HERO_BOTTOM;

      if (posterImg) {
        page.drawImage(posterImg, { x:0, y:HERO_BOTTOM, width:LW, height:HERO_H, opacity:0.55 });
      }

      for (let i = 0; i < 30; i++) {
        const t = i/30;
        page.drawRectangle({
          x:0, y: HERO_BOTTOM + i*(HERO_H/30), width:LW, height:HERO_H/30+1,
          color: rgb(0.04, 0.04, 0.14), opacity: 0.55 - t*0.45,
        });
      }

      [0,1,2].forEach(i => page.drawEllipse({
        x:LW*0.65, y:PH*0.55, xScale:90+i*28, yScale:70+i*20,
        color:rgb(0.28,0.10,0.65), opacity:0.04,
      }));

      const BRAND_Y = PH - 48;
      rr(page, LP, BRAND_Y-6, 26, 26, 5, C.purpleL);
      page.drawText("E",                { x:LP+7,  y:BRAND_Y+4,  size:14,  font:fBold, color:C.white    });
      page.drawText("PYRAMID-AFRICA",   { x:LP+32, y:BRAND_Y+6,  size:10,  font:fBold, color:C.white    });
      page.drawText("LIVE EXPERIENCES", { x:LP+32, y:BRAND_Y-6,  size:6.5, font:fReg,  color:C.iconTint });

      const PILL_W = 82, PILL_H = 24, PILL_X = LW - LP - 82;
      rr(page, PILL_X, BRAND_Y-4, PILL_W, PILL_H, 12, C.purplePill);
      ctr(page, "E-TICKET", BRAND_Y+6, 9, fBold, C.white, PILL_X, PILL_W);

      const NAME_Y = PH - 104;
      const words  = event_name.toUpperCase().split(" ");
      const wmid   = Math.ceil(words.length/2);
      page.drawText(trunc(fBold, words.slice(0,wmid).join(" "), 36, LW-LP*2), { x:LP, y:NAME_Y,    size:36, font:fBold, color:C.white });
      page.drawText(trunc(fBold, words.slice(wmid).join(" "),   36, LW-LP*2), { x:LP, y:NAME_Y-44, size:36, font:fBold, color:C.white });

      const SUB_Y = NAME_Y - 72;
      descLines.forEach((ln, i) =>
        page.drawText(ln, { x:LP, y:SUB_Y - i*14, size:9.5, font:fReg, color:C.iconTint })
      );
      const RULE_Y = SUB_Y - descLines.length*14 - 4;
      page.drawLine({ start:{x:LP,y:RULE_Y}, end:{x:LP+196,y:RULE_Y}, thickness:1.5, color:C.purpleL });

      const ICON_X = LP, TEXT_X = LP + 28;
      let DET_Y = RULE_Y - 20;

      const detRow = (drawIcon, bold, soft) => {
        drawIcon(ICON_X, DET_Y);
        page.drawText(bold, { x:TEXT_X, y:DET_Y, size:10, font:fBold, color:C.white });
        if (soft) page.drawText(soft, { x:TEXT_X, y:DET_Y-13, size:8.5, font:fReg, color:C.iconTint });
        DET_Y -= soft ? 42 : 34;
      };

      detRow((x,y) => {
        rr(page, x, y-2, 18, 15, 2, C.iconTint);
        page.drawRectangle({ x:x+1, y:y+6, width:16, height:6, color:C.white });
        page.drawLine({ start:{x:x+5,y:y+13},  end:{x:x+5,y:y+11},  thickness:1.5, color:C.darkBand });
        page.drawLine({ start:{x:x+13,y:y+13}, end:{x:x+13,y:y+11}, thickness:1.5, color:C.darkBand });
      }, ticket_type.toUpperCase()+" TICKET");

      detRow((x,y) => {
        page.drawEllipse({ x:x+9, y:y+7, xScale:9, yScale:9, borderColor:C.iconTint, borderWidth:1.5, color:rgb(0,0,0) });
        page.drawLine({ start:{x:x+9,y:y+7}, end:{x:x+9,y:y+12},  thickness:1.5, color:C.iconTint });
        page.drawLine({ start:{x:x+9,y:y+7}, end:{x:x+13,y:y+7},  thickness:1.5, color:C.iconTint });
      }, "Present QR code at entrance");

      detRow((x,y) => {
        page.drawEllipse({ x:x+9, y:y+10, xScale:7, yScale:7, borderColor:C.iconTint, borderWidth:1.5, color:rgb(0,0,0) });
        page.drawLine({ start:{x:x+9,y:y+3}, end:{x:x+9,y:y}, thickness:2, color:C.iconTint });
      }, "Non-transferable ticket", "One entry per QR code");

      const WS_Y = BAND_H, WS_TOP = BAND_H + WHITE_H;
      page.drawRectangle({ x:0, y:WS_Y, width:LW, height:WHITE_H, color:C.offWhite });
      page.drawText("EVENT DETAILS", { x:LP, y:WS_TOP-22, size:11, font:fBold, color:C.purpleText });
      page.drawLine({ start:{x:LP,y:WS_TOP-26}, end:{x:LP+88,y:WS_TOP-26}, thickness:2, color:C.purpleText });

      [`Event: ${trunc(fReg, event_name, 8.5, LW-LP*2-10)}`, `Type: ${ticket_type} Access`, "Scan QR code at the entrance for entry."]
        .forEach((ln, i) => page.drawText(ln, { x:LP, y:WS_TOP-44-i*13, size:8.5, font:fReg, color:C.mid }));

      const EG_Y = WS_Y + 88;
      page.drawText("ENTRY GUIDELINES", { x:LP, y:EG_Y, size:10, font:fBold, color:C.purpleText });
      page.drawLine({ start:{x:LP,y:EG_Y-4}, end:{x:LP+108,y:EG_Y-4}, thickness:1.5, color:C.purpleText });

      const GL_W = Math.floor((LW - LP*2 - 6*3)/4);
      ["Show e-ticket","Valid ID req.","No re-entry","No outside food"].forEach((g,i) => {
        const gx = LP + i*(GL_W+6);
        rr(page, gx, WS_Y+18, GL_W, 26, 4, C.divider);
        ctr(page, g, WS_Y+27, 7, fReg, C.mid, gx, GL_W);
      });

      page.drawRectangle({ x:0, y:0, width:LW, height:BAND_H, color:C.darkBand });
      rr(page, LP, BAND_H/2-16, 32, 32, 16, C.purplePill);
      page.drawText("*", { x:LP+11, y:BAND_H/2-4, size:14, font:fBold, color:C.white });
      page.drawText("THANK YOU!",                          { x:LP+40, y:BAND_H/2+8,  size:10, font:fBold, color:C.white    });
      page.drawText("We can't wait to create memories.",   { x:LP+40, y:BAND_H/2-6,  size:8,  font:fReg,  color:C.iconTint });
      page.drawText("@Pyramid-Africa  |  Pyramid-Africa.com", { x:LP+40, y:BAND_H/2-20, size:7,  font:fReg,  color:C.muted    });

      page.drawRectangle({ x:SEP, y:0, width:PW-LW, height:PH, color:C.offWhite });

      let dashY = 14;
      while (dashY < PH-14) {
        page.drawLine({ start:{x:SEP,y:dashY}, end:{x:SEP,y:dashY+6}, thickness:1, color:C.divider });
        dashY += 11;
      }
      page.drawEllipse({ x:SEP, y:PH, xScale:11, yScale:11, color:C.offWhite });
      page.drawEllipse({ x:SEP, y:0,  xScale:11, yScale:11, color:C.offWhite });

      const TID_Y = PH - 44;
      rr(page, RC_L, TID_Y, RC_W, 24, 6, C.purplePill);
      ctr(page, "TICKET ID", TID_Y+8, 9, fBold, C.white, RC_L, RC_W);
      page.drawText("EVT-"+shortRef, { x:RC_L+8, y:TID_Y-18, size:11, font:fBold, color:C.dark });

      const QR_SIZE = 120, QR_PAD = 8;
      const QR_CARD_W = QR_SIZE + QR_PAD*2;
      const QR_CARD_X = RC_L + (RC_W - QR_CARD_W)/2;
      const QR_CARD_Y = TID_Y - 24 - QR_SIZE - QR_PAD*2;

      const verifyUrl = `${process.env.BACKEND_URL}/api/security/scan/${ref}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width:220, margin:1, errorCorrectionLevel:"H",
        color:{ dark:"#0D0D20", light:"#FFFFFF" },
      });
      const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

      rr(page, QR_CARD_X, QR_CARD_Y, QR_CARD_W, QR_SIZE+QR_PAD*2, 6, C.white);
      page.drawImage(qrImage, { x:QR_CARD_X+QR_PAD, y:QR_CARD_Y+QR_PAD, width:QR_SIZE, height:QR_SIZE });

      const SCAN_Y = QR_CARD_Y - 18;
      ctr(page, "SCAN AT ENTRY",                             SCAN_Y,    9, fBold, C.purpleText, RC_L, RC_W);
      ctr(page, "Each ticket is unique & non-transferable.", SCAN_Y-14, 7, fReg,  C.muted,      RC_L, RC_W);

      const DIV_Y = SCAN_Y - 28;
      let rdX = RC_L;
      while (rdX < RC_R) {
        page.drawLine({ start:{x:rdX,y:DIV_Y}, end:{x:Math.min(rdX+5,RC_R),y:DIV_Y}, thickness:0.8, color:C.divider });
        rdX += 9;
      }

      const ICON_R = 8, ICON_CX = RC_L+8, ROW_TX = RC_L+26, ROW_TW = RC_R-RC_L-28;
      let RY = DIV_Y - 26;
      const rightRow = (label, value) => {
        page.drawEllipse({ x:ICON_CX, y:RY+4, xScale:ICON_R, yScale:ICON_R, color:C.divider });
        page.drawText(label, { x:ROW_TX, y:RY+10, size:7.5, font:fBold, color:C.purpleText });
        page.drawText(trunc(fBold, value, 11, ROW_TW), { x:ROW_TX, y:RY-2, size:11, font:fBold, color:C.dark });
        RY -= 34;
        page.drawLine({ start:{x:RC_L,y:RY+14}, end:{x:RC_R,y:RY+14}, thickness:0.4, color:C.divider });
      };

      rightRow("ATTENDEE",    user_name);
      rightRow("TICKET TYPE", ticket_type+" Access");
      rightRow("ACCESS LEVEL",ticket_type);
      rightRow("REF CODE",    shortRef);

      try {
        const barBuf = await bwipjs.toBuffer({ bcid:"code128", text:shortRef, scale:2, height:12 });
        page.drawImage(await pdfDoc.embedPng(barBuf), { x:RC_L, y:28, width:RC_W, height:38 });
      } catch(e) { rr(page, RC_L, 28, RC_W, 38, 3, C.divider); }
      ctr(page, shortRef, 10, 8, fReg, C.muted, RC_L, RC_W);
    }

    const pdfBytes   = await pdfDoc.save();
    const ticketsDir = path.join(__dirname, "../tickets");
    if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir);
    const pdfPath = path.join(ticketsDir, `${crypto.randomUUID()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    if (process.env.SKIP_EMAIL !== "true") {
      await transporter.sendMail({
        from: process.env.SMTP_USER, to: user_email,
        subject: `Your Tickets for ${event_name}`,
        html: `
<div style="max-width:600px;margin:auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8f0">
  <div style="background:#3314DD;padding:44px 36px 36px;text-align:center">
    <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:8px;padding:6px 16px;margin-bottom:20px">
      <span style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;letter-spacing:0.06em">E-TICKET CONFIRMED</span>
    </div>
    <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;line-height:1.3">You're officially on<br>the guest list</h1>
    <p style="color:rgba(255,255,255,0.75);margin:12px 0 0;font-size:14px">Your ticket has been generated and attached below.</p>
  </div>
  <div style="height:5px;background:linear-gradient(90deg,#7F77DD,#AFA9EC,#7F77DD)"></div>
  <div style="padding:36px">
    <p style="color:#444;font-size:15px;margin:0 0 24px;line-height:1.7">
      Hello <strong style="color:#111">${user_name}</strong>,<br>
      Thank you for your purchase. Your ticket${ticketsData.length > 1 ? "s have" : " has"} been successfully generated and attached to this email as a PDF.
    </p>
    <div style="border-radius:12px;border:1px solid #e2e0f8;overflow:hidden;margin-bottom:24px">
      <div style="background:#EEEDFE;padding:20px 24px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#534AB7;letter-spacing:0.06em;text-transform:uppercase">Your Event</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#26215C">${event_name}</p>
      </div>
      <div style="padding:16px 24px;background:#ffffff">
        <p style="margin:0;color:#666;font-size:14px;line-height:1.7">Your ticket contains a unique QR code. Present it at the venue entrance — it will be scanned for instant entry.</p>
      </div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td width="32%" style="padding-right:6px">
          <div style="background:#EEEDFE;border-radius:10px;padding:16px;text-align:center">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#534AB7">1. Check email</p>
            <p style="margin:0;font-size:11px;color:#7F77DD;line-height:1.4">Open the PDF attached</p>
          </div>
        </td>
        <td width="32%" style="padding:0 3px">
          <div style="background:#EEEDFE;border-radius:10px;padding:16px;text-align:center">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#534AB7">2. Find QR code</p>
            <p style="margin:0;font-size:11px;color:#7F77DD;line-height:1.4">Inside your ticket PDF</p>
          </div>
        </td>
        <td width="32%" style="padding-left:6px">
          <div style="background:#EEEDFE;border-radius:10px;padding:16px;text-align:center">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#534AB7">3. Show at entry</p>
            <p style="margin:0;font-size:11px;color:#7F77DD;line-height:1.4">Scan &amp; you're in</p>
          </div>
        </td>
      </tr>
    </table>
    <div style="border-radius:10px;border:1px solid #AFA9EC;background:#EEEDFE;padding:14px 18px;margin-bottom:28px">
      <p style="margin:0;font-size:13px;color:#3C3489;line-height:1.6"><strong>Keep your ticket safe.</strong> This ticket is non-transferable and can only be used once. Do not share or post your QR code online.</p>
    </div>
    <p style="color:#555;font-size:14px;line-height:1.8;margin:0 0 8px">We look forward to welcoming you and making this an unforgettable experience.</p>
    <p style="color:#111;font-size:15px;font-weight:700;margin:0">See you there! 🚀</p>
  </div>
  <div style="height:1px;background:#ececec"></div>
  <div style="background:#f8f8fc;padding:24px 36px;text-align:center">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#3314DD">Pyramid Africa</p>
    <p style="margin:0 0 6px;color:#888;font-size:12px">This email was sent regarding your ticket purchase.</p>
    <p style="margin:0;color:#bbb;font-size:11px">If you did not make this purchase, please contact support immediately.</p>
  </div>
</div>`,
        attachments: [{ filename:"tickets.pdf", path:pdfPath }],
      });
      try { fs.unlinkSync(pdfPath); } catch(e) {}
      console.log(`Tickets emailed to ${user_email}`);
    } else {
      console.log(`SKIP_EMAIL=true — PDF at ${pdfPath}`);
    }
  } catch (err) {
    console.error("Error generating ticket PDF:", err);
  }
};

// ─────────────────────────────────────────────
// CORE — shared logic used by both
//        verifyPayment and paystackWebhook
// ─────────────────────────────────────────────
const processSuccessfulPayment = async ({
  reference,
  user_id,
  event_id,
  ticket_type,
  user_name,
  user_email,
  quantity,
  total_amount_paid,
}) => {
  console.log(`\n[PAYMENT] ========== processSuccessfulPayment START ==========`);
  console.log(`[PAYMENT] reference:         ${reference}`);
  console.log(`[PAYMENT] user_id:           ${user_id}`);
  console.log(`[PAYMENT] event_id:          ${event_id}`);
  console.log(`[PAYMENT] ticket_type:       ${ticket_type}`);
  console.log(`[PAYMENT] user_name:         ${user_name}`);
  console.log(`[PAYMENT] user_email:        ${user_email}`);
  console.log(`[PAYMENT] quantity:          ${quantity}`);
  console.log(`[PAYMENT] total_amount_paid: ${total_amount_paid}`);

  return new Promise((resolve, reject) => {
    db.getConnection(async (err, connection) => {
      if (err) {
        console.error(`[PAYMENT] DB connection error:`, err);
        return reject(new Error("DB connection error"));
      }

      console.log(`[PAYMENT] DB connection acquired`);

      try {
        await new Promise((res,rej) =>
          connection.beginTransaction(e => {
            if (e) { console.error(`[PAYMENT] beginTransaction error:`, e); return rej(e); }
            console.log(`[PAYMENT] Transaction started`);
            res();
          })
        );

        // 1. save payment record
        console.log(`[PAYMENT] Step 1 — inserting payment record...`);
        const paymentResult = await new Promise((res,rej) => connection.query(
          `INSERT IGNORE INTO payments
             (reference, user_id, event_id, ticket_type, amount, status, paid_at)
           VALUES (?,?,?,?,?,?,NOW())`,
          [reference, user_id, event_id, ticket_type, total_amount_paid, "success"],
          (e, result) => {
            if (e) { console.error(`[PAYMENT] Insert payment error:`, e); return rej(e); }
            console.log(`[PAYMENT] Payment insert affectedRows: ${result.affectedRows}`);
            res(result);
          }
        ));

        if (paymentResult.affectedRows === 0) {
          console.log(`[PAYMENT] Reference ${reference} already processed — skipping duplicate`);
          await new Promise((res,rej) => connection.rollback(e => e ? rej(e) : res()));
          connection.release();
          const dupErr = new Error("Already processed");
          dupErr.code  = "ER_DUP_ENTRY";
          throw dupErr;
        }

        // 2. decrement ticket quantity
        console.log(`[PAYMENT] Step 2 — decrementing ticket quantity...`);
        const rQty = await new Promise((res,rej) => connection.query(
          `UPDATE ticket_types SET quantity = quantity - ?
           WHERE event_id = ? AND name = ? AND quantity >= ?`,
          [quantity, event_id, ticket_type, quantity],
          (e,r) => {
            if (e) { console.error(`[PAYMENT] Decrement qty error:`, e); return rej(e); }
            console.log(`[PAYMENT] Ticket qty decrement affectedRows: ${r.affectedRows}`);
            res(r);
          }
        ));
        if (rQty.affectedRows === 0) {
          console.error(`[PAYMENT] Not enough tickets — event_id:${event_id} type:${ticket_type} qty:${quantity}`);
          throw new Error("Not enough tickets available");
        }

        // 3. create ticket rows
        console.log(`[PAYMENT] Step 3 — creating ${quantity} ticket row(s)...`);
        const ticketsData = Array.from({ length: quantity }, () => [
          event_id, user_id, crypto.randomUUID(),
          ticket_type, "unused", user_name, user_email,
          total_amount_paid / quantity,
        ]);
        console.log(`[PAYMENT] Ticket references: ${ticketsData.map(t => t[2]).join(", ")}`);

        await new Promise((res,rej) => connection.query(
          `INSERT INTO tickets
             (event_id, user_id, ticket_reference, ticket_type,
              status, user_name, user_email, amount_paid)
           VALUES ?`,
          [ticketsData],
          (e) => {
            if (e) { console.error(`[PAYMENT] Insert tickets error:`, e); return rej(e); }
            console.log(`[PAYMENT] Tickets inserted successfully`);
            res();
          }
        ));

        // 4. credit organizer wallet
        console.log(`[PAYMENT] Step 4 — fetching event creator...`);
        const event = await new Promise((res,rej) => connection.query(
          `SELECT creator_id FROM events WHERE id = ?`,
          [event_id],
          (e, rows) => {
            if (e) { console.error(`[PAYMENT] Fetch event error:`, e); return rej(e); }
            console.log(`[PAYMENT] Event creator_id: ${rows[0]?.creator_id}`);
            res(rows[0]);
          }
        ));

        if (event?.creator_id) {
          console.log(`[PAYMENT] Step 4b — crediting wallet for creator_id: ${event.creator_id}...`);
          const walletResult = await creditWalletForTicketSale({
            connection,
            owner_id:          event.creator_id,
            owner_type:        "event_creator",
            event_id,
            ticket_id:         0,
            customer_email:    user_email,
            gross_amount:      total_amount_paid,
            payment_reference: reference,
          });
          console.log(`[PAYMENT] Wallet credit result:`, walletResult);
        } else {
          console.warn(`[PAYMENT] No creator_id found for event ${event_id} — skipping wallet credit`);
        }

        // 5. commit
        console.log(`[PAYMENT] Step 5 — committing transaction...`);
        await new Promise((res,rej) =>
          connection.commit(e => {
            if (e) { console.error(`[PAYMENT] Commit error:`, e); return rej(e); }
            console.log(`[PAYMENT] Transaction committed successfully`);
            res();
          })
        );
        connection.release();

        // 6. fire-and-forget: SMS + PDF
        console.log(`[PAYMENT] Step 6 — sending SMS + PDF (fire and forget)...`);
        db.query(
          `SELECT event_name, description, poster_image FROM events WHERE id = ?`,
          [event_id],
          (err, rows) => {
            if (err) console.error(`[PAYMENT] Fetch event name error:`, err);
            const ev           = rows?.[0] ?? {};
            const event_name   = ev.event_name   ?? "Unknown Event";
            const description  = ev.description  ?? null;
            const poster_image = ev.poster_image ?? null;

            db.query(
              `SELECT phone_number FROM event_attendees WHERE id = ?`,
              [user_id],
              (err, rows) => {
                if (err) console.error(`[PAYMENT] Fetch phone error:`, err);
                const phone = rows?.[0]?.phone_number ?? null;
                if (phone) {
                  const n = normalizePhone(phone);
                  if (n) sendSMS(n,
                    `Ticket Confirmed!\nEvent: ${event_name}\nType: ${ticket_type}, Qty: ${quantity}\nCode: ${ticketsData[0][2]}${quantity > 1 ? ` +${quantity-1} more` : ""}\nScan QR in your email at entry.`
                  );
                } else {
                  console.warn(`[PAYMENT] No phone found for user_id: ${user_id}`);
                }

                sendTicketsPDF(
                  user_name, user_email, event_id, ticket_type,
                  ticketsData, event_name, description, poster_image
                ).catch(e => console.error("[PAYMENT] PDF error:", e));
              }
            );
          }
        );

        console.log(`[PAYMENT] ========== processSuccessfulPayment DONE ==========\n`);
        resolve({ ticketsData, quantity, reference });
      } catch (error) {
        console.error(`[PAYMENT] CAUGHT ERROR — rolling back:`, error.message);
        connection.rollback(() => connection.release());
        reject(error);
      }
    });
  });
};

// ─────────────────────────────────────────────
// 2. VERIFY PAYMENT (manual fallback)
// Called by frontend after redirect from Paystack
// ─────────────────────────────────────────────
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  console.log(`\n[VERIFY] ===== verifyPayment called =====`);
  console.log(`[VERIFY] reference: ${reference}`);

  if (!reference) return res.status(400).json({ message: "Reference is required" });

  try {
    console.log(`[VERIFY] Calling Paystack verify API...`);
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const data = await response.json();

    console.log(`[VERIFY] Paystack response status: ${data.status}`);
    console.log(`[VERIFY] Paystack payment status: ${data.data?.status}`);
    console.log(`[VERIFY] Paystack metadata:`, JSON.stringify(data.data?.metadata));
    console.log(`[VERIFY] Paystack amount (kobo): ${data.data?.amount}`);

    if (!data.status || data.data.status !== "success") {
      console.warn(`[VERIFY] Payment not successful — status: ${data.data?.status}`);
      return res.status(400).json({ message: "Payment not successful" });
    }

    const { ticket_type, user_name, quantity } = data.data.metadata;
    const user_id           = parseInt(data.data.metadata.user_id,  10);
    const event_id          = parseInt(data.data.metadata.event_id, 10);
    const user_email        = data.data.customer.email;
    const total_amount_paid = data.data.amount / 100;

    console.log(`[VERIFY] Parsed — user_id:${user_id} event_id:${event_id} ticket_type:${ticket_type} qty:${quantity} amount:${total_amount_paid}`);

    if (!user_id || isNaN(user_id)) {
      console.error(`[VERIFY] user_id missing or NaN — raw value: ${data.data.metadata.user_id}`);
      return res.status(400).json({ message: "Invalid metadata: user_id missing. Please log in again." });
    }
    if (!quantity || quantity < 1) {
      console.error(`[VERIFY] Invalid quantity: ${quantity}`);
      return res.status(400).json({ message: "Invalid ticket quantity" });
    }

    console.log(`[VERIFY] Calling processSuccessfulPayment...`);
    await processSuccessfulPayment({
      reference, user_id, event_id, ticket_type,
      user_name, user_email, quantity, total_amount_paid,
    });

    console.log(`[VERIFY] processSuccessfulPayment completed successfully`);
    return res.status(200).json({
      message: "Payment verified & tickets issued. PDF will be emailed shortly!",
      ticket_count: quantity,
      payment_reference: reference,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      console.log(`[VERIFY] Duplicate — already processed by webhook`);
      return res.status(200).json({
        message: "Payment already processed. Check your email for your tickets.",
      });
    }
    console.error("[VERIFY] verifyPayment error:", error);
    return res.status(500).json({ message: "Verification error", error: error.message });
  }
};

// ─────────────────────────────────────────────
// 3. PAYSTACK WEBHOOK (automatic — primary path)
// POST /api/webhooks/paystack
// No auth middleware — Paystack calls this directly
// ─────────────────────────────────────────────
const paystackWebhook = async (req, res) => {
  console.log(`\n[WEBHOOK] ===== paystackWebhook called =====`);
  console.log(`[WEBHOOK] Headers:`, JSON.stringify(req.headers));
  console.log(`[WEBHOOK] Body:`, JSON.stringify(req.body));

  // 1. verify signature
  const signature = req.headers["x-paystack-signature"];
  console.log(`[WEBHOOK] Received signature: ${signature}`);

  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error(`[WEBHOOK] PAYSTACK_SECRET_KEY is not set in .env!`);
    return res.status(500).json({ message: "Server misconfiguration" });
  }

  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest("hex");

  console.log(`[WEBHOOK] Computed hash:  ${hash}`);
  console.log(`[WEBHOOK] Signature match: ${hash === signature}`);

  if (hash !== signature) {
    console.error(`[WEBHOOK] Signature mismatch — rejecting`);
    return res.status(401).json({ message: "Invalid webhook signature" });
  }

  // 2. acknowledge immediately
  console.log(`[WEBHOOK] Signature valid — sending 200`);
  res.status(200).json({ received: true });

  // 3. only handle charge.success
  const { event, data } = req.body;
  console.log(`[WEBHOOK] Event type: ${event}`);

  if (event !== "charge.success") {
    console.log(`[WEBHOOK] Ignoring event type: ${event}`);
    return;
  }

  const { metadata, customer, amount, reference } = data;
  console.log(`[WEBHOOK] reference:  ${reference}`);
  console.log(`[WEBHOOK] amount:     ${amount} kobo = ₦${amount / 100}`);
  console.log(`[WEBHOOK] customer:   ${customer?.email}`);
  console.log(`[WEBHOOK] metadata:   ${JSON.stringify(metadata)}`);

  // guard: check metadata fields
  if (!metadata?.user_id || !metadata?.event_id || !metadata?.ticket_type) {
    console.error(`[WEBHOOK] Missing required metadata fields:`, metadata);
    return;
  }

  const user_id           = parseInt(metadata.user_id,  10);
  const event_id          = parseInt(metadata.event_id, 10);
  const ticket_type       = metadata.ticket_type;
  const user_name         = metadata.user_name  ?? "Guest";
  const quantity          = parseInt(metadata.quantity, 10) || 1;
  const user_email        = customer.email;
  const total_amount_paid = amount / 100;

  console.log(`[WEBHOOK] Parsed — user_id:${user_id} event_id:${event_id} ticket_type:${ticket_type} qty:${quantity} amount:${total_amount_paid}`);

  if (isNaN(user_id) || isNaN(event_id)) {
    console.error(`[WEBHOOK] user_id or event_id is NaN — raw: user_id=${metadata.user_id} event_id=${metadata.event_id}`);
    return;
  }

  console.log(`[WEBHOOK] Calling processSuccessfulPayment...`);
  try {
    await processSuccessfulPayment({
      reference, user_id, event_id, ticket_type,
      user_name, user_email, quantity, total_amount_paid,
    });
    console.log(`[WEBHOOK] ✅ Tickets issued for reference ${reference}`);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      console.log(`[WEBHOOK] Reference ${reference} already processed — skipping`);
      return;
    }
    console.error(`[WEBHOOK] ❌ processSuccessfulPayment failed:`, error.message);
  }
};

module.exports = { buyTicket, verifyPayment, paystackWebhook };