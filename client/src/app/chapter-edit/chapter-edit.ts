import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ChapterService } from '../chapter/chapter.service';
import { ChapterDraftService } from './chapter-draft.service';
import { Chapter } from '@shared/models/chapter.model';
import { Entity } from '@shared/models/entity.model';
import { EntityService } from '../entity/entity.service';
import { BookService } from '../book/book.service';

@Component({
  selector: 'app-chapter-edit',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './chapter-edit.html',
  styleUrl: './chapter-edit.css',
})
export class ChapterEditComponent implements OnInit, OnDestroy {
  @ViewChild('contentEditor') contentEditorRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chapterService = inject(ChapterService);
  private draftService = inject(ChapterDraftService);
  private entityService = inject(EntityService);
  private bookService = inject(BookService);

  chapter = signal<Chapter | null>(null);
  saving = signal(false);
  hasDraft = signal(false);
  chatMessages = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
  chatInput = signal('');
  entities = signal<Entity[]>([]);

  // Autocomplete
  autocompleteItems = signal<Entity[]>([]);
  autocompleteIndex = signal(0);
  autocompleteTop = signal(0);
  autocompleteLeft = signal(0);
  private currentWordRange: Range | null = null;

  // Hover popup
  hoveredEntity = signal<Entity | null>(null);
  popupTop = signal(0);
  popupLeft = signal(0);

  /** Tracks latest editor content without writing back to the DOM */
  private editorContent = '';
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.chapterService.getById(id).subscribe({
      next: async (data) => {
        const draft = await this.draftService.getDraft(data.id);
        const content = (draft !== null && draft !== data.content) ? draft : (data.content ?? '');
        if (draft !== null && draft !== data.content) {
          this.hasDraft.set(true);
        }
        this.chapter.set({ ...data, content });
        this.editorContent = content;
        // Set DOM content imperatively so the cursor is never disrupted
        setTimeout(() => {
          if (this.contentEditorRef) {
            this.contentEditorRef.nativeElement.innerHTML = content;
          }
        });

        // Load entities for this book's series
        this.bookService.getById(data.bookId).subscribe({
          next: (book) => {
            this.entityService.getBySeries(book.seriesId).subscribe({
              next: (entities) => this.entities.set(entities),
            });
          },
        });
      },
    });
  }

  ngOnDestroy(): void {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
  }

  updateTitle(value: string): void {
    const current = this.chapter();
    if (current) {
      this.chapter.set({ ...current, title: value });
    }
  }

  onContentInput(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.editorContent = el.innerHTML;
    const current = this.chapter();
    if (!current) return;

    this.checkAutocomplete();

    // Do NOT update the signal here — that would re-set [innerHTML] and move the cursor
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.draftService.saveDraft(current.id, this.editorContent);
      this.hasDraft.set(true);
    }, 800);
  }

  onEditorKeyDown(event: KeyboardEvent): void {
    const items = this.autocompleteItems();
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.autocompleteIndex.set(Math.min(this.autocompleteIndex() + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.autocompleteIndex.set(Math.max(this.autocompleteIndex() - 1, 0));
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.selectAutocomplete(items[this.autocompleteIndex()]);
    } else if (event.key === 'Escape') {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
    }
  }

  selectAutocomplete(entity: Entity): void {
    if (!this.currentWordRange) return;
    const range = this.currentWordRange;
    this.currentWordRange = null;
    this.autocompleteItems.set([]);

    range.deleteContents();

    const span = document.createElement('span');
    span.setAttribute('data-id', entity.id);
    span.className = 'entity-reference';
    span.textContent = entity.name;
    range.insertNode(span);

    const space = document.createTextNode('\u00A0');
    span.after(space);

    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    if (this.contentEditorRef) {
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
      const current = this.chapter();
      if (current) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.draftService.saveDraft(current.id, this.editorContent);
          this.hasDraft.set(true);
        }, 800);
      }
    }
  }

  onEditorMouseMove(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('entity-reference')) {
      const entityId = target.getAttribute('data-id');
      if (entityId && this.hoveredEntity()?.id !== entityId) {
        const entity = this.entities().find(e => e.id === entityId);
        if (entity) {
          const rect = target.getBoundingClientRect();
          this.popupTop.set(rect.bottom + 6);
          this.popupLeft.set(rect.left);
          this.hoveredEntity.set(entity);
        }
      }
    } else if (this.hoveredEntity() !== null) {
      this.hoveredEntity.set(null);
    }
  }

  onEditorMouseLeave(): void {
    this.hoveredEntity.set(null);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.autocomplete-dropdown')) {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
    }
  }

  private checkAutocomplete(): void {
    const result = this.getCurrentWordAtCursor();
    if (!result || result.word.length < 2) {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
      return;
    }

    const lower = result.word.toLowerCase();
    const matches = this.entities().filter(e => e.name.toLowerCase().includes(lower));

    if (matches.length === 0) {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
      return;
    }

    this.currentWordRange = result.range;
    this.autocompleteIndex.set(0);
    this.autocompleteItems.set(matches);

    const rect = this.getCursorRect();
    if (rect) {
      this.autocompleteTop.set(rect.bottom + 4);
      this.autocompleteLeft.set(rect.left);
    }
  }

  private getCurrentWordAtCursor(): { word: string; range: Range } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    const container = range.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) return null;

    const text = container.textContent ?? '';
    const offset = range.startOffset;

    let start = offset;
    while (start > 0 && !/[\s\n]/.test(text[start - 1])) {
      start--;
    }

    const word = text.substring(start, offset);
    if (!word) return null;

    const wordRange = range.cloneRange();
    wordRange.setStart(container, start);
    wordRange.setEnd(container, offset);
    return { word, range: wordRange };
  }

  private getCursorRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    return range.getBoundingClientRect();
  }

  async save(): Promise<void> {
    const chapter = this.chapter();
    if (!chapter || !chapter.title.trim()) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    this.saving.set(true);
    const toSave = { ...chapter, content: this.editorContent };
    this.chapterService.update(toSave).subscribe({
      next: async () => {
        await this.draftService.clearDraft(chapter.id);
        this.hasDraft.set(false);
        this.saving.set(false);
        this.goBack();
      },
      error: () => this.saving.set(false),
    });
  }

  discardDraft(): void {
    const chapter = this.chapter();
    if (!chapter) return;
    this.draftService.clearDraft(chapter.id);
    this.hasDraft.set(false);
    // Reload from server
    this.chapterService.getById(chapter.id).subscribe({
      next: (data) => {
        this.chapter.set(data);
        if (this.contentEditorRef) {
          this.contentEditorRef.nativeElement.innerHTML = data.content ?? '';
        }
      },
    });
  }

  goBack(): void {
    const chapter = this.chapter();
    if (chapter?.bookId) {
      this.router.navigate(['/books', chapter.bookId]);
    } else {
      this.router.navigate(['/series']);
    }
  }

  proxyUrl(azureUrl: string | undefined): string | null {
    if (!azureUrl) return null;
    const filename = azureUrl.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }
}
