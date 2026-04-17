import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { SomethingElse } from '../../shared/models/something-else';

const router = Router();
const container = getContainer('something-else');

// GET all
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();
    res.json(resources as SomethingElse[]);
  } catch (err) {
    console.error('Error fetching something-else:', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { resource } = await container.item(id, id).read<SomethingElse>();
    if (!resource) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(resource);
  } catch (err) {
    console.error('Error fetching something-else:', err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// POST create
router.post('/', async (req: Request, res: Response) => {
  try {
    const item: SomethingElse = req.body;
    if (!item.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    const { resource } = await container.items.create<SomethingElse>(item);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating something-else:', err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const item: SomethingElse = { ...req.body, id };
    const { resource } = await container.item(id, id).replace<SomethingElse>(item);
    res.json(resource);
  } catch (err) {
    console.error('Error updating something-else:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await container.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting something-else:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
