import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import config from '../config';
import { getContainer } from '../cosmos';
import { Chapter } from '../../shared/models/chapter.model';
import { Book } from '../../shared/models/book.model';
import { Entity } from '../../shared/models/entity.model';

const router = Router();

const client = new AzureOpenAI({
  endpoint: config.foundry.endpoint,
  apiKey: config.foundry.key,
  apiVersion: '2024-10-21',
});

// GET chat history for a chapter (returns empty if soft-deleted or not owned)
router.get('/:chapterId/history', async (req: Request, res: Response) => {
  const chapterId = req.params['chapterId'] as string;
  try {
    const container = getContainer('chat-history');
    const { resource } = await container.item(chapterId, chapterId).read<{ id: string; owner?: string; deleted?: boolean; messages: { role: string; text: string }[] }>();
    if (!resource || resource.deleted || resource.owner !== req.user!.email) {
      res.json({ messages: [] });
      return;
    }
    res.json({ messages: resource.messages });
  } catch {
    res.json({ messages: [] });
  }
});

// PUT (upsert) chat history for a chapter
router.put('/:chapterId/history', async (req: Request, res: Response) => {
  const chapterId = req.params['chapterId'] as string;
  const messages: { role: string; text: string }[] = req.body.messages;
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }
  try {
    const container = getContainer('chat-history');
    await container.items.upsert({ id: chapterId, owner: req.user!.email, messages, deleted: false });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error saving chat history:', err);
    res.status(500).json({ error: 'Failed to save chat history' });
  }
});

// DELETE chat history for a chapter (soft delete — sets deleted: true)
router.delete('/:chapterId/history', async (req: Request, res: Response) => {
  const chapterId = req.params['chapterId'] as string;
  try {
    const container = getContainer('chat-history');
    await container.items.upsert({ id: chapterId, owner: req.user!.email, messages: [], deleted: true, deletedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error soft-deleting chat history:', err);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

router.post('/:chapterId', async (req: Request, res: Response) => {
  const chapterId = req.params['chapterId'] as string;
  const messages: { role: 'user' | 'assistant'; content: string }[] = req.body.messages;
  const selectedText: string | undefined = req.body.selectedText;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  // Fetch chapter for context
  let systemPrompt = 'You are a helpful writing assistant helping an author with their story.';
  try {
    const container = getContainer('chapters');
    const { resource } = await container.item(chapterId, chapterId).read<Chapter>();
    if (resource) {
      const plainText = (resource.content ?? '').replace(/<[^>]+>/g, '').trim();
      systemPrompt =
        `You are a helpful writing assistant helping an author with their story chapter titled "${resource.title}".` +
        (plainText
          ? `\n\nHere is the current chapter content:\n\n${plainText}`
          : '');

      // When rewording selected text, find the speaker and use their personality profile
      if (selectedText) {
        const speakerPersonality = await findSpeakerPersonality(resource, selectedText);
        if (speakerPersonality) {
          systemPrompt += `\n\n${speakerPersonality}`;
          // If the user sent no reword instructions, inject a default directive
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'user' && lastMessage.content.trim() === `Selected text:\n"${selectedText}"`) {
            lastMessage.content += '\n\nReword this text in the character\'s authentic voice. Return only the reworded text, no explanation.';
          }
        }
      }
    }
  } catch {
    // Proceed without chapter context
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = await client.chat.completions.create({
      model: config.foundry.miniModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
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
    console.error('Chat streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: 'AI error occurred' })}\n\n`);
  } finally {
    res.end();
  }
});

async function findSpeakerPersonality(chapter: Chapter, selectedText: string): Promise<string | null> {
  try {
    // Get the book to find the seriesId
    const booksContainer = getContainer('books');
    const { resource: book } = await booksContainer.item(chapter.bookId, chapter.bookId).read<Book>();
    if (!book?.seriesId) return null;

    // Get all PERSON entities with personalities for this series
    const entitiesContainer = getContainer('entities');
    const { resources } = await entitiesContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.seriesId = @seriesId AND c.type = @type',
        parameters: [
          { name: '@seriesId', value: book.seriesId },
          { name: '@type', value: 'PERSON' },
        ],
      })
      .fetchAll();

    const persons = (resources as Entity[]).filter(e => e.personality);
    if (persons.length === 0) return null;

    // Find the selected text within the chapter and get surrounding context
    const plainText = (chapter.content ?? '').replace(/<[^>]+>/g, '');
    const selIdx = plainText.indexOf(selectedText);
    const contextStart = Math.max(0, (selIdx >= 0 ? selIdx : 0) - 400);
    const contextEnd = Math.min(plainText.length, (selIdx >= 0 ? selIdx : 0) + selectedText.length + 400);
    const context = plainText.slice(contextStart, contextEnd).toLowerCase();

    // Find the first entity whose name appears in the surrounding context
    for (const entity of persons) {
      const names = [entity.name, entity.firstName, entity.lastName, entity.nickname].filter(Boolean) as string[];
      if (names.some(n => context.includes(n.toLowerCase()))) {
        return (
          `The selected text is spoken by the character "${entity.name}". ` +
          `Use the following personality profile to ensure the reworded dialogue stays true to their voice:\n\n${entity.personality}`
        );
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default router;
