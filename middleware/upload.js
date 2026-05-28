const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// ─────────────────────────────────────────────
// CLOUDINARY CONFIG
// ─────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─────────────────────────────────────────────
// SAFE FILE FILTER
// ─────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  try {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      const error = new Error("Only image files are allowed");
      error.status = 400;
      return cb(error, false);
    }

    cb(null, true);
  } catch (err) {
    cb(err);
  }
};

// ─────────────────────────────────────────────
// CLOUDINARY STORAGE (SAFE VERSION)
// ─────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    return {
      folder: "eventpass/events",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 1200, height: 630, crop: "limit" }],
      public_id: `event-${Date.now()}-${Math.round(Math.random() * 1e6)}`
    };
  },
});

// ─────────────────────────────────────────────
// MULTER INSTANCE
// ─────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// ─────────────────────────────────────────────
// GLOBAL MULTER ERROR WRAPPER (IMPORTANT)
// ─────────────────────────────────────────────
const safeUpload = (fields) => {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: "File upload failed",
          error: err.message || String(err),
        });
      }
      next();
    });
  };
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  upload,
  cloudinary,
  safeUpload,
};