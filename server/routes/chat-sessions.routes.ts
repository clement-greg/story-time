import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import { randomUUID } from 'crypto';
import config from '../config';
import { getContainer } from '../cosmos';

const router = Router();

const client = new AzureOpenAI({
  endpoint: config.foundry.endpoint,
  apiKey: config.foundry.key,
  apiVersion: '2024-10-21',
});

// GET / — list all session summaries for the authenticated user (newest first)
router.get('/', async (req: Request, res: Response) => {
  try {
    const container = getContainer('chat-sessions');
    const { resources } = await container.items
      .query({
        query: `SELECT c.id, c.name, c.pinned, c.updatedAt FROM c
                WHERE c.owner = @owner
                  AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
                ORDER BY c.updatedAt DESC`,
        parameters: [{ name: '@owner', value: req.user!.email }],
      })
      .fetchAll();
    res.json(resources);
  } catch (err) {
    console.error('Error listing chat sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// POST / — create a new session
router.post('/', async (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const session = {
    id: randomUUID(),
    owner: req.user!.email,
    name: 'New Chat',
    pinned: false,
    messages: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  try {
    const container = getContainer('chat-sessions');
    await container.items.create(session);
    res.json(session);
  } catch (err) {
    console.error('Error creating chat session:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /:id — get a full session (with messages)
router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  try {
    const container = getContainer('chat-sessions');
    const { resource } = await container.item(id, id).read<any>();
    if (!resource || resource.deleted || resource.owner !== req.user!.email) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(resource);
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

// PUT /:id — update session fields (name, pinned, messages)
router.put('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  try {
    const container = getContainer('chat-sessions');
    const { resource } = await container.item(id, id).read<any>();
    if (!resource || resource.deleted || resource.owner !== req.user!.email) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const updated = {
      ...resource,
      ...(req.body.name !== undefined && { name: req.body.name }),
      ...(req.body.pinned !== undefined && { pinned: req.body.pinned }),
      ...(req.body.messages !== undefined && { messages: req.body.messages }),
      updatedAt: new Date().toISOString(),
    };
    await container.items.upsert(updated);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating chat session:', err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /:id — soft-delete a session
router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  try {
    const container = getContainer('chat-sessions');
    const { resource } = await container.item(id, id).read<any>();
    if (!resource || resource.owner !== req.user!.email) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await container.items.upsert({
      ...resource,
      deleted: true,
      deletedAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting chat session:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// POST /:id/chat — stream a chat message response
router.post('/:id/chat', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const messages: { role: 'user' | 'assistant'; content: string }[] = req.body.messages;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  try {
    const container = getContainer('chat-sessions');
    const { resource } = await container.item(id, id).read<any>();
    if (!resource || resource.deleted || resource.owner !== req.user!.email) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
  } catch {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const systemPrompt =
    'You are a helpful writing assistant. Help the author with their creative writing, worldbuilding, character development, plot structure, dialogue, and any other writing-related questions. Format responses using markdown where appropriate.';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await client.chat.completions.create({
      model: config.foundry.miniModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('Chat session streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: 'AI error occurred' })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /:id/name — ask the LLM to generate a session name, then persist it
router.post('/:id/name', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const messages: { role: 'user' | 'assistant'; content: string }[] = req.body.messages;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  let existingResource: any;
  try {
    const container = getContainer('chat-sessions');
    const { resource } = await container.item(id, id).read<any>();
    if (!resource || resource.deleted || resource.owner !== req.user!.email) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    existingResource = resource;
  } catch {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    const response = await client.chat.completions.create({
      model: config.foundry.miniModel,
      messages: [
        {
          role: 'system',
          content:
            'Generate a concise, descriptive title (3 to 6 words) for this conversation based on the user\'s first message. Return only the title text — no punctuation at the end, no quotes, no explanation.',
        },
        ...messages.slice(0, 2),
      ],
      stream: false,
    });

    const name = response.choices[0]?.message?.content?.trim() ?? 'New Chat';

    const container = getContainer('chat-sessions');
    await container.items.upsert({
      ...existingResource,
      name,
      updatedAt: new Date().toISOString(),
    });
    res.json({ name });
  } catch (err) {
    console.error('Error generating session name:', err);
    res.status(500).json({ error: 'Failed to generate name' });
  }
});

export default router;
