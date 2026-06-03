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
const { sendSMS } = require("../smsLogic/sms");

// ─────────────────────────────────────────────
// 1. INITIALIZE PAYMENT
// ─────────────────────────────────────────────
const buyTicket = async (req, res) => {
  const user_id    = req.user.user_id || req.user.id;
  const user_name  = req.user.name;
  const user_email = req.user.email;
  const event_id   = req.params.id;
  const { ticket_type, quantity } = req.body;

  if (!user_id)
    return res.status(401).json({ message: "User ID missing from token. Please log in again." });
  if (!ticket_type || !quantity)
    return res.status(400).json({ message: "Ticket type and quantity are required" });

  try {
    db.query(
      `SELECT * FROM ticket_types WHERE event_id = ? AND name = ? AND is_active = 1`,
      [event_id, ticket_type],
      async (err, results) => {
        if (err) return res.status(500).json({ message: "DB error", err });
        if (!results.length) return res.status(404).json({ message: "Ticket type not found" });

        const ticket = results[0];
        if (ticket.quantity < quantity)
          return res.status(400).json({ message: `Only ${ticket.quantity} tickets left` });

        const reference = crypto.randomUUID();
        const response  = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user_email,
            amount: ticket.price * quantity * 100,
            reference,
            metadata: { user_id, event_id, ticket_type, user_name, quantity },
            callback_url: `${process.env.FRONTEND_URL}/payment-success`,
          }),
        });
        const data = await response.json();
        if (!data.status) return res.status(400).json({ message: "Payment init failed" });
        res.status(200).json({ authorization_url: data.data.authorization_url, reference });
      }
    );
  } catch (e) {
    res.status(500).json({ message: "Payment initialization error" });
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

// wrap text into lines that fit maxWidth
const wrapText = (font, text, size, maxWidth) => {
  const words = (text || "").split(" ");
  const lines = [];
  let   line  = "";
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
// PDF GENERATION — landscape two-panel ticket
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
      overlay:    rgb(0.04, 0.04, 0.16),  // dark overlay on top of poster
    };

    const PW = 760, PH = 560;
    const LW = 460;
    const RW = PW - LW;
    const SEP = LW;
    const LP  = 24;
    const BAND_H  = 68;
    const WHITE_H = 188;
    const RC_L = SEP + 18;
    const RC_R = PW  - 18;
    const RC_W = RC_R - RC_L;

    // ── try to fetch & embed the poster image once (shared across all tickets) ──
    let posterImg = null;
    if (poster_image_url) {
      try {
        const buf = await fetchImageBuffer(poster_image_url);
        // detect jpeg vs png by magic bytes
        const isPng = buf[0] === 0x89 && buf[1] === 0x50;
        posterImg   = isPng
          ? await pdfDoc.embedPng(buf)
          : await pdfDoc.embedJpg(buf);
      } catch (e) {
        console.warn("Could not embed poster image:", e.message);
      }
    }

    // ── prepare description lines (max 2 lines, fits subtitle slot) ──
    const descText  = event_description
      ? event_description.replace(/\n/g, " ").trim()
      : "Join us for an unforgettable experience.";
    const DESC_SIZE = 9.5;
    const DESC_MAX  = LW - LP*2 - 10;
    const descLines = wrapText(fReg, descText, DESC_SIZE, DESC_MAX).slice(0, 2); // max 2 lines

    for (const ticket of ticketsData) {
      const ref      = ticket[2];
      const shortRef = ref.split("-")[0].toUpperCase();
      const page     = pdfDoc.addPage([PW, PH]);

      // ══ LEFT PANEL ════════════════════════════

      // 1. gradient base
      gradBg(page, 0, 0, LW, PH);

      // 2. poster image — fills the hero area above the white section
      //    drawn AFTER gradient so it sits on top; dark overlay keeps text readable
      const HERO_BOTTOM = BAND_H + WHITE_H;   // where white section ends
      const HERO_H      = PH - HERO_BOTTOM;   // hero area height

      if (posterImg) {
        // stretch to fill the hero region of the left panel
        page.drawImage(posterImg, {
          x: 0, y: HERO_BOTTOM,
          width: LW, height: HERO_H,
          opacity: 0.55,   // semi-transparent so gradient still shows through
        });
      }

      // 3. dark gradient overlay so text stays legible over any poster
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        page.drawRectangle({
          x: 0, y: HERO_BOTTOM + i*(HERO_H/30),
          width: LW, height: HERO_H/30 + 1,
          color: rgb(0.04, 0.04, 0.14),
          opacity: 0.55 - t*0.45,   // fade from opaque at bottom to transparent at top
        });
      }

      // subtle glow
      [0,1,2].forEach(i => page.drawEllipse({
        x: LW*0.65, y: PH*0.55,
        xScale: 90+i*28, yScale: 70+i*20,
        color: rgb(0.28, 0.10, 0.65), opacity: 0.04
      }));

      // brand bar
      const BRAND_Y = PH - 48;
      rr(page, LP, BRAND_Y-6, 26, 26, 5, C.purpleL);
      page.drawText("E",                { x:LP+7,  y:BRAND_Y+4,  size:14,  font:fBold, color:C.white    });
      page.drawText("PYRAMID-AFRICA",        { x:LP+32, y:BRAND_Y+6,  size:10,  font:fBold, color:C.white    });
      page.drawText("LIVE EXPERIENCES", { x:LP+32, y:BRAND_Y-6,  size:6.5, font:fReg,  color:C.iconTint });

      // E-TICKET pill
      const PILL_W = 82, PILL_H = 24;
      const PILL_X = LW - LP - PILL_W;
      rr(page, PILL_X, BRAND_Y-4, PILL_W, PILL_H, 12, C.purplePill);
      ctr(page, "E-TICKET", BRAND_Y+6, 9, fBold, C.white, PILL_X, PILL_W);

      // event name — two lines
      const NAME_Y = PH - 104;
      const words  = event_name.toUpperCase().split(" ");
      const wmid   = Math.ceil(words.length/2);
      page.drawText(trunc(fBold, words.slice(0,wmid).join(" "), 36, LW-LP*2), { x:LP, y:NAME_Y,    size:36, font:fBold, color:C.white });
      page.drawText(trunc(fBold, words.slice(wmid).join(" "),   36, LW-LP*2), { x:LP, y:NAME_Y-44, size:36, font:fBold, color:C.white });

      // ── DESCRIPTION replaces hardcoded subtitle ──
      const SUB_Y = NAME_Y - 72;
      descLines.forEach((ln, i) => {
        page.drawText(ln, {
          x: LP, y: SUB_Y - i*14,
          size: DESC_SIZE, font: fReg, color: C.iconTint,
        });
      });
      // purple underline after description
      const RULE_Y = SUB_Y - descLines.length * 14 - 4;
      page.drawLine({ start:{x:LP, y:RULE_Y}, end:{x:LP+196, y:RULE_Y}, thickness:1.5, color:C.purpleL });

      // detail rows
      const ICON_X = LP;
      const TEXT_X = LP + 28;
      let   DET_Y  = RULE_Y - 20;

      const detRow = (drawIcon, bold, soft) => {
        drawIcon(ICON_X, DET_Y);
        page.drawText(bold, { x:TEXT_X, y:DET_Y,    size:10,  font:fBold, color:C.white    });
        if (soft) page.drawText(soft, { x:TEXT_X, y:DET_Y-13, size:8.5, font:fReg, color:C.iconTint });
        DET_Y -= soft ? 42 : 34;
      };

      // calendar icon
      detRow((x,y) => {
        rr(page, x, y-2, 18, 15, 2, C.iconTint);
        page.drawRectangle({ x:x+1, y:y+6, width:16, height:6, color:C.white });
        page.drawLine({ start:{x:x+5,  y:y+13}, end:{x:x+5,  y:y+11}, thickness:1.5, color:C.darkBand });
        page.drawLine({ start:{x:x+13, y:y+13}, end:{x:x+13, y:y+11}, thickness:1.5, color:C.darkBand });
      }, ticket_type.toUpperCase()+" TICKET");

      // clock icon
      detRow((x,y) => {
        page.drawEllipse({ x:x+9, y:y+7, xScale:9, yScale:9, borderColor:C.iconTint, borderWidth:1.5, color:rgb(0,0,0) });
        page.drawLine({ start:{x:x+9, y:y+7},  end:{x:x+9,  y:y+12}, thickness:1.5, color:C.iconTint });
        page.drawLine({ start:{x:x+9, y:y+7},  end:{x:x+13, y:y+7 }, thickness:1.5, color:C.iconTint });
      }, "Present QR code at entrance");

      // pin icon
      detRow((x,y) => {
        page.drawEllipse({ x:x+9, y:y+10, xScale:7, yScale:7, borderColor:C.iconTint, borderWidth:1.5, color:rgb(0,0,0) });
        page.drawLine({ start:{x:x+9, y:y+3}, end:{x:x+9, y:y}, thickness:2, color:C.iconTint });
      }, "Non-transferable ticket", "One entry per QR code");

      // white section
      const WS_Y   = BAND_H;
      const WS_TOP = WS_Y + WHITE_H;
      page.drawRectangle({ x:0, y:WS_Y, width:LW, height:WHITE_H, color:C.offWhite });

      page.drawText("EVENT DETAILS", { x:LP, y:WS_TOP-22, size:11, font:fBold, color:C.purpleText });
      page.drawLine({ start:{x:LP, y:WS_TOP-26}, end:{x:LP+88, y:WS_TOP-26}, thickness:2, color:C.purpleText });

      [
        `Event: ${trunc(fReg, event_name, 8.5, LW-LP*2-10)}`,
        `Type: ${ticket_type} Access`,
        "Scan QR code at the entrance for entry.",
      ].forEach((ln, i) =>
        page.drawText(ln, { x:LP, y:WS_TOP-44-i*13, size:8.5, font:fReg, color:C.mid })
      );

      // entry guidelines
      const EG_Y = WS_Y + 88;
      page.drawText("ENTRY GUIDELINES", { x:LP, y:EG_Y,   size:10, font:fBold, color:C.purpleText });
      page.drawLine({ start:{x:LP, y:EG_Y-4}, end:{x:LP+108, y:EG_Y-4}, thickness:1.5, color:C.purpleText });

      const GL_W = Math.floor((LW - LP*2 - 6*3) / 4);
      const GL_Y = WS_Y + 18;
      ["Show e-ticket","Valid ID req.","No re-entry","No outside food"].forEach((g, i) => {
        const gx = LP + i*(GL_W+6);
        rr(page, gx, GL_Y, GL_W, 26, 4, C.divider);
        ctr(page, g, GL_Y+9, 7, fReg, C.mid, gx, GL_W);
      });

      // dark band
      page.drawRectangle({ x:0, y:0, width:LW, height:BAND_H, color:C.darkBand });
      rr(page, LP, BAND_H/2-16, 32, 32, 16, C.purplePill);
      page.drawText("*", { x:LP+11, y:BAND_H/2-4, size:14, font:fBold, color:C.white });
      const TY_X = LP + 40;
      page.drawText("THANK YOU!",                        { x:TY_X, y:BAND_H/2+8,  size:10, font:fBold, color:C.white    });
      page.drawText("We can't wait to create memories.", { x:TY_X, y:BAND_H/2-6,  size:8,  font:fReg,  color:C.iconTint });
      page.drawText("@Pyramid-Africa  |  Pyramid-Africa.com",  { x:TY_X, y:BAND_H/2-20, size:7,  font:fReg,  color:C.muted    });

      // ══ RIGHT PANEL ═══════════════════════════
      page.drawRectangle({ x:SEP, y:0, width:RW, height:PH, color:C.offWhite });

      // dashed separator + notch cutouts
      let dashY = 14;
      while (dashY < PH-14) {
        page.drawLine({ start:{x:SEP, y:dashY}, end:{x:SEP, y:dashY+6}, thickness:1, color:C.divider });
        dashY += 11;
      }
      page.drawEllipse({ x:SEP, y:PH, xScale:11, yScale:11, color:C.offWhite });
      page.drawEllipse({ x:SEP, y:0,  xScale:11, yScale:11, color:C.offWhite });

      // TICKET ID pill
      const TID_Y = PH - 44;
      rr(page, RC_L, TID_Y, RC_W, 24, 6, C.purplePill);
      ctr(page, "TICKET ID", TID_Y+8, 9, fBold, C.white, RC_L, RC_W);
      page.drawText("EVT-"+shortRef, { x:RC_L+8, y:TID_Y-18, size:11, font:fBold, color:C.dark });

      // QR code
      const QR_SIZE   = 120;
      const QR_PAD    = 8;
      const QR_CARD_W = QR_SIZE + QR_PAD*2;
      const QR_CARD_H = QR_SIZE + QR_PAD*2;
      const QR_CARD_X = RC_L + (RC_W - QR_CARD_W)/2;
      const QR_CARD_Y = TID_Y - 24 - QR_CARD_H;

      const verifyUrl = `${process.env.BACKEND_URL}/api/security/scan/${ref}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width:220, margin:1, errorCorrectionLevel:"H",
        color:{ dark:"#0D0D20", light:"#FFFFFF" },
      });
      const qrBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
      const qrImage = await pdfDoc.embedPng(qrBytes);

      rr(page, QR_CARD_X, QR_CARD_Y, QR_CARD_W, QR_CARD_H, 6, C.white);
      page.drawImage(qrImage, { x:QR_CARD_X+QR_PAD, y:QR_CARD_Y+QR_PAD, width:QR_SIZE, height:QR_SIZE });

      const SCAN_Y = QR_CARD_Y - 18;
      ctr(page, "SCAN AT ENTRY",                             SCAN_Y,    9, fBold, C.purpleText, RC_L, RC_W);
      ctr(page, "Each ticket is unique & non-transferable.", SCAN_Y-14, 7, fReg,  C.muted,      RC_L, RC_W);

      // dashed divider across right panel
      const DIV_Y = SCAN_Y - 28;
      let rdX = RC_L;
      while (rdX < RC_R) {
        page.drawLine({ start:{x:rdX, y:DIV_Y}, end:{x:Math.min(rdX+5, RC_R), y:DIV_Y}, thickness:0.8, color:C.divider });
        rdX += 9;
      }

      // attendee rows
      const ICON_R  = 8;
      const ICON_CX = RC_L + ICON_R;
      const ROW_TX  = RC_L + ICON_R*2 + 10;
      const ROW_TW  = RC_R - ROW_TX;
      let   RY      = DIV_Y - 26;

      const rightRow = (label, value) => {
        page.drawEllipse({ x:ICON_CX, y:RY+4, xScale:ICON_R, yScale:ICON_R, color:C.divider });
        page.drawText(label, { x:ROW_TX, y:RY+10, size:7.5, font:fBold, color:C.purpleText });
        page.drawText(trunc(fBold, value, 11, ROW_TW), { x:ROW_TX, y:RY-2, size:11, font:fBold, color:C.dark });
        RY -= 34;
        page.drawLine({ start:{x:RC_L, y:RY+14}, end:{x:RC_R, y:RY+14}, thickness:0.4, color:C.divider });
      };

      rightRow("ATTENDEE",    user_name);
      rightRow("TICKET TYPE", ticket_type+" Access");
      rightRow("ACCESS LEVEL",ticket_type);
      rightRow("REF CODE",    shortRef);

      // barcode
      try {
        const barBuf = await bwipjs.toBuffer({ bcid:"code128", text:shortRef, scale:2, height:12 });
        const barImg = await pdfDoc.embedPng(barBuf);
        page.drawImage(barImg, { x:RC_L, y:28, width:RC_W, height:38 });
      } catch(e) {
        rr(page, RC_L, 28, RC_W, 38, 3, C.divider);
      }
      ctr(page, shortRef, 10, 8, fReg, C.muted, RC_L, RC_W);
    }

    // save & email
    const pdfBytes   = await pdfDoc.save();
    const ticketsDir = path.join(__dirname, "../tickets");
    if (!fs.existsSync(ticketsDir)) fs.mkdirSync(ticketsDir);
    const pdfPath = path.join(ticketsDir, `${crypto.randomUUID()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    if (process.env.SKIP_EMAIL !== "true") {
      await transporter.sendMail({
        from: process.env.SMTP_USER, to: user_email,
        subject: `Your Tickets for ${event_name}`,
        html:`
<div style="max-width:600px;margin:auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8e8f0">

  <!-- Header -->
  <div style="background:#3314DD;padding:44px 36px 36px;text-align:center">
    <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:8px;padding:6px 16px;margin-bottom:20px">
      <span style="color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;letter-spacing:0.06em">E-TICKET CONFIRMED</span>
    </div>
    <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;line-height:1.3">
      You're officially on<br>the guest list
    </h1>
    <p style="color:rgba(255,255,255,0.75);margin:12px 0 0;font-size:14px">
      Your ticket has been generated and attached below.
    </p>
  </div>

  <!-- Purple accent strip -->
  <div style="height:5px;background:linear-gradient(90deg,#7F77DD,#AFA9EC,#7F77DD)"></div>

  <!-- Body -->
  <div style="padding:36px">

    <!-- Greeting -->
    <p style="color:#444;font-size:15px;margin:0 0 24px;line-height:1.7">
      Hello <strong style="color:#111">${user_name}</strong>,<br>
      Thank you for your purchase. Your ticket${ticketsData.length > 1 ? "s have" : " has"} been successfully generated and attached to this email as a PDF.
    </p>

    <!-- Event card -->
    <div style="border-radius:12px;border:1px solid #e2e0f8;overflow:hidden;margin-bottom:24px">
      <div style="background:#EEEDFE;padding:20px 24px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#534AB7;letter-spacing:0.06em;text-transform:uppercase">Your Event</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#26215C">${event_name}</p>
      </div>
      <div style="padding:16px 24px;background:#ffffff">
        <p style="margin:0;color:#666;font-size:14px;line-height:1.7">
          Your ticket contains a unique QR code. Present it at the venue entrance — it will be scanned for instant entry.
        </p>
      </div>
    </div>

    <!-- 3-step row -->
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

    <!-- Warning banner -->
    <div style="border-radius:10px;border:1px solid #AFA9EC;background:#EEEDFE;padding:14px 18px;margin-bottom:28px">
      <p style="margin:0;font-size:13px;color:#3C3489;line-height:1.6">
        <strong>Keep your ticket safe.</strong> This ticket is non-transferable and can only be used once. Do not share or post your QR code online.
      </p>
    </div>

    <p style="color:#555;font-size:14px;line-height:1.8;margin:0 0 8px">
      We look forward to welcoming you and making this an unforgettable experience.
    </p>
    <p style="color:#111;font-size:15px;font-weight:700;margin:0">See you there! 🚀</p>
  </div>

  <!-- Divider -->
  <div style="height:1px;background:#ececec"></div>

  <!-- Footer -->
  <div style="background:#f8f8fc;padding:24px 36px;text-align:center">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#3314DD">EventPass</p>
    <p style="margin:0 0 6px;color:#888;font-size:12px">This email was sent regarding your ticket purchase.</p>
    <p style="margin:0;color:#bbb;font-size:11px">If you did not make this purchase, please contact support immediately.</p>
  </div>

</div>
`,
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
// 2. VERIFY PAYMENT + SAVE + CREATE TICKETS
// ─────────────────────────────────────────────
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const verifyPayment = async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ message: "Reference is required" });

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await response.json();
    if (!data.status || data.data.status !== "success")
      return res.status(400).json({ message: "Payment not successful" });

    const { ticket_type, user_name, quantity } = data.data.metadata;
    const user_id           = parseInt(data.data.metadata.user_id,  10);
    const event_id          = parseInt(data.data.metadata.event_id, 10);
    const user_email        = data.data.customer.email;
    const total_amount_paid = data.data.amount / 100;

    if (!user_id || isNaN(user_id)) {
      console.error("verifyPayment: user_id missing", data.data.metadata);
      return res.status(400).json({ message: "Invalid metadata: user_id missing. Please log in again." });
    }
    if (!quantity || quantity < 1) return res.status(400).json({ message: "Invalid ticket quantity" });

    db.getConnection(async (err, connection) => {
      if (err) return res.status(500).json({ message: "DB connection error", err });
      try {
        await new Promise((res,rej) => connection.beginTransaction(e => e ? rej(e) : res()));

        await new Promise((res,rej) => connection.query(
          `INSERT INTO payments (reference,user_id,event_id,ticket_type,amount,status,paid_at) VALUES (?,?,?,?,?,?,NOW())`,
          [reference,user_id,event_id,ticket_type,total_amount_paid,"success"],
          e => e ? rej(e) : res()
        ));

        const rQty = await new Promise((res,rej) => connection.query(
          `UPDATE ticket_types SET quantity=quantity-? WHERE event_id=? AND name=? AND quantity>=?`,
          [quantity,event_id,ticket_type,quantity],
          (e,r) => e ? rej(e) : res(r)
        ));
        if (rQty.affectedRows === 0) throw new Error("Not enough tickets available");

        const ticketsData = Array.from({ length: quantity }, () => [
          event_id, user_id, crypto.randomUUID(),
          ticket_type, "unused", user_name, user_email,
          total_amount_paid / quantity,
        ]);

        await new Promise((res,rej) => connection.query(
          `INSERT INTO tickets (event_id,user_id,ticket_reference,ticket_type,status,user_name,user_email,amount_paid) VALUES ?`,
          [ticketsData], e => e ? rej(e) : res()
        ));

        connection.commit(err => {
          if (err) return connection.rollback(() => connection.release());
          connection.release();

          res.status(200).json({
            message: "Payment verified & tickets issued. PDF will be emailed shortly!",
            ticket_count: quantity,
            payment_reference: reference,
          });

          // ── fetch event details (name + description + poster) for the PDF ──
          db.query(
            `SELECT event_name, description, poster_image FROM events WHERE id = ?`,
            [event_id],
            (err, rows) => {
              const event        = rows?.[0] ?? {};
              const event_name   = event.event_name   ?? "Unknown Event";
              const description  = event.description  ?? null;
              const poster_image = event.poster_image ?? null;

              db.query(`SELECT phone_number FROM event_attendees WHERE id=?`, [user_id], (err, rows) => {
                const phone = rows?.[0]?.phone_number ?? null;
                if (phone) {
                  const n = normalizePhone(phone);
                  if (n) sendSMS(n,
                    `Ticket Confirmed!\nEvent: ${event_name}\nType: ${ticket_type}, Qty: ${quantity}\nCode: ${ticketsData[0][2]}${quantity>1?` +${quantity-1} more`:""}\nScan QR in your email at entry.`
                  );
                }

                // pass description and poster_image into PDF generator
                sendTicketsPDF(
                  user_name, user_email, event_id, ticket_type,
                  ticketsData, event_name, description, poster_image
                ).catch(e => console.error("PDF error:", e));
              });
            }
          );
        });
      } catch (error) {
        connection.rollback(() => connection.release());
        console.error("Payment/ticket error:", error);
        res.status(500).json({ message: "Error processing payment/tickets", error });
      }
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Verification error", error });
  }
};

// scanVerifyTicket lives in securityController.js
module.exports = { buyTicket, verifyPayment };