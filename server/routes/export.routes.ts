import { Router, Request, Response } from 'express';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
  ImageRun,
  AlignmentType,
} from 'docx';
import PDFDocument from 'pdfkit';
import { getContainer } from '../cosmos';
import { downloadBlob } from '../storage';
import { Book } from '../../shared/models/book.model';
import { Chapter } from '../../shared/models/chapter.model';
import { withOwnerFilter, readOwnedItem } from '../owner-guard';

const router = Router();
const booksContainer = getContainer('books');
const chaptersContainer = getContainer('chapters');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface FetchedBook {
  book: Book;
  chapters: Chapter[];
  imageBuffer: Buffer | null;
}

async function fetchBookData(bookId: string, userEmail: string): Promise<FetchedBook | null> {
  const book = await readOwnedItem<Book>(booksContainer, bookId, bookId, userEmail);
  if (!book) return null;

  const { resources: rawChapters } = await chaptersContainer.items
    .query(withOwnerFilter(userEmail, {
      query: 'SELECT * FROM c WHERE c.bookId = @bookId',
      parameters: [{ name: '@bookId', value: bookId }],
    }))
    .fetchAll();

  const chapters = (rawChapters as Chapter[]).sort(
    (a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity),
  );

  let imageBuffer: Buffer | null = null;
  if (book.originalUrl) {
    try {
      const filename = book.originalUrl.split('/').pop()!;
      const blob = await downloadBlob(filename);
      imageBuffer = blob.data;
    } catch (err) {
      console.error('Failed to fetch book cover image for export:', err);
    }
  }

  return { book, chapters, imageBuffer };
}

function safeFilename(title: string): string {
  return title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'book';
}

// ---------------------------------------------------------------------------
// Docx helpers
// ---------------------------------------------------------------------------

function parseRuns(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const normalised = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '<b>$1</b>')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '<i>$1</i>');

  const tokenRegex = /<(\/?)([bi])>|([^<]+)/gi;
  let isBold = false;
  let isItalic = false;
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(normalised)) !== null) {
    const [, closing, tag, text] = m;
    if (tag) {
      if (tag.toLowerCase() === 'b') isBold = !closing;
      if (tag.toLowerCase() === 'i') isItalic = !closing;
    } else if (text) {
      const clean = text.replace(/<[^>]+>/g, '');
      if (clean) {
        runs.push(new TextRun({ text: clean, bold: isBold, italics: isItalic }));
      }
    }
  }

  return runs;
}

function htmlToParagraphs(html: string): Paragraph[] {
  if (!html?.trim()) return [];

  const paragraphs: Paragraph[] = [];
  const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let hasParagraphs = false;
  let m: RegExpExecArray | null;

  while ((m = pTagRegex.exec(html)) !== null) {
    hasParagraphs = true;
    const runs = parseRuns(m[1]);
    paragraphs.push(new Paragraph({ children: runs.length ? runs : [new TextRun('')] }));
  }

  if (!hasParagraphs) {
    const stripped = html.replace(/<[^>]+>/g, '').trim();
    if (stripped) {
      paragraphs.push(new Paragraph({ children: [new TextRun(stripped)] }));
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// HTML helper
// ---------------------------------------------------------------------------

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function buildHtml(book: Book, chapters: Chapter[], imageProxyBase: string): string {
  const imageTag = book.thumnailUrl
    ? `<img src="${imageProxyBase}/${book.thumnailUrl.split('/').pop()}" alt="${book.title}" class="cover">`
    : '';

  const chapterHtml = chapters
    .map(
      (ch) => `
    <div class="chapter">
      <h1>${ch.title}</h1>
      <div class="chapter-content">${ch.content ?? ''}</div>
    </div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${book.title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #222; }
    .title-page { text-align: center; page-break-after: always; padding: 4rem 0; }
    .cover { max-width: 100%; max-height: 400px; object-fit: cover; border-radius: 4px; margin-bottom: 2rem; }
    h1.book-title { font-size: 2.5rem; margin: 1rem 0; }
    .chapter { page-break-before: always; }
    .chapter h1 { font-size: 1.8rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    p { line-height: 1.8; margin: 0 0 1rem; }
    @media print { .chapter { page-break-before: always; } }
  </style>
</head>
<body>
  <div class="title-page">
    ${imageTag}
    <h1 class="book-title">${book.title}</h1>
  </div>
  ${chapterHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/export/books/:bookId/docx
router.get('/books/:bookId/docx', async (req: Request, res: Response) => {
  try {
    const data = await fetchBookData(req.params['bookId'] as string, req.user!.email);
    if (!data) { res.status(404).json({ error: 'Book not found' }); return; }
    const { book, chapters, imageBuffer } = data;

    const titlePageChildren: Paragraph[] = [];
    titlePageChildren.push(new Paragraph({ children: [new TextRun({ text: '', break: 4 })] }));

    if (imageBuffer) {
      titlePageChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: { width: 420, height: 260 },
              type: 'jpg',
            } as any),
          ],
        }),
      );
      titlePageChildren.push(new Paragraph({ children: [new TextRun({ text: '', break: 2 })] }));
    }

    titlePageChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: book.title, bold: true, size: 72 })],
      }),
    );
    titlePageChildren.push(new Paragraph({ children: [new PageBreak()] }));

    const chapterChildren: Paragraph[] = [];
    chapters.forEach((chapter, index) => {
      chapterChildren.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1 }));
      chapterChildren.push(...htmlToParagraphs(chapter.content ?? ''));
      if (index < chapters.length - 1) {
        chapterChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const doc = new Document({ sections: [{ children: [...titlePageChildren, ...chapterChildren] }] });
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(book.title)}.docx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting book as docx:', err);
    res.status(500).json({ error: 'Failed to export book' });
  }
});

// GET /api/export/books/:bookId/html
router.get('/books/:bookId/html', async (req: Request, res: Response) => {
  try {
    const data = await fetchBookData(req.params['bookId'] as string, req.user!.email);
    if (!data) { res.status(404).json({ error: 'Book not found' }); return; }
    const { book, chapters } = data;

    const imageProxyBase = `${req.protocol}://${req.get('host') ?? 'localhost'}/api/image`;
    const html = buildHtml(book, chapters, imageProxyBase);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(book.title)}.html"`);
    res.send(html);
  } catch (err) {
    console.error('Error exporting book as html:', err);
    res.status(500).json({ error: 'Failed to export book' });
  }
});

// GET /api/export/books/:bookId/pdf
router.get('/books/:bookId/pdf', async (req: Request, res: Response) => {
  try {
    const data = await fetchBookData(req.params['bookId'] as string, req.user!.email);
    if (!data) { res.status(404).json({ error: 'Book not found' }); return; }
    const { book, chapters, imageBuffer } = data;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(book.title)}.pdf"`);

    const doc = new PDFDocument({ autoFirstPage: true, margin: 72 });
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 72;

    if (imageBuffer) {
      try {
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = Math.min(300, imgWidth * 0.6);
        doc.image(imageBuffer, margin, pageHeight * 0.2, {
          width: imgWidth,
          height: imgHeight,
          fit: [imgWidth, imgHeight],
          align: 'center',
        });
        doc.moveDown(14);
      } catch {
        doc.moveDown(10);
      }
    } else {
      doc.moveDown(10);
    }

    doc.fontSize(32).font('Helvetica-Bold').text(book.title, { align: 'center' });

    chapters.forEach((chapter) => {
      doc.addPage();
      doc.fontSize(22).font('Helvetica-Bold').text(chapter.title);
      doc.moveDown();
      doc.fontSize(12).font('Helvetica');

      if (chapter.content?.trim()) {
        const pTagRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let m: RegExpExecArray | null;
        let hasParagraphs = false;

        while ((m = pTagRegex.exec(chapter.content)) !== null) {
          hasParagraphs = true;
          const text = stripHtmlTags(m[1]).trim();
          if (text) {
            doc.text(text, { align: 'justify', lineGap: 4 });
            doc.moveDown(0.5);
          }
        }

        if (!hasParagraphs) {
          const text = stripHtmlTags(chapter.content).trim();
          if (text) doc.text(text, { align: 'justify', lineGap: 4 });
        }
      }
    });

    doc.end();
  } catch (err) {
    console.error('Error exporting book as pdf:', err);
    res.status(500).json({ error: 'Failed to export book' });
  }
});

export default router;
