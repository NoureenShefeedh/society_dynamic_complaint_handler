import multer from "multer";

// Store the file in memory (as a buffer) rather than on disk — we
// immediately forward it to Supabase Storage, so we don't need to
// write it to the local filesystem first.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, or WEBP images are allowed"), false);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per photo
});
