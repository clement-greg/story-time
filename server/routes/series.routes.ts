import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import config from '../../_private/config.json';
import { getContainer } from '../cosmos';
import { Series } from '../../shared/models/series.model';

const aiClient = new AzureOpenAI({
  endpoint: config.foundry.endpoint,
  apiKey: config.foundry.key,
  apiVersion: '2024-10-21',
});

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
    const now = new Date().toISOString();
    series.createdBy = req.user!.email;
    series.createdAt = now;
    series.modifiedBy = req.user!.email;
    series.modifiedAt = now;
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
    const series: Series = { ...req.body, id, modifiedBy: req.user!.email, modifiedAt: new Date().toISOString() };
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

// POST generate a robust system prompt from basic series info
router.post('/:id/generate-system-prompt', async (req: Request, res: Response) => {
  try {
    const id = req.params['id'] as string;
    const basicPrompt: string = req.body.basicPrompt ?? '';

    const { resource } = await container.item(id, id).read<Series>();
    const seriesTitle = resource?.title ?? 'this series';

    const metaPrompt =
      `You are an expert prompt engineer. A user is writing a story series titled "${seriesTitle}". ` +
      `Based on the following basic description, create a comprehensive, detailed system prompt that will guide an AI writing assistant ` +
      `to produce consistent, high-quality responses for this series. ` +
      `The system prompt should cover tone, style, setting, characters, themes, and any important rules or constraints. ` +
      `Return only the system prompt text — no explanations, no preamble.\n\n` +
      `Basic description: ${basicPrompt}`;

    const completion = await aiClient.chat.completions.create({
      model: config.foundry.miniModel,
      messages: [{ role: 'user', content: metaPrompt }],
    });

    const systemPrompt = completion.choices[0]?.message?.content?.trim() ?? '';
    res.json({ systemPrompt });
  } catch (err) {
    console.error('Error generating system prompt:', err);
    res.status(500).json({ error: 'Failed to generate system prompt' });
  }
});

export default router;
