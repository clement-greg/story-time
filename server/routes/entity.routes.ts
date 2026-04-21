import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import config from '../config';
import { getContainer } from '../cosmos';
import { Entity } from '../../shared/models/entity.model';
import { withOwnerFilter, readOwnedItem } from '../owner-guard';

const aiClient = new AzureOpenAI({
  endpoint: config.foundry.endpoint,
  apiKey: config.foundry.key,
  apiVersion: '2024-10-21',
});

const router = Router();
const container = getContainer('entities');

// GET all entities
router.get('/', async (req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query(withOwnerFilter(req, 'SELECT * FROM c WHERE (NOT IS_DEFINED(c.archived) OR c.archived = false)'))
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
      .query(withOwnerFilter(req, {
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId AND (NOT IS_DEFINED(c.archived) OR c.archived = false)',
        parameters: [{ name: '@seriesId', value: seriesId }],
      }))
      .fetchAll();
    res.json(resources as Entity[]);
  } catch (err) {
    console.error('Error fetching entities by series:', err);
    res.status(500).json({ error: 'Failed to fetch entities by series' });
  }
});

// GET archived entities by series
router.get('/series/:seriesId/archived', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const { resources } = await container.items
      .query(withOwnerFilter(req, {
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId AND c.archived = true AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)',
        parameters: [{ name: '@seriesId', value: seriesId }],
      }))
      .fetchAll();
    res.json(resources as Entity[]);
  } catch (err) {
    console.error('Error fetching archived entities by series:', err);
    res.status(500).json({ error: 'Failed to fetch archived entities' });
  }
});

// GET all archived entities (cross-series)
router.get('/archived', async (req: Request, res: Response) => {
  try {
    const { resources } = await container.items
      .query(withOwnerFilter(req, 'SELECT * FROM c WHERE c.archived = true AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)'))
      .fetchAll();
    res.json(resources as Entity[]);
  } catch (err) {
    console.error('Error fetching archived entities:', err);
    res.status(500).json({ error: 'Failed to fetch archived entities' });
  }
});

// GET single entity by id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const resource = await readOwnedItem<Entity>(container, id, id, req);
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
    const now = new Date().toISOString();
    entity.owner = entity.owner || req.user!.email;
    entity.createdBy = req.user!.email;
    entity.createdAt = now;
    entity.modifiedBy = req.user!.email;
    entity.modifiedAt = now;
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
    const entity: Entity = { ...req.body, id, owner: req.body.owner || req.user!.email, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Entity>(entity);
    res.json(resource);
  } catch (err) {
    console.error('Error updating entity:', err);
    res.status(500).json({ error: 'Failed to update entity' });
  }
});

// PATCH archive entity
router.patch('/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const existing = await readOwnedItem<Entity>(container, id, id, req);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    const updated: Entity = { ...existing, archived: true, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Entity>(updated);
    res.json(resource);
  } catch (err) {
    console.error('Error archiving entity:', err);
    res.status(500).json({ error: 'Failed to archive entity' });
  }
});

// PATCH unarchive entity
router.patch('/:id/unarchive', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const existing = await readOwnedItem<Entity>(container, id, id, req);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    const updated: Entity = { ...existing, archived: false, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Entity>(updated);
    res.json(resource);
  } catch (err) {
    console.error('Error unarchiving entity:', err);
    res.status(500).json({ error: 'Failed to unarchive entity' });
  }
});

// PATCH soft-delete entity
router.patch('/:id/soft-delete', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const existing = await readOwnedItem<Entity>(container, id, id, req);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    const updated: Entity = { ...existing, deleted: true, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Entity>(updated);
    res.json(resource);
  } catch (err) {
    console.error('Error soft-deleting entity:', err);
    res.status(500).json({ error: 'Failed to soft-delete entity' });
  }
});

// PATCH restore soft-deleted entity
router.patch('/:id/restore-delete', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const existing = await readOwnedItem<Entity>(container, id, id, req);
    if (!existing) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    const updated: Entity = { ...existing, deleted: false, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
    const { resource } = await container.item(id, id).replace<Entity>(updated);
    res.json(resource);
  } catch (err) {
    console.error('Error restoring entity:', err);
    res.status(500).json({ error: 'Failed to restore entity' });
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

// POST generate a personality prompt from basic entity info
router.post('/:id/generate-personality', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const basicDescription: string = req.body.basicDescription ?? '';

    const resource = await readOwnedItem<Entity>(container, id, id, req);
    if (!resource) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    const name = resource.name ?? 'this character';
    const biography = resource.biography ?? '';

    const metaPrompt =
      `You are an expert creative writing consultant. A user is writing a story featuring a character named "${name}"` +
      (biography ? ` with the following biography: ${biography}` : '') + `.
` +
      `Based on the following basic description, write a thorough personality profile for this character. ` +
      `Cover their speech patterns, mannerisms, emotional tendencies, values, fears, how they respond under pressure, ` +
      `and any quirks that would help an AI write authentic dialog for them. ` +
      `Return only the personality profile text — no explanations, no preamble.\n\n` +
      `Basic description: ${basicDescription}`;

    const completion = await aiClient.chat.completions.create({
      model: config.foundry.miniModel,
      messages: [{ role: 'user', content: metaPrompt }],
    });

    const personality = completion.choices[0]?.message?.content?.trim() ?? '';
    res.json({ personality });
  } catch (err) {
    console.error('Error generating personality:', err);
    res.status(500).json({ error: 'Failed to generate personality' });
  }
});

export default router;
