import express, { Request, Response } from 'express';
import path from 'path';
import { HelloResponse } from '../shared/models';
import { initDatabase } from './cosmos';
import { requireAuth } from './auth.middleware';
import authRoutes from './routes/auth.routes';
import seriesRoutes from './routes/series.routes';
import bookRoutes from './routes/book.routes';
import entityRoutes from './routes/entity.routes';
import chapterRoutes from './routes/chapter.routes';
import uploadRoutes from './routes/upload.routes';
import imageRoutes from './routes/image.routes';
import chatRoutes from './routes/chat.routes';
import chapterVersionRoutes from './routes/chapter-versions.routes';
import entityRelationshipRoutes from './routes/entity-relationship.routes';
import exportRoutes from './routes/export.routes';
import bookNotesRoutes from './routes/book-notes.routes';
import grammarRoutes from './routes/grammar.routes';
import entityQuotesRoutes from './routes/entity-quotes.routes';

const app = express();
const PORT = process.env['PORT'] || 3200;

// Required for Google Sign-In (GSI) to work: the GSI library uses postMessage
// between the popup/iframe and the opener. A strict COOP header (same-origin)
// blocks that channel. Azure App Service sets same-origin by default, so we
// explicitly override it to same-origin-allow-popups for HTML document responses.
app.use((_req: Request, res: Response, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json());

// Public route — used to verify login and return user profile
app.get('/api/hello', (_req: Request, res: Response) => {
  const response: HelloResponse = { message: 'Hello World' };
  res.json(response);
});

// Public auth route — exchanges a Google ID token for a custom 48-hour JWT
app.use('/api/auth', authRoutes);

// Public image proxy — no auth required (UUID filenames are unguessable)
app.use('/api/image', imageRoutes);

// All remaining API routes require a valid Google ID token
app.use('/api', requireAuth);

app.use('/api/series', seriesRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chapter-versions', chapterVersionRoutes);
app.use('/api/entity-relationships', entityRelationshipRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/book-notes', bookNotesRoutes);
app.use('/api/grammar', grammarRoutes);
app.use('/api/entity-quotes', entityQuotesRoutes);

// Serve Angular static files
app.use(express.static(path.join(__dirname, '../../client/dist/client/browser')));

// Fallback to Angular index.html for client-side routing
app.get('*path', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../../client/dist/client/browser/index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
