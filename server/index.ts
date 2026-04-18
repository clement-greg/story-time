import express, { Request, Response } from 'express';
import path from 'path';
import { HelloResponse } from '../shared/models';
import { initDatabase } from './cosmos';
import { requireAuth } from './auth.middleware';
import seriesRoutes from './routes/series.routes';
import bookRoutes from './routes/book.routes';
import entityRoutes from './routes/entity.routes';
import chapterRoutes from './routes/chapter.routes';
import somethingElseRoutes from './routes/something-else.routes';
import uploadRoutes from './routes/upload.routes';
import imageRoutes from './routes/image.routes';
import chatRoutes from './routes/chat.routes';
import chapterVersionRoutes from './routes/chapter-versions.routes';
import entityRelationshipRoutes from './routes/entity-relationship.routes';

const app = express();
const PORT = process.env['PORT'] || 3200;

app.use(express.json());

// Public route — used to verify login and return user profile
app.get('/api/hello', (_req: Request, res: Response) => {
  const response: HelloResponse = { message: 'Hello World' };
  res.json(response);
});

// Public image proxy — no auth required (UUID filenames are unguessable)
app.use('/api/image', imageRoutes);

// All remaining API routes require a valid Google ID token
app.use('/api', requireAuth);

app.use('/api/series', seriesRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/something-else', somethingElseRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chapter-versions', chapterVersionRoutes);
app.use('/api/entity-relationships', entityRelationshipRoutes);

// Serve Angular static files
app.use(express.static(path.join(__dirname, '../client/dist/client/browser')));

// Fallback to Angular index.html for client-side routing
app.get('*path', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../client/dist/client/browser/index.html'));
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
