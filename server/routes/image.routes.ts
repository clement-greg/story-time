import { Router, Request, Response } from 'express';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { downloadBlob, uploadFileToBlob } from '../storage';
import config from '../../_private/config.json';

const router = Router();

// POST /api/image/generate  — { prompt: string } → { url, thumbnailUrl }
router.post('/generate', async (req: Request, res: Response) => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt?.trim()) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const genRes = await fetch(config.foundry.imageGenerationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.foundry.imageGenerationKey,
      },
      body: JSON.stringify({
        prompt: prompt.trim(),
        n: 1,
        size: '1024x1024',
      }),
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      console.error('Image generation API error:', errText);
      res.status(502).json({ error: 'Image generation failed' });
      return;
    }

    const genData = await genRes.json() as { data: { b64_json?: string; url?: string }[] };
    const item = genData.data?.[0];
    let imageBuffer: Buffer;

    if (item?.b64_json) {
      imageBuffer = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      const imgRes = await fetch(item.url);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    } else {
      res.status(502).json({ error: 'No image returned from generation API' });
      return;
    }

    const id = uuidv4();
    const originalFilename = `${id}.png`;
    const thumbnailFilename = `${id}_thumb.webp`;

    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const [originalUrl, thumbnailUrl] = await Promise.all([
      uploadFileToBlob(imageBuffer, originalFilename, 'image/png'),
      uploadFileToBlob(thumbnailBuffer, thumbnailFilename, 'image/webp'),
    ]);

    res.json({ url: originalUrl, thumbnailUrl });
  } catch (err) {
    console.error('Image generate error:', err);
    res.status(500).json({ error: 'Image generation failed' });
  }
});

// GET /api/image/:filename
router.get('/:filename', async (req: Request, res: Response) => {
  const filename = Array.isArray(req.params['filename'])
    ? req.params['filename'][0]
    : req.params['filename'];

  // Only allow safe filenames — no path traversal
  if (!filename || /[/\\]/.test(filename)) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  try {
    const { data, contentType } = await downloadBlob(filename);
    // Cache in the browser for 1 year (blobs are UUID-named and immutable)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', data.length);
    res.send(data);
  } catch (err: any) {
    if (err?.statusCode === 404) {
      res.status(404).json({ error: 'Image not found' });
    } else {
      console.error('Image proxy error:', err);
      res.status(500).json({ error: 'Failed to retrieve image' });
    }
  }
});

export default router;
