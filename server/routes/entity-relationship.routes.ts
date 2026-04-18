import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';
import { EntityRelationship, DiagramLayout } from '../../shared/models/entity-relationship.model';
import { withOwnerFilter } from '../owner-guard';

const router = Router();
const relationshipContainer = getContainer('entity-relationships');
const layoutContainer = getContainer('diagram-layouts');

// ── Relationships ──────────────────────────────────────────

// GET relationships by series
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const { resources } = await relationshipContainer.items
      .query(withOwnerFilter(req, {
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId',
        parameters: [{ name: '@seriesId', value: seriesId }],
      }))
      .fetchAll();
    res.json(resources as EntityRelationship[]);
  } catch (err) {
    console.error('Error fetching relationships:', err);
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

// POST create relationship
router.post('/', async (req: Request, res: Response) => {
  try {
    const rel: EntityRelationship = req.body;
    if (!rel.seriesId || !rel.sourceEntityId || !rel.targetEntityId || !rel.relationshipType) {
      res.status(400).json({ error: 'seriesId, sourceEntityId, targetEntityId, and relationshipType are required' });
      return;
    }
    const now = new Date().toISOString();
    rel.owner = rel.owner || req.user!.email;
    rel.createdBy = req.user!.email;
    rel.createdAt = now;
    rel.modifiedBy = req.user!.email;
    rel.modifiedAt = now;
    const { resource } = await relationshipContainer.items.create<EntityRelationship>(rel);
    res.status(201).json(resource);
  } catch (err) {
    console.error('Error creating relationship:', err);
    res.status(500).json({ error: 'Failed to create relationship' });
  }
});

// PUT update relationship
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const rel: EntityRelationship = {
      ...req.body,
      id,
      owner: req.body.owner || req.user!.email,
      modifiedBy: req.user!.email,
      modifiedAt: new Date().toISOString(),
    };
    const { resource } = await relationshipContainer.item(id, id).replace<EntityRelationship>(rel);
    res.json(resource);
  } catch (err) {
    console.error('Error updating relationship:', err);
    res.status(500).json({ error: 'Failed to update relationship' });
  }
});

// DELETE relationship
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    await relationshipContainer.item(id, id).delete();
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting relationship:', err);
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});

// ── Diagram Layout ─────────────────────────────────────────

// GET layout for a series
router.get('/layout/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const { resources } = await layoutContainer.items
      .query(withOwnerFilter(req, {
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId',
        parameters: [{ name: '@seriesId', value: seriesId }],
      }))
      .fetchAll();
    res.json(resources[0] ?? null);
  } catch (err) {
    console.error('Error fetching diagram layout:', err);
    res.status(500).json({ error: 'Failed to fetch diagram layout' });
  }
});

// PUT upsert layout for a series
router.put('/layout/:seriesId', async (req: Request, res: Response) => {
  try {
    const seriesId = req.params['seriesId'] as string;
    const layout: DiagramLayout = {
      ...req.body,
      seriesId,
      modifiedBy: req.user!.email,
      modifiedAt: new Date().toISOString(),
    };
    if (!layout.createdBy) {
      layout.createdBy = req.user!.email;
      layout.createdAt = new Date().toISOString();
    }
    if (!layout.owner) {
      layout.owner = req.user!.email;
    }
    const { resource } = await layoutContainer.items.upsert<DiagramLayout>(layout);
    res.json(resource);
  } catch (err) {
    console.error('Error saving diagram layout:', err);
    res.status(500).json({ error: 'Failed to save diagram layout' });
  }
});

export default router;
