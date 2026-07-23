import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Memory storage - files stay in memory, no disk writes
const storage = multer.memoryStorage();

// ✅ File filter - check both MIME type and extension
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/mp3',
  ];

  const allowedExtensions = ['.m4a', '.mp4', '.mp3', '.wav', '.webm', '.aac', '.ogg'];

  // Check MIME type
  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  // Check file extension as fallback
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    return cb(null, true);
  }

  const error = new Error(
    `Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`
  );
  error.status = 400;
  cb(error, false);
};

// ✅ Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1, // Only 1 file per request
  },
  fileFilter: fileFilter,
});

// ✅ Error handler for multer-specific errors
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10 MB.',
        errorCode: 'FILE_TOO_LARGE',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Only 1 file allowed.',
        errorCode: 'LIMIT_FILE_COUNT',
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected field name. Use "audio".',
        errorCode: 'LIMIT_UNEXPECTED_FILE',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
      errorCode: 'UPLOAD_ERROR',
    });
  }

  if (err) {
    return res.status(err.status || 400).json({
      success: false,
      error: err.message || 'Invalid file',
      errorCode: 'INVALID_FILE',
    });
  }

  next();
};

// ✅ Export upload as default
export default upload;