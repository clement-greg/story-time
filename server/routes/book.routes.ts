import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { Book } from '../../shared/models/book.model';

const router = Router();
const container = getContainer('books');

// GET all books
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();
    res.json(resources as Book[]);
  } catch (err) {
    console.error('Error fetching books:', err);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

// GET books by series
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId',
        parameters: [{ name: '@seriesId', value: seriesId }],
      })
      .fetchAll();
    res.json(resources as Book[]);
  } catch (err) {
    console.error('Error fetching books by series:', err);
    res.status(500).json({ error: 'Failed to fetch books by series' });
  }
});

// GET single book by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { resource } = await container.item(id, id).read<Book>();
    if (!resource) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }
    res.json(resource);
  } catch (err) {
    console.error('Error fetching book:', err);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// POST create new book
router.post('/', async (req: Request, res: Response) => {
  try {
    const book: Book = req.body;
    if (!book.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    if (!book.seriesId) {
      res.status(400).json({ error: 'Series is required' });
      return;
    }
    const now = new Date().toISOString();
    book.createdBy = req.user!.email;
    book.createdAt = now;
    book.modifiedBy = req.user!.email;
    book.modifiedAt = now;
    const { resource } = await container.items.create<Book>(book);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating book:', err);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// PATCH reorder books
router.patch('/reorder', async (req: Request, res: Response) => {
  try {
    const items: { id: string; sortOrder: number }[] = req.body;
    await Promise.all(
      items.map(async ({ id, sortOrder }) => {
        const { resource } = await container.item(id, id).read<Book>();
        if (resource) {
          await container.item(id, id).replace<Book>({ ...resource, sortOrder });
        }
      })
    );
    res.status(204).send();
  } catch (err) {
    console.error('Error reordering books:', err);
    res.status(500).json({ error: 'Failed to reorder books' });
  }
});

// PUT update book
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const book: Book = { ...req.body, id, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Book>(book);
    res.json(resource);
  } catch (err) {
    console.error('Error updating book:', err);
    res.status(500).json({ error: 'Failed to update book' });
  }
});

// DELETE book
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await container.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting book:', err);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

export default router;
