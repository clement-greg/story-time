import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadFileToBlob } from '../storage';

const router = Router();
const THUMBNAIL_SIZE = 400; // max width or height in px

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// POST /api/upload  — multipart/form-data with field name "file"
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const id = uuidv4();
    const originalFilename = `${id}${ext}`;
    const thumbnailFilename = `${id}_thumb.webp`;

    // Upload original and thumbnail in parallel
    const thumbnailBuffer = await sharp(req.file.buffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const [originalUrl, thumbnailUrl] = await Promise.all([
      uploadFileToBlob(req.file.buffer, originalFilename, req.file.mimetype),
      uploadFileToBlob(thumbnailBuffer, thumbnailFilename, 'image/webp'),
    ]);

    res.json({ url: originalUrl, thumbnailUrl });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
