import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { Entity } from '../../shared/models/entity.model';

const router = Router();
const container = getContainer('entities');

// GET all entities
router.get('/', async (_req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query('SELECT * FROM c')
      .fetchAll();
    res.json(resources as Entity[]);
  } catch (err) {
    console.error('Error fetching entities:', err);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

// GET entities by series
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId',
        parameters: [{ name: '@seriesId', value: seriesId }],
      })
      .fetchAll();
    res.json(resources as Entity[]);
  } catch (err) {
    console.error('Error fetching entities by series:', err);
    res.status(500).json({ error: 'Failed to fetch entities by series' });
  }
});

// GET single entity by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const { resource } = await container.item(id, id).read<Entity>();
    if (!resource) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    res.json(resource);
  } catch (err) {
    console.error('Error fetching entity:', err);
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
});

// POST create new entity
router.post('/', async (req: Request, res: Response) => {
  try {
    const entity: Entity = req.body;
    if (!entity.name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    if (!entity.seriesId) {
      res.status(400).json({ error: 'Series is required' });
      return;
    }
    if (!entity.type || !['PERSON', 'PLACE', 'THING'].includes(entity.type)) {
      res.status(400).json({ error: 'Type must be PERSON, PLACE, or THING' });
      return;
    }
    const { resource } = await container.items.create<Entity>(entity);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating entity:', err);
    res.status(500).json({ error: 'Failed to create entity' });
  }
});

// PUT update entity
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const entity: Entity = { ...req.body, id };
    const { resource } = await container.item(id, id).replace<Entity>(entity);
    res.json(resource);
  } catch (err) {
    console.error('Error updating entity:', err);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

// DELETE entity
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await container.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting entity:', err);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
});

export default router;
