import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { Options } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.webm', '.flac']);
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function audioUploadOptions(destination = './uploads'): Options {
  return {
    storage: diskStorage({
      destination,
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.wav';
        cb(null, `${uuidv4()}${safeExt}`);
      },
    }),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname || '').toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();
      const mimeOk =
        mime.startsWith('audio/') ||
        mime === 'application/octet-stream' ||
        mime === 'video/webm';
      if (!ALLOWED_EXTENSIONS.has(ext) || !mimeOk) {
        cb(new BadRequestException('Only audio uploads are allowed'));
        return;
      }
      cb(null, true);
    },
  };
}
