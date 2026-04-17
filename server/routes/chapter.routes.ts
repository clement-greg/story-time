import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { Chapter } from '../../shared/models/chapter.model';

const router = Router();
const container = getContainer('chapters');

// GET all chapters
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();
    res.json(resources as Chapter[]);
  } catch (err) {
    console.error('Error fetching chapters:', err);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
});

// GET chapters by book
router.get('/book/:bookId', async (req: Request, res: Response) => {
  try {
    const bookId = req.params['bookId'] as string;
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.bookId = @bookId',
        parameters: [{ name: '@bookId', value: bookId }],
      })
      .fetchAll();
    res.json(resources as Chapter[]);
  } catch (err) {
    console.error('Error fetching chapters by book:', err);
    res.status(500).json({ error: 'Failed to fetch chapters by book' });
  }
});

// GET single chapter by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { resource } = await container.item(id, id).read<Chapter>();
    if (!resource) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }
    res.json(resource);
  } catch (err) {
    console.error('Error fetching chapter:', err);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
});

// POST create new chapter
router.post('/', async (req: Request, res: Response) => {
  try {
    const chapter: Chapter = req.body;
    if (!chapter.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    if (!chapter.bookId) {
      res.status(400).json({ error: 'Book is required' });
      return;
    }
    const { resource } = await container.items.create<Chapter>(chapter);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating chapter:', err);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

// PUT update chapter
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const chapter: Chapter = { ...req.body, id };
    const { resource } = await container.item(id, id).replace<Chapter>(chapter);
    res.json(resource);
  } catch (err) {
    console.error('Error updating chapter:', err);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
});

// DELETE chapter
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await container.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting chapter:', err);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
});

export default router;
