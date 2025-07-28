import multer from "multer";
import path from "path";
import fs from "fs";

// Lokasi folder simpan file di dalam project, misalnya src/uploads
const uploadDir = path.join(process.cwd(), "src", "uploads");

// Buat folder kalau belum ada
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Folder uploads dibuat di:", uploadDir);
} else {
  console.log("✅ Folder uploads sudah ada di:", uploadDir);
}

// Ekstensi file yang diizinkan
const allowedExtensions = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${baseName}_${timestamp}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new Error("Only PDF, DOC, DOCX, JPG, JPEG, and PNG files are allowed"));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maksimal 5mb
  },
});
