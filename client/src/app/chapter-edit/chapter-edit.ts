import { Component, inject, signal, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { parse as parseMarkdown } from 'marked';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChapterService } from '../chapter/chapter.service';
import { ChapterDraftService } from './chapter-draft.service';
import { ChapterVersionService } from './chapter-version.service';
import { Chapter, ChapterNote, ChapterVersion } from '@shared/models/chapter.model';
import { Entity } from '@shared/models/entity.model';
import { BookService } from '../book/book.service';
import { EntityService } from '../services/entity.service';
import { SeriesService } from '../series/series.service';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';
import { EntityEditComponent } from '../entity-edit/entity-edit';
import { HeaderService } from '../services/header.service';
import { EntityPanelService } from '../services/entity-panel.service';

@Component({
  selector: 'app-chapter-edit',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    SlideOutPanelContainer,
    EntityEditComponent,
  ],
  templateUrl: './chapter-edit.html',
  styleUrl: './chapter-edit.css',
})
export class ChapterEditComponent implements OnInit, OnDestroy {
  @ViewChild('contentEditor') contentEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('chatMessagesEl') chatMessagesEl!: ElementRef<HTMLDivElement>;
  @ViewChild('inlineAiInputEl') inlineAiInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('noteInputEl') noteInputEl!: ElementRef<HTMLTextAreaElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private chapterService = inject(ChapterService);
  private draftService = inject(ChapterDraftService);
  private chapterVersionService = inject(ChapterVersionService);
  private entityService = inject(EntityService);
  private bookService = inject(BookService);
  private seriesService = inject(SeriesService);
  private snackBar = inject(MatSnackBar);
  private headerService = inject(HeaderService);
  private entityPanel = inject(EntityPanelService);

  chapter = signal<Chapter | null>(null);
  saving = signal(false);
  hasDraft = signal(false);
  chatMessages = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
  chatInput = signal('');
  chatStreaming = signal(false);
  entities = signal<Entity[]>([]);

  // Autocomplete
  autocompleteItems = signal<{ entity: Entity; text: string; isPreferred: boolean }[]>([]);
  autocompleteIndex = signal(0);
  autocompleteTop = signal(0);
  autocompleteLeft = signal(0);
  private currentWordRange: Range | null = null;

  // Formatting toolbar
  formattingToolbarVisible = signal(false);
  formattingToolbarTop = signal(0);
  formattingToolbarLeft = signal(0);
  formattingState = signal({ bold: false, italic: false, underline: false });

  // Hover popup
  hoveredEntity = signal<Entity | null>(null);
  popupTop = signal(0);
  popupLeft = signal(0);
  private popupHideTimer: ReturnType<typeof setTimeout> | null = null;
  private popupShowTimer: ReturnType<typeof setTimeout> | null = null;

  // Entity editing slide-out
  editingEntity = signal<Entity | null>(null);

  // Notes
  notes = signal<ChapterNote[]>([]);
  notesListVisible = signal(false);
  noteInputVisible = signal(false);
  noteInputTop = signal(0);
  noteInputLeft = signal(0);
  noteInputText = signal('');
  highlightedNoteId = signal<string | null>(null);

  // Version history
  historyVisible = signal(false);
  historyLoading = signal(false);
  historyVersions = signal<ChapterVersion[]>([]);
  selectedVersion = signal<ChapterVersion | null>(null);
  diffLines = signal<{ type: 'same' | 'add' | 'remove'; text: string }[]>([]);

  // Inline AI prompt (Ctrl+.)
  inlineAiVisible = signal(false);
  inlineAiTop = signal(0);
  inlineAiLeft = signal(0);
  inlineAiInput = signal('');
  inlineAiResponse = signal('');
  inlineAiStreaming = signal(false);
  inlineAiSelectedText = signal('');
  private inlineAiCursorRange: Range | null = null;
  private inlineAiCharBefore = '';
  private inlineAiCharAfter = '';
  private inlineAiAbortController: AbortController | null = null;
  private noteSelectionRange: Range | null = null;

  /** Tracks latest editor content without writing back to the DOM */
  private editorContent = '';
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private chatAbortController: AbortController | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.chapterService.getById(id).subscribe({
      next: async (data) => {
        const draft = await this.draftService.getDraft(data.id);
        const hasDraft = draft !== null && draft.content !== (data.content ?? '');
        const content = hasDraft ? draft!.content : (data.content ?? '');
        const notes = hasDraft ? draft!.notes : (data.notes ?? []);
        if (hasDraft) {
          this.hasDraft.set(true);
        }
        this.chapter.set({ ...data, content });
        this.editorContent = content;
        this.notes.set(notes);
        // Set DOM content imperatively so the cursor is never disrupted
        setTimeout(() => {
          if (this.contentEditorRef) {
            this.contentEditorRef.nativeElement.innerHTML = content;
          }
        });

        // Load chat history
        this.loadChatHistory(data.id);

        // Load entities + register header breadcrumbs
        this.bookService.getById(data.bookId).subscribe({
          next: (book) => {
            this.seriesService.getById(book.seriesId).subscribe({
              next: (series) => {
                this.headerService.set(
                  [
                    { label: series.title, link: '/series/' + series.id },
                    { label: book.title, link: '/books/' + book.id },
                    { label: data.title || 'Chapter' },
                  ],
                  [{ icon: 'people', label: 'Entities', action: () => this.entityPanel.open(series.id) }]
                );
              },
            });
            this.entityService.getBySeries(book.seriesId).subscribe({
              next: (entities) => this.entities.set(entities),
            });
          },
        });
      },
    });
  }

  ngOnDestroy(): void {
    this.headerService.clear();
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    if (this.popupHideTimer) clearTimeout(this.popupHideTimer);
    this.chatAbortController?.abort();
    this.inlineAiAbortController?.abort();
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

    // Remove trailing \u00A0 after an entity-reference span when punctuation is typed
    const inputData = (event as InputEvent).data;
    if (inputData && /^[.,!?;:)'""\u2019\u201d]$/.test(inputData)) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const { startContainer, startOffset } = sel.getRangeAt(0);
        if (startContainer.nodeType === Node.TEXT_NODE) {
          const textNode = startContainer as Text;
          const text = textNode.textContent ?? '';
          const punctPos = startOffset - 1;

          // Case A: \u00A0 is in this same text node just before the punctuation
          if (punctPos >= 1 && text[punctPos - 1] === '\u00A0') {
            const prevSib = textNode.previousSibling as HTMLElement | null;
            if (prevSib?.classList?.contains('entity-reference')) {
              textNode.textContent = text.slice(0, punctPos - 1) + text.slice(punctPos);
              const newRange = document.createRange();
              newRange.setStart(textNode, punctPos); // after punctuation (shifted left by 1)
              newRange.collapse(true);
              sel.removeAllRanges();
              sel.addRange(newRange);
              this.editorContent = el.innerHTML;
            }
          } else {
            // Case B: punctuation is the first char in this text node; \u00A0 is a sibling text node
            const prev = textNode.previousSibling;
            if (
              prev?.nodeType === Node.TEXT_NODE &&
              (prev as Text).textContent?.endsWith('\u00A0') &&
              prev.previousSibling?.nodeType === Node.ELEMENT_NODE &&
              (prev.previousSibling as HTMLElement).classList.contains('entity-reference')
            ) {
              const prevText = prev as Text;
              if (prevText.textContent === '\u00A0') {
                prevText.remove();
              } else {
                // trim only the trailing \u00A0
                prevText.textContent = prevText.textContent!.slice(0, -1);
              }
              this.editorContent = el.innerHTML;
            }
          }
        }
      }
    }

    this.checkAutocomplete();

    // Do NOT update the signal here — that would re-set [innerHTML] and move the cursor
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.draftService.saveDraft(current.id, this.editorContent, this.notes());
      this.hasDraft.set(true);
    }, 800);
  }

  onEditorKeyDown(event: KeyboardEvent): void {
    // Ctrl+. opens inline AI prompt
    if (event.ctrlKey && event.key === '.') {
      event.preventDefault();
      this.openInlineAiPrompt();
      return;
    }

    // Eject cursor from entity-reference span when typing a printable character
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const { startContainer } = sel.getRangeAt(0);
        const node = startContainer.nodeType === Node.TEXT_NODE
          ? startContainer.parentElement
          : startContainer as HTMLElement;
        if (node?.classList.contains('entity-reference')) {
          event.preventDefault();
          const textNode = document.createTextNode(event.key);
          node.after(textNode);
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          if (this.contentEditorRef) {
            this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
            const current = this.chapter();
            if (current) {
              if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
              this.autoSaveTimer = setTimeout(() => {
                this.draftService.saveDraft(current.id, this.editorContent, this.notes());
                this.hasDraft.set(true);
              }, 800);
            }
          }
          this.checkAutocomplete();
          return;
        }
      }
    }

    // Delete entire entity-reference span on Backspace
    if (event.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const { startContainer, startOffset } = range;
        let spanToDelete: HTMLElement | null = null;

        // Case 1: cursor is inside the span (anywhere within its text)
        const node = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentElement : startContainer as HTMLElement;
        if (node?.classList.contains('entity-reference')) {
          spanToDelete = node;
        }

        // Case 2: cursor is just after the span (text node at offset 0, previous sibling is a span)
        if (!spanToDelete && startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
          const prev = startContainer.previousSibling;
          if (prev instanceof HTMLElement && prev.classList.contains('entity-reference')) {
            spanToDelete = prev;
          }
        }

        // Case 3: cursor is at element level, previous child is a span
        if (!spanToDelete && startContainer.nodeType === Node.ELEMENT_NODE && startOffset > 0) {
          const prevNode = (startContainer as Element).childNodes[startOffset - 1];
          if (prevNode instanceof HTMLElement && prevNode.classList.contains('entity-reference')) {
            spanToDelete = prevNode;
          }
        }

        if (spanToDelete) {
          event.preventDefault();
          const newRange = document.createRange();
          newRange.setStartBefore(spanToDelete);
          newRange.collapse(true);
          spanToDelete.remove();
          sel.removeAllRanges();
          sel.addRange(newRange);
          if (this.contentEditorRef) {
            this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
            const current = this.chapter();
            if (current) {
              if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
              this.autoSaveTimer = setTimeout(() => {
                this.draftService.saveDraft(current.id, this.editorContent, this.notes());
              }, 1000);
              this.hasDraft.set(true);
            }
          }
          return;
        }
      }
    }

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
      const item = items[this.autocompleteIndex()];
      this.selectAutocomplete(item.entity, item.text);
    } else if (event.key === 'Escape') {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
    }
  }

  selectAutocomplete(entity: Entity, text: string): void {
    if (!this.currentWordRange) return;
    const range = this.currentWordRange;
    this.currentWordRange = null;
    this.autocompleteItems.set([]);

    range.deleteContents();

    const span = document.createElement('span');
    span.setAttribute('data-id', entity.id);
    span.className = 'entity-reference';
    span.textContent = text;
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
          this.draftService.saveDraft(current.id, this.editorContent, this.notes());
          this.hasDraft.set(true);
        }, 800);
      }
    }
  }

  onEditorMouseUp(): void {
    // Defer so the selection is finalized before we read it
    setTimeout(() => this.updateFormattingToolbar());
  }

  private updateFormattingToolbar(): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
      this.formattingToolbarVisible.set(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width) {
      this.formattingToolbarVisible.set(false);
      return;
    }

    const toolbarWidth = 188; // 5 buttons + 2 separators
    const left = rect.left + rect.width / 2 - toolbarWidth / 2;
    this.formattingToolbarTop.set(rect.top - 44);
    this.formattingToolbarLeft.set(Math.max(8, left));
    this.formattingState.set({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
    this.formattingToolbarVisible.set(true);
  }

  applyFormat(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList'): void {
    // execCommand keeps the selection and operates on the contenteditable
    document.execCommand(command, false);
    // Update the stored content after the DOM changes
    if (this.contentEditorRef) {
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
      const current = this.chapter();
      if (current) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.draftService.saveDraft(current.id, this.editorContent, this.notes());
          this.hasDraft.set(true);
        }, 800);
      }
    }
    // Refresh active-state indicators
    this.formattingState.set({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  }

  onEditorMouseMove(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('entity-reference')) {
      const entityId = target.getAttribute('data-id');
      // Cancel any pending hide when moving back over a reference
      if (this.popupHideTimer) {
        clearTimeout(this.popupHideTimer);
        this.popupHideTimer = null;
      }
      if (entityId && this.hoveredEntity()?.id !== entityId) {
        const entity = this.entities().find(e => e.id === entityId);
        if (entity) {
          const rect = target.getBoundingClientRect();
          if (this.popupShowTimer) clearTimeout(this.popupShowTimer);
          this.popupShowTimer = setTimeout(() => {
            this.popupTop.set(rect.bottom + 6);
            this.popupLeft.set(rect.left);
            this.hoveredEntity.set(entity);
            this.popupShowTimer = null;
          }, 200);
        }
      }
    } else if (this.hoveredEntity() !== null || this.popupShowTimer) {
      if (this.popupShowTimer) {
        clearTimeout(this.popupShowTimer);
        this.popupShowTimer = null;
      }
      this.scheduleHidePopup();
    }
  }

  onEditorMouseLeave(): void {
    this.scheduleHidePopup();
  }

  onPopupMouseEnter(): void {
    if (this.popupHideTimer) {
      clearTimeout(this.popupHideTimer);
      this.popupHideTimer = null;
    }
  }

  onPopupMouseLeave(): void {
    this.scheduleHidePopup();
  }

  private scheduleHidePopup(): void {
    if (this.popupHideTimer) clearTimeout(this.popupHideTimer);
    this.popupHideTimer = setTimeout(() => {
      this.hoveredEntity.set(null);
      this.popupHideTimer = null;
    }, 150);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.autocomplete-dropdown')) {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
    }
    if (!target.closest('.formatting-toolbar')) {
      this.formattingToolbarVisible.set(false);
    }
    if (this.inlineAiVisible() && !target.closest('.inline-ai-prompt')) {
      this.dismissInlineAiPrompt();
    }
    if (this.noteInputVisible() && !target.closest('.note-input-popup')) {
      this.dismissNoteInput();
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
    const flat: { entity: Entity; text: string; isPreferred: boolean }[] = [];

    for (const entity of this.entities()) {
      if (!this.entityMatchesWord(entity, lower)) continue;
      const preferred = this.getPreferredText(entity);
      const seen = new Set<string>([preferred]);
      flat.push({ entity, text: preferred, isPreferred: true });
      for (const v of this.allRefsFor(entity)) {
        if (!seen.has(v)) {
          seen.add(v);
          flat.push({ entity, text: v, isPreferred: false });
        }
      }
    }

    if (flat.length === 0) {
      this.autocompleteItems.set([]);
      this.currentWordRange = null;
      return;
    }

    this.currentWordRange = result.range;
    this.autocompleteIndex.set(0);
    this.autocompleteItems.set(flat);

    const rect = this.getCursorRect();
    if (rect) {
      this.autocompleteTop.set(rect.bottom + 4);
      this.autocompleteLeft.set(rect.left);
    }
  }

  private entityMatchesWord(entity: Entity, lower: string): boolean {
    return this.allRefsFor(entity).some(v => v.toLowerCase().includes(lower));
  }

  private getPreferredText(entity: Entity): string {
    const refs = this.resolvedRefs(entity);
    switch (entity.preferredReference) {
      case 'first-name': return refs.firstName || entity.name;
      case 'last-name': return refs.lastName || entity.name;
      case 'nickname': return refs.nickname || entity.name;
      default: return entity.name;
    }
  }

  /** Returns stored name fields, falling back to parsing entity.name for PERSON entities. */
  private resolvedRefs(entity: Entity): { firstName?: string; lastName?: string; nickname?: string } {
    if (entity.type !== 'PERSON') return {};
    const parts = entity.name.trim().split(/\s+/);
    return {
      firstName: entity.firstName || (parts.length >= 2 ? parts[0] : undefined),
      lastName: entity.lastName || (parts.length >= 2 ? parts[parts.length - 1] : undefined),
      nickname: entity.nickname,
    };
  }

  private allRefsFor(entity: Entity): string[] {
    const refs = this.resolvedRefs(entity);
    return [entity.name, refs.firstName, refs.lastName, refs.nickname].filter((v): v is string => !!v);
  }

  private getAlternativeRefs(entity: Entity): string[] {
    const preferred = this.getPreferredText(entity);
    const seen = new Set<string>([preferred]);
    const alts: string[] = [];
    for (const v of this.allRefsFor(entity)) {
      if (!seen.has(v)) {
        seen.add(v);
        alts.push(v);
      }
    }
    return alts;
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
    const toSave = { ...chapter, content: this.editorContent, notes: this.notes() };
    this.chapterService.update(toSave).subscribe({
      next: async () => {
        // Snapshot this version to history
        this.chapterVersionService.create(chapter.id, this.editorContent).subscribe();
        if (this.historyVisible()) {
          this.loadHistory(chapter.id);
        }
        await this.draftService.clearDraft(chapter.id);
        this.hasDraft.set(false);
        this.saving.set(false);
        this.snackBar.open('Chapter saved', undefined, { duration: 3000 });
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
        this.notes.set(data.notes ?? []);
        if (this.contentEditorRef) {
          this.contentEditorRef.nativeElement.innerHTML = data.content ?? '';
        }
      },
    });
  }

  openEntityEdit(entity: Entity): void {
    this.hoveredEntity.set(null);
    this.editingEntity.set(entity);
  }

  saveEntityEdit(entity: Entity): void {
    this.entityService.update(entity).subscribe({
      next: (updated) => {
        this.entities.update(list => list.map(e => e.id === updated.id ? updated : e));
        this.editingEntity.set(null);
      },
    });
  }

  cancelEntityEdit(): void {
    this.editingEntity.set(null);
  }

  toggleHistory(): void {
    const chapter = this.chapter();
    if (!chapter) return;
    if (this.historyVisible()) {
      this.historyVisible.set(false);
      return;
    }
    this.historyVisible.set(true);
    this.loadHistory(chapter.id);
  }

  loadHistory(chapterId: string): void {
    this.historyLoading.set(true);
    this.chapterVersionService.getByChapter(chapterId).subscribe({
      next: (versions) => {
        this.historyVersions.set(versions);
        this.historyLoading.set(false);
      },
      error: () => this.historyLoading.set(false),
    });
  }

  selectVersion(version: ChapterVersion): void {
    this.selectedVersion.set(version);
    const oldText = this.stripHtml(version.content);
    const newText = this.stripHtml(this.editorContent);
    this.diffLines.set(this.computeDiff(oldText, newText));
  }

  formatVersionDate(savedAt: string): string {
    return new Date(savedAt).toLocaleString();
  }

  get historyPanelWidth(): number {
    return typeof window !== 'undefined' ? window.innerWidth : 1200;
  }

  private stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.innerText || div.textContent || '').trim();
  }

  private computeDiff(
    oldText: string,
    newText: string,
  ): { type: 'same' | 'add' | 'remove'; text: string }[] {
    const a = oldText.split('\n');
    const b = newText.split('\n');
    const m = a.length;
    const n = b.length;

    // LCS DP table (bottom-up)
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] =
          a[i] === b[j]
            ? 1 + dp[i + 1][j + 1]
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    // Backtrack to produce diff
    const result: { type: 'same' | 'add' | 'remove'; text: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        result.push({ type: 'same', text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        result.push({ type: 'remove', text: a[i] });
        i++;
      } else {
        result.push({ type: 'add', text: b[j] });
        j++;
      }
    }
    while (i < m) result.push({ type: 'remove', text: a[i++] });
    while (j < n) result.push({ type: 'add', text: b[j++] });
    return result;
  }

  openInlineAiPrompt(): void {
    const rect = this.getCursorRect();
    const sel = window.getSelection();
    this.inlineAiCharBefore = '';
    this.inlineAiCharAfter = '';
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      this.inlineAiCursorRange = r.cloneRange();
      this.inlineAiSelectedText.set(sel.toString());
      // Record the characters immediately surrounding the selection so we can
      // strip AI-added quotes if the selection is already inside quotes.
      const sc = r.startContainer;
      if (sc.nodeType === Node.TEXT_NODE && r.startOffset > 0) {
        this.inlineAiCharBefore = (sc.textContent ?? '')[r.startOffset - 1] ?? '';
      }
      const ec = r.endContainer;
      if (ec.nodeType === Node.TEXT_NODE) {
        this.inlineAiCharAfter = (ec.textContent ?? '')[r.endOffset] ?? '';
      }
    } else {
      this.inlineAiCursorRange = null;
      this.inlineAiSelectedText.set('');
    }

    const PANEL_WIDTH = 388;
    const top = rect ? rect.bottom + 10 : 200;
    const left = rect
      ? Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
      : 200;

    this.inlineAiTop.set(top);
    this.inlineAiLeft.set(left);
    this.inlineAiInput.set('');
    this.inlineAiResponse.set('');
    this.inlineAiVisible.set(true);

    setTimeout(() => this.inlineAiInputEl?.nativeElement?.focus());
  }

  onInlineAiKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submitInlineAiPrompt();
    } else if (event.key === 'Escape') {
      this.dismissInlineAiPrompt();
    }
  }

  async submitInlineAiPrompt(): Promise<void> {
    const text = this.inlineAiInput().trim();
    const selectedText = this.inlineAiSelectedText();
    if ((!text && !selectedText) || this.inlineAiStreaming()) return;
    const chapter = this.chapter();
    if (!chapter) return;

    this.inlineAiResponse.set('');
    this.inlineAiStreaming.set(true);

    const content = selectedText
      ? text
        ? `Selected text:\n"${selectedText}"\n\n${text}`
        : `Selected text:\n"${selectedText}"`
      : text;
    const apiMessages = [{ role: 'user' as const, content }];
    this.inlineAiAbortController = new AbortController();

    try {
      const response = await fetch(`/api/chat/${chapter.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, selectedText: selectedText || undefined }),
        signal: this.inlineAiAbortController.signal,
      });

      if (!response.ok || !response.body) {
        this.inlineAiResponse.set('Error: failed to get a response.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; error?: string };
            if (parsed.error) {
              this.inlineAiResponse.set(`Error: ${parsed.error}`);
            } else if (parsed.content) {
              this.inlineAiResponse.update(r => r + parsed.content);
            }
          } catch {
            // Skip malformed SSE chunk
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        this.inlineAiResponse.set('Error: could not connect to AI.');
      }
    } finally {
      this.inlineAiStreaming.set(false);
      this.inlineAiAbortController = null;
    }
  }

  acceptInlineAiResponse(): void {
    let text = this.inlineAiResponse();
    if (!text || !this.inlineAiCursorRange) return;

    // Strip AI-added outer quotes when the selection is already surrounded by quotes,
    // to prevent double-quoting (e.g. ""Hello"" → "Hello").
    const QUOTE_CHARS = new Set(['"', "'", '\u201C', '\u201D', '\u2018', '\u2019']);
    const charBefore = this.inlineAiCharBefore;
    const charAfter = this.inlineAiCharAfter;
    if (QUOTE_CHARS.has(charBefore) && QUOTE_CHARS.has(text[0])) {
      text = text.slice(1);
    }
    if (QUOTE_CHARS.has(charAfter) && text.length > 0 && QUOTE_CHARS.has(text[text.length - 1])) {
      text = text.slice(0, -1);
    }

    const range = this.inlineAiCursorRange;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor to end of inserted text
    const afterRange = document.createRange();
    afterRange.setStartAfter(textNode);
    afterRange.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }

    if (this.contentEditorRef) {
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
      const current = this.chapter();
      if (current) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.draftService.saveDraft(current.id, this.editorContent, this.notes());
          this.hasDraft.set(true);
        }, 800);
      }
    }

    this.dismissInlineAiPrompt(false);
  }

  dismissInlineAiPrompt(restoreFocus = true): void {
    this.inlineAiAbortController?.abort();
    this.inlineAiAbortController = null;
    this.inlineAiVisible.set(false);
    this.inlineAiInput.set('');
    this.inlineAiResponse.set('');
    this.inlineAiSelectedText.set('');

    if (restoreFocus && this.inlineAiCursorRange && this.contentEditorRef) {
      const range = this.inlineAiCursorRange;
      this.contentEditorRef.nativeElement.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    this.inlineAiCursorRange = null;
  }

  private async loadChatHistory(chapterId: string): Promise<void> {
    try {
      const response = await fetch(`/api/chat/${chapterId}/history`);
      if (response.ok) {
        const data = await response.json() as { messages: { role: 'user' | 'assistant'; text: string }[] };
        if (data.messages.length > 0) {
          this.chatMessages.set(data.messages);
          this.scrollChatToBottom();
        }
      }
    } catch {
      // Proceed without history
    }
  }

  private async saveChatHistory(): Promise<void> {
    const chapter = this.chapter();
    if (!chapter) return;
    try {
      await fetch(`/api/chat/${chapter.id}/history`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.chatMessages() }),
      });
    } catch {
      // Best-effort save
    }
  }

  async clearChat(): Promise<void> {
    const chapter = this.chapter();
    if (!chapter) return;
    this.chatMessages.set([]);
    try {
      await fetch(`/api/chat/${chapter.id}/history`, { method: 'DELETE' });
    } catch {
      // Best-effort clear
    }
  }

  onChatKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChat();
    }
  }

  async sendChat(): Promise<void> {
    const text = this.chatInput().trim();
    if (!text || this.chatStreaming()) return;

    const chapter = this.chapter();
    if (!chapter) return;

    // Add user message and clear input
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text }]);
    this.chatInput.set('');
    this.chatStreaming.set(true);

    // Add empty assistant placeholder that will be filled in via streaming
    this.chatMessages.update(msgs => [...msgs, { role: 'assistant', text: '' }]);
    this.scrollChatToBottom();

    // Build history (exclude the empty assistant message we just added)
    const apiMessages = this.chatMessages()
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.text }));

    this.chatAbortController = new AbortController();

    try {
      const response = await fetch(`/api/chat/${chapter.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: this.chatAbortController.signal,
      });

      if (!response.ok || !response.body) {
        this.chatMessages.update(msgs => {
          const updated = [...msgs];
          updated[updated.length - 1] = { role: 'assistant', text: 'Error: failed to get a response.' };
          return updated;
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; error?: string };
            if (parsed.error) {
              this.chatMessages.update(msgs => {
                const updated = [...msgs];
                updated[updated.length - 1] = { role: 'assistant', text: `Error: ${parsed.error}` };
                return updated;
              });
            } else if (parsed.content) {
              this.chatMessages.update(msgs => {
                const updated = [...msgs];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  text: updated[updated.length - 1].text + parsed.content,
                };
                return updated;
              });
              this.scrollChatToBottom();
            }
          } catch {
            // Skip malformed SSE chunk
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        this.chatMessages.update(msgs => {
          const updated = [...msgs];
          updated[updated.length - 1] = { role: 'assistant', text: 'Error: could not connect to AI.' };
          return updated;
        });
      }
    } finally {
      this.chatStreaming.set(false);
      this.chatAbortController = null;
      this.scrollChatToBottom();
      this.saveChatHistory();
    }
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      if (this.chatMessagesEl) {
        const el = this.chatMessagesEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
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

  markdownToHtml(text: string): SafeHtml {
    const html = parseMarkdown(text) as string;
    return this.sanitizer.sanitize(1 /* SecurityContext.HTML */, html) ?? '';
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  openNoteInput(): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    this.noteSelectionRange = sel.getRangeAt(0).cloneRange();
    const rect = this.noteSelectionRange.getBoundingClientRect();

    const PANEL_WIDTH = 320;
    const top = rect.bottom + 10;
    const left = Math.max(8, Math.min(
      rect.left + rect.width / 2 - PANEL_WIDTH / 2,
      window.innerWidth - PANEL_WIDTH - 8,
    ));

    this.noteInputTop.set(top);
    this.noteInputLeft.set(left);
    this.noteInputText.set('');
    this.noteInputVisible.set(true);
    this.formattingToolbarVisible.set(false);

    setTimeout(() => this.noteInputEl?.nativeElement?.focus());
  }

  submitNote(): void {
    const text = this.noteInputText().trim();
    if (!text || !this.noteSelectionRange) return;

    const noteId = crypto.randomUUID();
    const selectedText = this.noteSelectionRange.toString();

    const span = document.createElement('span');
    span.className = 'note-indicator';
    span.setAttribute('data-note-id', noteId);

    try {
      this.noteSelectionRange.surroundContents(span);
    } catch {
      const fragment = this.noteSelectionRange.extractContents();
      span.appendChild(fragment);
      this.noteSelectionRange.insertNode(span);
    }

    const note: ChapterNote = {
      id: noteId,
      noteText: text,
      selectedText,
      createdAt: new Date().toISOString(),
    };
    this.notes.update(ns => [...ns, note]);

    if (this.contentEditorRef) {
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
      const current = this.chapter();
      if (current) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.draftService.saveDraft(current.id, this.editorContent, this.notes());
          this.hasDraft.set(true);
        }, 800);
      }
    }

    this.dismissNoteInput();
  }

  dismissNoteInput(): void {
    this.noteInputVisible.set(false);
    this.noteInputText.set('');
    this.noteSelectionRange = null;
  }

  onNoteInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.dismissNoteInput();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      this.submitNote();
    }
  }

  toggleNotesList(): void {
    this.notesListVisible.update(v => !v);
  }

  scrollToNote(noteId: string): void {
    if (!this.contentEditorRef) return;
    const span = this.contentEditorRef.nativeElement.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
    if (!span) return;

    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.highlightedNoteId.set(noteId);
    span.classList.add('note-highlighted');

    setTimeout(() => {
      span.classList.remove('note-highlighted');
      this.highlightedNoteId.set(null);
    }, 2000);
  }

  deleteNote(noteId: string): void {
    this.notes.update(ns => ns.filter(n => n.id !== noteId));

    if (this.contentEditorRef) {
      const span = this.contentEditorRef.nativeElement.querySelector(`[data-note-id="${noteId}"]`);
      if (span) {
        const parent = span.parentNode!;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
      }
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
      const current = this.chapter();
      if (current) {
        if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
          this.draftService.saveDraft(current.id, this.editorContent, this.notes());
          this.hasDraft.set(true);
        }, 800);
      }
    }
  }
}
