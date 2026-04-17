import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { Series } from '../../shared/models/series.model';

const router = Router();
const container = getContainer('series');

// GET all series
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();
    res.json(resources as Series[]);
  } catch (err) {
    console.error('Error fetching series:', err);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// GET single series by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { resource } = await container.item(id, id).read<Series>();
    if (!resource) {
      res.status(404).json({ error: 'Series not found' });
      return;
    }
    res.json(resource);
  } catch (err) {
    console.error('Error fetching series:', err);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// POST create new series
router.post('/', async (req: Request, res: Response) => {
  try {
    const series: Series = req.body;
    if (!series.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const { resource } = await container.items.create<Series>(series);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating series:', err);
    res.status(500).json({ error: 'Failed to create series' });
  }
});

// PUT update series
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const series: Series = { ...req.body, id };
    const { resource } = await container.item(id, id).replace<Series>(series);
    res.json(resource);
  } catch (err) {
    console.error('Error updating series:', err);
    res.status(500).json({ error: 'Failed to update series' });
  }
});

// DELETE series
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await container.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting series:', err);
    res.status(500).json({ error: 'Failed to delete series' });
  }
});

export default router;
