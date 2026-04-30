import { Router, Request, Response } from 'express';
import { getContainer } from '../cosmos';

const router = Router();

/**
 * POST /api/backfill/series
 *
 * Ties all existing chat-sessions, chat-folders, and chat-folder-files that
 * have no seriesId to the first (and only) series owned by the requesting user.
 * Safe to call multiple times — already-tagged records are skipped.
 */
router.post('/series', async (req: Request, res: Response) => {
  const owner = req.user!.email;
  try {
    // Find the user's series
    const seriesContainer = getContainer('series');
    const { resources: allSeries } = await seriesContainer.items
      .query({
        query: `SELECT c.id FROM c WHERE c.owner = @owner
                  AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
                  AND (NOT IS_DEFINED(c.archived) OR c.archived = false)`,
        parameters: [{ name: '@owner', value: owner }],
      })
      .fetchAll();

    if (allSeries.length === 0) {
      res.status(404).json({ error: 'No series found for this user' });
      return;
    }
    if (allSeries.length > 1) {
      res.status(400).json({
        error: 'Multiple series found — specify the target seriesId explicitly',
        seriesIds: allSeries.map((s: any) => s.id),
      });
      return;
    }

    const seriesId = allSeries[0].id;
    const counts = { sessions: 0, folders: 0, files: 0 };

    // Backfill chat-sessions
    const sessionsContainer = getContainer('chat-sessions');
    const { resources: sessions } = await sessionsContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.owner = @owner
                  AND (NOT IS_DEFINED(c.seriesId) OR c.seriesId = null)`,
        parameters: [{ name: '@owner', value: owner }],
      })
      .fetchAll();
    for (const s of sessions) {
      await sessionsContainer.items.upsert({ ...s, seriesId });
      counts.sessions++;
    }

    // Backfill chat-folders
    const foldersContainer = getContainer('chat-folders');
    const { resources: folders } = await foldersContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.owner = @owner
                  AND (NOT IS_DEFINED(c.seriesId) OR c.seriesId = null)`,
        parameters: [{ name: '@owner', value: owner }],
      })
      .fetchAll();
    for (const f of folders) {
      await foldersContainer.items.upsert({ ...f, seriesId });
      counts.folders++;
    }

    // Backfill chat-folder-files
    const filesContainer = getContainer('chat-folder-files');
    const { resources: files } = await filesContainer.items
      .query({
        query: `SELECT * FROM c WHERE c.owner = @owner
                  AND (NOT IS_DEFINED(c.deleted) OR c.deleted = false)
                  AND (NOT IS_DEFINED(c.seriesId) OR c.seriesId = null)`,
        parameters: [{ name: '@owner', value: owner }],
      })
      .fetchAll();
    for (const file of files) {
      await filesContainer.items.upsert({ ...file, seriesId });
      counts.files++;
    }

    res.json({ ok: true, seriesId, updated: counts });
  } catch (err) {
    console.error('Backfill error:', err);
    res.status(500).json({ error: 'Backfill failed' });
  }
});

export default router;
