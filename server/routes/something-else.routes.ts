import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { SomethingElse } from '../../shared/models/something-else';
import { withOwnerFilter, readOwnedItem } from '../owner-guard';

const router = Router();
const container = getContainer('something-else');

// GET all
router.get('/', async (req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query(withOwnerFilter(req, 'SELECT * FROM c'))
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
    const resource = await readOwnedItem<SomethingElse>(container, id, id, req);
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
    const now = new Date().toISOString();
    item.owner = item.owner || req.user!.email;
    item.createdBy = req.user!.email;
    item.createdAt = now;
    item.modifiedBy = req.user!.email;
    item.modifiedAt = now;
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
    const item: SomethingElse = { ...req.body, id, owner: req.body.owner || req.user!.email, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
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
