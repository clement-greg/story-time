import { Component, inject, signal, computed, OnInit, OnDestroy, ElementRef, ViewChild, HostListener, effect, untracked } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { parse as parseMarkdown } from 'marked';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChapterService } from '../chapter/chapter.service';
import { ChapterDraftService } from './chapter-draft.service';
import { ChapterVersionService } from './chapter-version.service';
import { Chapter, ChapterNote, ChapterVersion } from '@shared/models/chapter.model';
import { GrammarCheckService, GrammarError, SuggestedEntity } from '../services/grammar-check.service';
import { Entity, EntityReference } from '@shared/models/entity.model';
import { BookService } from '../book/book.service';
import { EntityService } from '../services/entity.service';
import { EntityQuoteService } from '../services/entity-quote.service';
import { EntityQuote } from '@shared/models';
import { SeriesService } from '../series/series.service';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';
import { EntityEditComponent } from '../entity-edit/entity-edit';
import { HeaderService } from '../services/header.service';
import { EntityPanelService } from '../services/entity-panel.service';
import { UserSettingsService, GhostCompleteItem } from '../services/user-settings.service';

export interface SuggestedEntityCard extends SuggestedEntity {
  creating?: boolean;
  created?: boolean;
  draftEntity?: Entity;
}

@Component({
  selector: 'app-chapter-edit',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatDialogModule,
    MatMenuModule,
    SlideOutPanelContainer,
    EntityEditComponent,
  ],
  templateUrl: './chapter-edit.html',
  styleUrl: './chapter-edit.css',
})
export class ChapterEditComponent implements OnInit, OnDestroy {
  @ViewChild('contentEditor') contentEditorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('inlineAiInputEl') inlineAiInputEl!: ElementRef<HTMLInputElement>;
  @ViewChild('inlineAiPanel') inlineAiPanelRef?: ElementRef<HTMLElement>;
  @ViewChild('noteInputEl') noteInputEl!: ElementRef<HTMLTextAreaElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private chapterService = inject(ChapterService);
  private draftService = inject(ChapterDraftService);
  private chapterVersionService = inject(ChapterVersionService);
  private entityService = inject(EntityService);
  private entityQuoteService = inject(EntityQuoteService);
  private bookService = inject(BookService);
  private seriesService = inject(SeriesService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private headerService = inject(HeaderService);
  private entityPanel = inject(EntityPanelService);
  private grammarService = inject(GrammarCheckService);
  private userSettings = inject(UserSettingsService);

  chapter = signal<Chapter | null>(null);
  saving = signal(false);
  hasDraft = signal(false);
  entities = signal<Entity[]>([]);

  // Entity quotes
  capturingQuote = signal(false);

  // Ctrl+. context menu
  ctxMenuVisible = signal(false);
  ctxMenuTop = signal(0);
  ctxMenuLeft = signal(0);
  ctxMenuItems = signal<{ id: string; label: string; icon: string }[]>([]);
  ctxMenuFocusedIndex = signal(0);
  private ctxMenuCaptureText = '';
  private ctxMenuNarratorCaptureText = '';

  // Autocomplete
  autocompleteItems = signal<{ entity: Entity; text: string; isPreferred: boolean }[]>([]);
  autocompleteIndex = signal(0);
  autocompleteTop = signal(0);
  autocompleteLeft = signal(0);
  autocompleteAbove = signal(false);
  private currentWordRange: Range | null = null;

  // Formatting toolbar
  formattingToolbarVisible = signal(false);
  formattingToolbarTop = signal(0);
  formattingToolbarLeft = signal(0);
  formattingState = signal({ bold: false, italic: false, underline: false, align: '' as 'left' | 'center' | 'right' | 'justify' | '' });

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

  // Image resize
  selectedImage = signal<HTMLImageElement | null>(null);
  imageOverlayRect = signal<{ top: number; left: number; width: number; height: number } | null>(null);

  private resizeDrag: {
    direction: 'e' | 's' | 'se';
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    img: HTMLImageElement;
    moveHandler: (e: MouseEvent) => void;
    upHandler: () => void;
  } | null = null;

  // Sidebar panel
  mobileSidebarOpen = signal(false);
  sidebarTabIndex = signal(0);
  sidebarWidth = signal(350);

  // Panel resizer
  private resizerDrag: {
    startX: number;
    startWidth: number;
    moveHandler: (e: MouseEvent) => void;
    upHandler: () => void;
  } | null = null;

  // Mobile title edit
  mobileTitleEditOpen = signal(false);
  mobileTitleDraft = signal('');

  // Inline AI prompt (Ctrl+.)
  inlineAiVisible = signal(false);
  inlineAiTop = signal(0);
  inlineAiLeft = signal(0);
  inlineAiAbove = signal(false);
  inlineAiInput = signal('');
  inlineAiResponse = signal('');
  inlineAiStreaming = signal(false);
  inlineAiSelectedText = signal('');
  inlineAiImageUrl = signal<string | null>(null);
  inlineAiGeneratingImage = signal(false);

  // Ghost complete inline suggestion for AI Insert
  ghostSuggestion = computed(() => {
    const input = this.inlineAiInput();
    if (!input || this.inlineAiSelectedText()) return null;
    const lower = input.toLowerCase();
    return this.userSettings.ghostCompleteItems().find(
      item => item.prompt.toLowerCase().startsWith(lower) && item.prompt.length > input.length
    ) ?? null;
  });
  ghostSuffix = computed(() => {
    const s = this.ghostSuggestion();
    const input = this.inlineAiInput();
    return s ? s.prompt.slice(input.length) : '';
  });
  private inlineAiCursorRange: Range | null = null;
  private inlineAiCharBefore = '';
  private inlineAiCharAfter = '';
  private inlineAiSurroundingText = '';
  private inlineAiAbortController: AbortController | null = null;
  private inlineAiAnchorRect: DOMRect | null = null;
  private inlineAiResizeObserver: ResizeObserver | null = null;
  private noteSelectionRange: Range | null = null;
  grammarChecking = signal(false);
  grammarPopoverVisible = signal(false);
  grammarPopoverTop = signal(0);
  grammarPopoverLeft = signal(0);
  grammarPopoverAbove = signal(false);
  grammarPopoverError = signal<GrammarError | null>(null);
  private grammarPopoverMarkEl: HTMLElement | null = null;
  private grammarTimer: ReturnType<typeof setTimeout> | null = null;
  private grammarAbortController: AbortController | null = null;
  private grammarLastCheckedText = '';

  /** Tracks latest editor content without writing back to the DOM.
   *  The setter automatically strips grammar mark elements so they are
   *  never persisted to the draft or the server. */
  private _editorContent = '';
  private get editorContent(): string { return this._editorContent; }
  private set editorContent(value: string) {
    const needsClean = value.includes('grammar-error') || value.includes('ai-insertion-marker');
    if (needsClean) {
      const div = document.createElement('div');
      div.innerHTML = value;
      div.querySelectorAll('mark.grammar-error').forEach(mark => {
        const parent = mark.parentNode!;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      });
      div.querySelectorAll('.ai-insertion-marker').forEach(el => el.remove());
      this._editorContent = div.innerHTML;
    } else {
      this._editorContent = value;
    }
  }
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private seriesId = '';
  private suggestedEntityNames = new Set<string>();

  constructor() {
    effect(() => {
      const updated = this.entityPanel.lastUpdatedEntity();
      if (!updated) return;
      this.entities.update(list => list.map(e => e.id === updated.id ? updated : e));
      const synced = this.syncEntityReferences(this.editorContent, this.entities());
      if (synced !== this.editorContent) {
        this.editorContent = synced;
        if (this.contentEditorRef) {
          this.contentEditorRef.nativeElement.innerHTML = synced;
        }
      }
    });

    // Load version history whenever the history tab becomes active and the chapter is ready
    effect(() => {
      const idx = this.sidebarTabIndex();
      const chapter = this.chapter();
      if (idx === 1 && chapter) {
        untracked(() => {
          if (!this.historyLoading() && this.historyVersions().length === 0) {
            this.loadHistory(chapter.id);
          }
        });
      }
    });
  }

  ngOnInit(): void {
    this.loadSidebarWidth();
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

        // Load entities + register header breadcrumbs
        this.bookService.getById(data.bookId).subscribe({
          next: (book) => {
            this.seriesId = book.seriesId;
            this.seriesService.getById(book.seriesId).subscribe({
              next: (series) => {
                this.headerService.set(
                  [
                    { label: series.title, link: '/series/' + series.id },
                    { label: book.title, link: '/books/' + book.id },
                    { label: data.title || 'Chapter' },
                  ],
                  [
                    { icon: 'people', label: 'Entities', action: () => this.entityPanel.open(series.id) },
                    { icon: 'account_tree', label: 'Relationships', action: () => this.router.navigate(['/series', series.id, 'relationships']) },
                  ]
                );
              },
            });
            this.entityService.getBySeries(book.seriesId).subscribe({
              next: (entities) => {
                this.entities.set(entities);
                const synced = this.syncEntityReferences(this.editorContent, entities);
                if (synced !== this.editorContent) {
                  this.editorContent = synced;
                  if (this.contentEditorRef) {
                    this.contentEditorRef.nativeElement.innerHTML = synced;
                  }
                }
              },
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
    if (this.grammarTimer) clearTimeout(this.grammarTimer);
    this.grammarAbortController?.abort();
    this.inlineAiAbortController?.abort();
    if (this.resizerDrag) {
      document.removeEventListener('mousemove', this.resizerDrag.moveHandler);
      document.removeEventListener('mouseup', this.resizerDrag.upHandler);
    }
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

    this.scheduleGrammarCheck();
  }

  onEditorKeyDown(event: KeyboardEvent): void {
    // Handle Ctrl+. context menu navigation when it is open
    if (this.ctxMenuVisible()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeCtxMenu();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.ctxMenuFocusedIndex.update(i => (i + 1) % this.ctxMenuItems().length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.ctxMenuFocusedIndex.update(i => (i - 1 + this.ctxMenuItems().length) % this.ctxMenuItems().length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.executeCtxMenuItem(this.ctxMenuItems()[this.ctxMenuFocusedIndex()]);
        return;
      }
      // Any other key closes the menu and falls through to normal handling
      this.closeCtxMenu();
    }

    // Tab inserts a tab character instead of moving focus (unless autocomplete is open)
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey && this.autocompleteItems().length === 0) {
      event.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tabNode = document.createTextNode('\t');
        range.insertNode(tabNode);
        range.setStartAfter(tabNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
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
      return;
    }

    // Ctrl+. opens the context menu
    if (event.ctrlKey && event.key === '.') {
      event.preventDefault();
      this.openCtxMenu();
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

    // If an image is selected and a delete key is pressed, clear the overlay first
    if ((event.key === 'Backspace' || event.key === 'Delete') && this.selectedImage()) {
      this.clearImageSelection();
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
    span.setAttribute('data-reference-type', this.getReferenceType(entity, text));
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

  private formattingToolbarShownForImage = false;

  onEditorClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Grammar error mark clicked — show suggestion popover
    const grammarMark = target.closest('mark.grammar-error') as HTMLElement | null;
    if (grammarMark) {
      this.showGrammarPopover(event, grammarMark);
      return;
    }

    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      // Remove selection from any previously selected image
      this.contentEditorRef?.nativeElement.querySelectorAll('img.image-selected')
        .forEach(el => el.classList.remove('image-selected'));
      img.classList.add('image-selected');
      this.selectedImage.set(img);
      this.positionImageToolbar(img);
      this.showFormattingToolbarForImage(img);
    } else {
      this.clearImageSelection();
    }
  }

  private showFormattingToolbarForImage(img: HTMLImageElement): void {
    const rect = img.getBoundingClientRect();
    const toolbarWidth = 326;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8));
    this.formattingToolbarTop.set(rect.top - 44);
    this.formattingToolbarLeft.set(left);
    this.formattingState.set({
      bold: false,
      italic: false,
      underline: false,
      align: this.readImageAlign(img),
    });
    this.formattingToolbarVisible.set(true);
    this.formattingToolbarShownForImage = true;
  }

  /** Walk up from the image to the nearest block ancestor and return its text-align. */
  private readImageAlign(img: HTMLImageElement): 'left' | 'center' | 'right' | 'justify' {
    const editor = this.contentEditorRef?.nativeElement;
    let el: HTMLElement | null = img.parentElement;
    while (el && el !== editor) {
      const ta = el.style.textAlign;
      if (ta === 'center' || ta === 'right' || ta === 'justify') return ta as 'center' | 'right' | 'justify';
      if (ta === 'left') return 'left';
      el = el.parentElement;
    }
    return 'left';
  }

  /** Set text-align on the nearest block ancestor of the image. */
  private applyAlignToImage(img: HTMLImageElement, align: 'left' | 'center' | 'right' | 'justify'): void {
    const editor = this.contentEditorRef?.nativeElement;
    let el: HTMLElement | null = img.parentElement;
    // Walk up to the first block-level element inside the editor
    while (el && el !== editor) {
      const display = window.getComputedStyle(el).display;
      if (display === 'block' || display === 'flex' || display === 'table-cell') break;
      el = el.parentElement;
    }
    if (!el || el === editor) el = img.parentElement;
    if (!el) return;
    el.style.textAlign = align === 'left' ? '' : align;
    this.formattingState.update(s => ({ ...s, align }));
    this.syncEditorAfterImageResize();
  }

  private clearImageSelection(): void {
    this.contentEditorRef?.nativeElement.querySelectorAll('img.image-selected')
      .forEach(el => el.classList.remove('image-selected'));
    this.selectedImage.set(null);
    this.imageOverlayRect.set(null);
    if (this.formattingToolbarShownForImage) {
      this.formattingToolbarVisible.set(false);
      this.formattingToolbarShownForImage = false;
    }
  }

  private positionImageToolbar(img: HTMLImageElement): void {
    const rect = img.getBoundingClientRect();
    this.imageOverlayRect.set({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }

  onEditorScroll(): void {
    const img = this.selectedImage();
    if (img) {
      this.positionImageToolbar(img);
    }
  }

  onEditorTouchStart(event: TouchEvent): void {
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      // Prevent the context menu that some browsers show on long-press
      event.preventDefault();
      this.openInlineAiPrompt();
    }, 600);
  }

  onEditorTouchEnd(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  onEditorTouchMove(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  // ── Panel resizer (sidebar width) ─────────────────────
  private static readonly SIDEBAR_STORAGE_KEY = 'chapter-edit-sidebar-width';
  private static readonly SIDEBAR_MIN = 200;
  private static readonly SIDEBAR_MAX_RATIO = 0.6; // sidebar can't exceed 60% of window

  private loadSidebarWidth(): void {
    const stored = localStorage.getItem(ChapterEditComponent.SIDEBAR_STORAGE_KEY);
    if (stored) {
      const w = parseInt(stored, 10);
      if (!isNaN(w) && w >= ChapterEditComponent.SIDEBAR_MIN && w < window.innerWidth * ChapterEditComponent.SIDEBAR_MAX_RATIO) {
        this.sidebarWidth.set(w);
      }
    }
  }

  onResizerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.sidebarWidth();

    const moveHandler = (e: MouseEvent) => {
      const delta = startX - e.clientX; // dragging left = wider sidebar
      const maxWidth = window.innerWidth * ChapterEditComponent.SIDEBAR_MAX_RATIO;
      const newWidth = Math.max(ChapterEditComponent.SIDEBAR_MIN, Math.min(startWidth + delta, maxWidth));
      this.sidebarWidth.set(Math.round(newWidth));
    };

    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(ChapterEditComponent.SIDEBAR_STORAGE_KEY, String(this.sidebarWidth()));
      this.resizerDrag = null;
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    this.resizerDrag = { startX, startWidth, moveHandler, upHandler };
  }

  onResizeHandleMouseDown(event: MouseEvent, direction: 'e' | 's' | 'se'): void {
    event.preventDefault();
    event.stopPropagation();
    const img = this.selectedImage();
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const moveHandler = (e: MouseEvent) => this.onResizeMouseMove(e);
    const upHandler = () => this.onResizeMouseUp();
    this.resizeDrag = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      img,
      moveHandler,
      upHandler,
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  private onResizeMouseMove(event: MouseEvent): void {
    if (!this.resizeDrag) return;
    const { direction, startX, startY, startWidth, startHeight, img } = this.resizeDrag;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (direction === 'e' || direction === 'se') {
      img.style.width = Math.max(20, startWidth + dx) + 'px';
      img.removeAttribute('width');
    }
    if (direction === 's' || direction === 'se') {
      img.style.height = Math.max(20, startHeight + dy) + 'px';
      img.removeAttribute('height');
    }
    const updated = img.getBoundingClientRect();
    this.imageOverlayRect.set({ top: updated.top, left: updated.left, width: updated.width, height: updated.height });
  }

  private onResizeMouseUp(): void {
    if (!this.resizeDrag) return;
    document.removeEventListener('mousemove', this.resizeDrag.moveHandler);
    document.removeEventListener('mouseup', this.resizeDrag.upHandler);
    const img = this.resizeDrag.img;
    this.resizeDrag = null;
    this.syncEditorAfterImageResize();
    this.positionImageToolbar(img);
  }

  private syncEditorAfterImageResize(): void {
    if (!this.contentEditorRef) return;
    this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
    const current = this.chapter();
    if (!current) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.draftService.saveDraft(current.id, this.editorContent, this.notes());
      this.hasDraft.set(true);
    }, 800);
  }

  onEditorMouseUp(): void {
    // Defer so the selection is finalized before we read it
    setTimeout(() => this.updateFormattingToolbar());
  }

  private updateFormattingToolbar(): void {
    // Don't override the toolbar shown for a selected image
    if (this.formattingToolbarShownForImage) return;
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

    const toolbarWidth = 326; // 7 buttons + 3 separators + alignment group
    const left = rect.left + rect.width / 2 - toolbarWidth / 2;
    this.formattingToolbarTop.set(rect.top - 44);
    this.formattingToolbarLeft.set(Math.max(8, left));
    this.formattingState.set({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      align: document.queryCommandState('justifyCenter') ? 'center'
           : document.queryCommandState('justifyRight')  ? 'right'
           : document.queryCommandState('justifyFull')   ? 'justify'
           : 'left',
    });
    this.formattingToolbarVisible.set(true);
  }

  applyFormat(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull'): void {
    const img = this.selectedImage();
    // When an image is selected, alignment must be applied directly to the
    // parent block — execCommand requires a text selection and won't work.
    if (img && command.startsWith('justify')) {
      const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
        justifyLeft: 'left', justifyCenter: 'center',
        justifyRight: 'right', justifyFull: 'justify',
      };
      this.applyAlignToImage(img, alignMap[command]);
      return;
    }

    // Normal text-selection path
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
      align: document.queryCommandState('justifyCenter') ? 'center'
           : document.queryCommandState('justifyRight')  ? 'right'
           : document.queryCommandState('justifyFull')   ? 'justify'
           : 'left',
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
    if (this.grammarPopoverVisible() && !target.closest('.grammar-popover')) {
      this.dismissGrammarPopover();
    }
    if (this.selectedImage() && target.tagName !== 'IMG' && !target.closest('.image-resize-toolbar') && !target.closest('.image-resize-overlay')) {
      this.clearImageSelection();
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
      const DROPDOWN_MAX_HEIGHT = 240;
      const GAP = 4;
      const above = rect.bottom + GAP + DROPDOWN_MAX_HEIGHT > window.innerHeight;
      this.autocompleteAbove.set(above);
      this.autocompleteTop.set(above ? rect.top - GAP : rect.bottom + GAP);
      this.autocompleteLeft.set(rect.left);
    }
  }

  private entityMatchesWord(entity: Entity, lower: string): boolean {
    return this.allRefsFor(entity).some(v => v.toLowerCase().includes(lower));
  }

  private getReferenceType(entity: Entity, text: string): EntityReference {
    if (text === entity.name) return 'full-name';
    const refs = this.resolvedRefs(entity);
    if (refs.title) {
      if (text === `${refs.title} ${entity.name}`) return 'title-full-name';
      if (refs.lastName && text === `${refs.title} ${refs.lastName}`) return 'title-last-name';
    }
    if (refs.firstName && text === refs.firstName) return 'first-name';
    if (refs.lastName && text === refs.lastName) return 'last-name';
    if (refs.nickname && text === refs.nickname) return 'nickname';
    return 'full-name';
  }

  private getTextForReferenceType(entity: Entity, refType: EntityReference): string {
    const refs = this.resolvedRefs(entity);
    switch (refType) {
      case 'first-name': return refs.firstName || entity.name;
      case 'last-name': return refs.lastName || entity.name;
      case 'nickname': return refs.nickname || entity.name;
      case 'title-full-name': return refs.title ? `${refs.title} ${entity.name}` : entity.name;
      case 'title-last-name': return refs.title && refs.lastName ? `${refs.title} ${refs.lastName}` : entity.name;
      default: return entity.name;
    }
  }

  private syncEntityReferences(html: string, entities: Entity[]): string {
    if (!html) return html;
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll<HTMLElement>('span[data-id][data-reference-type]').forEach(span => {
      const entity = entities.find(e => e.id === span.getAttribute('data-id'));
      if (!entity) return;
      const refType = span.getAttribute('data-reference-type') as EntityReference;
      const expected = this.getTextForReferenceType(entity, refType);
      if (span.textContent !== expected) span.textContent = expected;
    });
    return div.innerHTML;
  }

  private getPreferredText(entity: Entity): string {
    const refs = this.resolvedRefs(entity);
    switch (entity.preferredReference) {
      case 'first-name': return refs.firstName || entity.name;
      case 'last-name': return refs.lastName || entity.name;
      case 'nickname': return refs.nickname || entity.name;
      case 'title-full-name': return refs.title ? `${refs.title} ${entity.name}` : entity.name;
      case 'title-last-name': return refs.title && refs.lastName ? `${refs.title} ${refs.lastName}` : entity.name;
      default: return entity.name;
    }
  }

  /** Returns stored name fields, falling back to parsing entity.name for PERSON entities. */
  private resolvedRefs(entity: Entity): { title?: string; firstName?: string; lastName?: string; nickname?: string } {
    if (entity.type !== 'PERSON') return {};
    const parts = entity.name.trim().split(/\s+/);
    return {
      title: entity.title,
      firstName: entity.firstName || (parts.length >= 2 ? parts[0] : undefined),
      lastName: entity.lastName || (parts.length >= 2 ? parts[parts.length - 1] : undefined),
      nickname: entity.nickname,
    };
  }

  private allRefsFor(entity: Entity): string[] {
    const refs = this.resolvedRefs(entity);
    const titleFullName = refs.title ? `${refs.title} ${entity.name}` : undefined;
    const titleLastName = refs.title && refs.lastName ? `${refs.title} ${refs.lastName}` : undefined;
    return [entity.name, refs.firstName, refs.lastName, refs.nickname, titleFullName, titleLastName].filter((v): v is string => !!v);
  }

  /** Builds a DocumentFragment from plain text, wrapping entity name occurrences in entity-reference spans. */
  private buildEntityAnnotatedFragment(text: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const entities = this.entities().filter(e => !e.deleted && !e.archived);
    if (entities.length === 0) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    type NameEntry = { name: string; entity: Entity; refType: EntityReference };
    const entries: NameEntry[] = [];
    for (const entity of entities) {
      for (const name of this.allRefsFor(entity)) {
        entries.push({ name, entity, refType: this.getReferenceType(entity, name) });
      }
    }
    // Longest names first so "Carlos Mendoza" matches before "Carlos"
    entries.sort((a, b) => b.name.length - a.name.length);

    const escapedNames = entries.map(e => e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedNames.join('|')})\\b`, 'g');

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const matchedText = match[0];
      const entry = entries.find(e => e.name === matchedText);
      if (entry) {
        const span = document.createElement('span');
        span.setAttribute('data-id', entry.entity.id);
        span.setAttribute('data-reference-type', entry.refType);
        span.className = 'entity-reference';
        span.textContent = matchedText;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(matchedText));
      }
      lastIndex = match.index + matchedText.length;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    return fragment;
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

  /** Reads entity-quote spans from the editor DOM and returns them as plain objects. */
  private extractDetectedQuotes(): { entityId: string; text: string }[] {
    if (!this.contentEditorRef) return [];
    const editor = this.contentEditorRef.nativeElement;
    const spans = editor.querySelectorAll<HTMLElement>('span.entity-quote[data-quoted-entity-id]');
    const results: { entityId: string; text: string }[] = [];
    spans.forEach(span => {
      const entityId = span.getAttribute('data-quoted-entity-id');
      // Strip the surrounding quote characters from the text content
      const raw = span.textContent ?? '';
      const text = raw.replace(/^[\u201c"]+|[\u201d"]+$/g, '').trim();
      if (entityId && text) results.push({ entityId, text });
    });
    return results;
  }

  async save(): Promise<void> {
    const chapter = this.chapter();
    if (!chapter || !chapter.title.trim()) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Strip any legacy entity-quote spans from the HTML before saving
    if (this.contentEditorRef) {
      this.unwrapEntityQuotes();
      this.editorContent = this.contentEditorRef.nativeElement.innerHTML;
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
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Discard draft?',
        message: 'This will revert to the last saved version. Any unsaved changes will be lost.',
        confirm: 'Discard',
      },
      width: '360px',
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
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

  archiveEntityEdit(id: string): void {
    this.entityService.archive(id).subscribe({
      next: () => {
        this.entities.update(list => list.filter(e => e.id !== id));
        this.editingEntity.set(null);
      },
    });
  }

  cancelEntityEdit(): void {
    this.editingEntity.set(null);
  }

  onSidebarTabChange(index: number): void {
    this.sidebarTabIndex.set(index);
    if (index === 1) {
      const chapter = this.chapter();
      if (chapter && !this.historyLoading() && this.historyVersions().length === 0) {
        this.loadHistory(chapter.id);
      }
    }
  }

  activateSidebarTab(index: number): void {
    if (this.mobileSidebarOpen() && this.sidebarTabIndex() === index) {
      this.mobileSidebarOpen.set(false);
    } else {
      this.onSidebarTabChange(index);
      this.mobileSidebarOpen.set(true);
    }
  }

  toggleHistory(): void {
    this.activateSidebarTab(1);
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

  private extractSurroundingText(range: Range): string {
    const editor = this.contentEditorRef?.nativeElement;
    if (!editor) return '';
    const fullText = editor.innerText ?? '';
    // Find the cursor offset within the plain text
    const preRange = document.createRange();
    preRange.setStart(editor, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursorOffset = preRange.toString().length;
    // Grab ~300 chars before and after, then trim to sentence boundaries
    const RADIUS = 300;
    const rawBefore = fullText.slice(Math.max(0, cursorOffset - RADIUS), cursorOffset);
    const rawAfter = fullText.slice(cursorOffset, cursorOffset + RADIUS);
    // Trim to last sentence start before the window
    const sentenceStart = rawBefore.search(/[.!?]\s+(?=[A-Z])[^]*$/);
    const before = sentenceStart >= 0 ? rawBefore.slice(sentenceStart + 1).trim() : rawBefore.trim();
    // Trim to first sentence end after the window
    const sentenceEnd = rawAfter.search(/[.!?]\s/);
    const after = sentenceEnd >= 0 ? rawAfter.slice(0, sentenceEnd + 1).trim() : rawAfter.trim();
    if (!before && !after) return '';
    return before + ' [CURSOR] ' + after;
  }

  /** Returns the plain-text content of the sentence the cursor is currently inside. */
  private extractCurrentLine(): string {
    const editor = this.contentEditorRef?.nativeElement;
    if (!editor) return '';
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(editor, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursorOffset = preRange.toString().length;
    const fullText = editor.innerText ?? '';

    // Sentence-ending punctuation followed by whitespace (or newline) marks a boundary
    const sentenceEndRe = /[.!?][\s\n]/g;

    // Find the start of the current sentence: last sentence-end before the cursor
    let sentenceStart = 0;
    let m: RegExpExecArray | null;
    while ((m = sentenceEndRe.exec(fullText)) !== null) {
      if (m.index + m[0].length > cursorOffset) break;
      sentenceStart = m.index + m[0].length;
    }

    // Find the end of the current sentence: next sentence-end at or after the cursor
    sentenceEndRe.lastIndex = cursorOffset;
    const endMatch = sentenceEndRe.exec(fullText);
    const sentenceEnd = endMatch ? endMatch.index + 1 : fullText.length;

    return fullText.slice(sentenceStart, sentenceEnd).trim();
  }

  /** Detects whether the cursor is currently inside (or immediately after) a quoted string and returns the text, or null. */
  private detectCursorInQuote(): string | null {
    const editor = this.contentEditorRef?.nativeElement;
    if (!editor) return null;
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.setStart(editor, 0);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursorOffset = preRange.toString().length;

    const fullText = editor.innerText ?? '';
    // Restrict search to the current paragraph
    const lineStart = Math.max(0, fullText.lastIndexOf('\n', cursorOffset - 1) + 1);
    const lineEndIdx = fullText.indexOf('\n', cursorOffset);
    const lineText = fullText.slice(lineStart, lineEndIdx < 0 ? fullText.length : lineEndIdx);
    const cursorInLine = cursorOffset - lineStart;

    // If the cursor is immediately after a closing curly quote, treat it as just-exited
    const justAfterCurly = cursorInLine > 0 && lineText[cursorInLine - 1] === '\u201D';
    // If the cursor is immediately after a closing straight quote (even count before means we just closed)
    const beforeCursorStr = lineText.slice(0, cursorInLine);
    const justAfterStraight = cursorInLine > 0 && lineText[cursorInLine - 1] === '"'
      && (beforeCursorStr.match(/"/g) ?? []).length % 2 === 0;

    // Try curly quotes: search up to and including the character before the cursor
    const searchUpTo = (justAfterCurly ? cursorInLine - 1 : cursorInLine);
    const openCurly = lineText.lastIndexOf('\u201C', searchUpTo - 1);
    const closeCurly = justAfterCurly
      ? cursorInLine - 1  // the closing quote is the char just before cursor
      : lineText.indexOf('\u201D', cursorInLine);
    if (openCurly >= 0 && closeCurly >= 0) {
      return lineText.slice(openCurly + 1, closeCurly).trim() || null;
    }

    // Fall back to straight quotes
    if (justAfterStraight) {
      // Cursor is right after the closing quote; find the matching open quote
      const closePos = cursorInLine - 1;
      const openPos = beforeCursorStr.slice(0, closePos).lastIndexOf('"');
      if (openPos >= 0) {
        return lineText.slice(openPos + 1, closePos).trim() || null;
      }
    }

    // Standard: odd count before cursor means we're inside a quote
    const straightCount = (beforeCursorStr.match(/"/g) ?? []).length;
    if (straightCount % 2 === 1) {
      const openPos = beforeCursorStr.lastIndexOf('"');
      const closePos = lineText.indexOf('"', cursorInLine);
      if (closePos >= 0) {
        return lineText.slice(openPos + 1, closePos).trim() || null;
      }
    }

    return null;
  }

  openCtxMenu(): void {
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString() : '';

    const items: { id: string; label: string; icon: string }[] = [
      { id: 'ai-action', label: selectedText ? 'AI Reword' : 'AI Insert', icon: 'auto_awesome' },
    ];

    const quoteText = this.detectCursorInQuote();
    if (quoteText) {
      this.ctxMenuCaptureText = quoteText;
      items.push({ id: 'capture-quote', label: 'Capture quote', icon: 'record_voice_over' });
    } else {
      this.ctxMenuCaptureText = '';
      const narratorText = selectedText || this.extractCurrentLine();
      if (narratorText) {
        this.ctxMenuNarratorCaptureText = narratorText;
        items.push({ id: 'capture-narrator-quote', label: 'Capture Narrator Quote', icon: 'menu_book' });
      } else {
        this.ctxMenuNarratorCaptureText = '';
      }
    }

    this.ctxMenuItems.set(items);
    this.ctxMenuFocusedIndex.set(0);

    // Position at cursor
    const rect = this.getCursorRect();
    const MENU_WIDTH = 200;
    const MENU_HEIGHT_EST = items.length * 44 + 8;
    const GAP = 6;

    let top = 200;
    let left = 40;

    if (rect && (rect.width !== 0 || rect.height !== 0 || rect.top !== 0)) {
      top = rect.bottom + GAP;
      left = rect.left;
      if (left + MENU_WIDTH > window.innerWidth - GAP) left = window.innerWidth - MENU_WIDTH - GAP;
      left = Math.max(GAP, left);
      if (top + MENU_HEIGHT_EST > window.innerHeight - GAP) top = rect.top - MENU_HEIGHT_EST - GAP;
      top = Math.max(GAP, top);
    } else {
      const editorRect = this.contentEditorRef?.nativeElement?.getBoundingClientRect();
      if (editorRect) { top = editorRect.top + 60; left = editorRect.left + 40; }
    }

    this.ctxMenuTop.set(top);
    this.ctxMenuLeft.set(left);
    this.ctxMenuVisible.set(true);
  }

  closeCtxMenu(): void {
    this.ctxMenuVisible.set(false);
  }

  executeCtxMenuItem(item: { id: string; label: string; icon: string } | undefined): void {
    if (!item) return;
    this.closeCtxMenu();
    if (item.id === 'ai-action') {
      this.openInlineAiPrompt();
    } else if (item.id === 'capture-quote') {
      this.captureQuote();
    } else if (item.id === 'capture-narrator-quote') {
      this.captureNarratorQuote();
    }
  }

  captureQuote(): void {
    const quoteText = this.ctxMenuCaptureText;
    const chapter = this.chapter();
    if (!quoteText || !chapter || this.capturingQuote()) return;

    this.capturingQuote.set(true);

    const sel = window.getSelection();
    let surroundingContext = '';
    if (sel && sel.rangeCount > 0) {
      surroundingContext = this.extractSurroundingText(sel.getRangeAt(0));
    }

    this.entityQuoteService.capture(chapter.id, quoteText, surroundingContext).subscribe({
      next: ({ entityName }) => {
        this.snackBar.open(`Quote captured for ${entityName}`, undefined, { duration: 3000 });
        this.capturingQuote.set(false);
      },
      error: (err: { error?: { error?: string } }) => {
        const msg = err?.error?.error ?? 'Could not identify speaker';
        this.snackBar.open(`Failed: ${msg}`, undefined, { duration: 4000 });
        this.capturingQuote.set(false);
      },
    });
  }

  captureNarratorQuote(): void {
    const text = this.ctxMenuNarratorCaptureText;
    if (!text || !this.seriesId || this.capturingQuote()) return;

    this.capturingQuote.set(true);

    this.entityService.getOrCreateNarrator(this.seriesId).subscribe({
      next: (narrator) => {
        this.entityQuoteService.create(narrator.id, text).subscribe({
          next: () => {
            this.snackBar.open('Narrator quote captured', undefined, { duration: 3000 });
            this.capturingQuote.set(false);
          },
          error: () => {
            this.snackBar.open('Failed to capture narrator quote', undefined, { duration: 4000 });
            this.capturingQuote.set(false);
          },
        });
      },
      error: () => {
        this.snackBar.open('Failed to find narrator', undefined, { duration: 4000 });
        this.capturingQuote.set(false);
      },
    });
  }

  openInlineAiPrompt(): void {
    const sel = window.getSelection();
    this.inlineAiCharBefore = '';
    this.inlineAiCharAfter = '';
    this.inlineAiSurroundingText = '';
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
      // Capture surrounding text for AI context
      this.inlineAiSurroundingText = this.extractSurroundingText(r);
    } else {
      this.inlineAiCursorRange = null;
      this.inlineAiSelectedText.set('');
    }

    this.inlineAiInput.set('');
    this.inlineAiResponse.set('');
    this.inlineAiVisible.set(true);

    // Insert the marker first so we can use its position for the popup
    this.insertAiMarker();

    // Get position from the marker element if available, otherwise fall back to cursor rect
    const marker = this.contentEditorRef?.nativeElement?.querySelector('.ai-insertion-marker');
    const rect = marker?.getBoundingClientRect() ?? this.getCursorRect();

    const PANEL_WIDTH = 388;
    const PANEL_HEIGHT_EST = 120;
    const GAP = 10;

    let top: number;
    let left: number;
    let above = false;

    if (rect && (rect.top !== 0 || rect.left !== 0 || rect.width !== 0 || rect.height !== 0)) {
      // Horizontal: prefer right-aligned with cursor, shift left if it overflows
      left = rect.left;
      if (left + PANEL_WIDTH + GAP > window.innerWidth) {
        left = rect.right - PANEL_WIDTH;
      }
      left = Math.max(GAP, Math.min(left, window.innerWidth - PANEL_WIDTH - GAP));

      // Vertical: prefer below cursor, flip above if it overflows
      if (rect.bottom + GAP + PANEL_HEIGHT_EST < window.innerHeight) {
        top = rect.bottom + GAP;
        above = false;
      } else {
        // Position anchor at cursor top, CSS translateY(-100%) pulls popup above
        top = rect.top - GAP;
        above = true;
      }
      top = Math.max(GAP, top);
    } else {
      // Fallback: center-ish in the editor
      const editorRect = this.contentEditorRef?.nativeElement?.getBoundingClientRect();
      top = editorRect ? editorRect.top + 60 : 200;
      left = editorRect ? editorRect.left + 40 : 200;
    }

    this.inlineAiAnchorRect = rect ?? null;
    this.inlineAiTop.set(top);
    this.inlineAiLeft.set(left);
    this.inlineAiAbove.set(above);

    setTimeout(() => {
      this.inlineAiInputEl?.nativeElement?.focus();
      const panelEl = this.inlineAiPanelRef?.nativeElement;
      if (panelEl) {
        this.inlineAiResizeObserver?.disconnect();
        this.inlineAiResizeObserver = new ResizeObserver(() => this.repositionInlineAiPanel());
        this.inlineAiResizeObserver.observe(panelEl);
      }
    });
  }

  private repositionInlineAiPanel(): void {
    const rect = this.inlineAiAnchorRect;
    const panelEl = this.inlineAiPanelRef?.nativeElement;
    if (!rect || !panelEl) return;
    const GAP = 10;
    const panelHeight = panelEl.offsetHeight;
    let top: number;
    let above: boolean;
    if (rect.bottom + GAP + panelHeight <= window.innerHeight) {
      top = rect.bottom + GAP;
      above = false;
    } else {
      top = rect.top - GAP;
      above = true;
    }
    top = Math.max(GAP, top);
    this.inlineAiTop.set(top);
    this.inlineAiAbove.set(above);
  }

  onInlineAiKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Tab' && this.ghostSuggestion()) {
      event.preventDefault();
      this.applyGhostComplete(this.ghostSuggestion()!);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.submitInlineAiPrompt();
    } else if (event.key === 'Escape') {
      this.dismissInlineAiPrompt();
    } else if (event.key === 'a' && event.altKey && !this.inlineAiStreaming() && (this.inlineAiResponse() || this.inlineAiImageUrl())) {
      event.preventDefault();
      this.acceptInlineAiResponse();
    }
  }

  applyGhostComplete(item: GhostCompleteItem): void {
    this.inlineAiInput.set(item.prompt);
  }

  onInlineAiInputChange(value: string): void {
    this.inlineAiInput.set(value);
  }

  async submitInlineAiPrompt(): Promise<void> {
    const text = this.inlineAiInput().trim();
    const selectedText = this.inlineAiSelectedText();
    if ((!text && !selectedText) || this.inlineAiStreaming()) return;
    const chapter = this.chapter();
    if (!chapter) return;

    this.inlineAiResponse.set('');
    this.inlineAiImageUrl.set(null);
    this.inlineAiStreaming.set(true);

    // Image generation (only when no text is selected for rewording)
    if (!selectedText && this.isImageRequest(text)) {
      this.inlineAiGeneratingImage.set(true);
      try {
        const imgResponse = await this.authFetch('/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        if (imgResponse.ok) {
          const imgData = await imgResponse.json() as { url: string; thumbnailUrl: string };
          this.inlineAiImageUrl.set(imgData.url);
        } else {
          this.inlineAiResponse.set('Error: image generation failed.');
        }
      } catch {
        this.inlineAiResponse.set('Error: could not connect to image generation service.');
      } finally {
        this.inlineAiGeneratingImage.set(false);
        this.inlineAiStreaming.set(false);
      }
      return;
    }

    let content: string;
    if (selectedText) {
      content = text
        ? `Selected text:\n"${selectedText}"\n\n${text}`
        : `Selected text:\n"${selectedText}"`;
    } else {
      // Include surrounding text so the AI can match tone and continuity
      content = this.inlineAiSurroundingText
        ? `The following is the text surrounding the cursor position (marked with [CURSOR]). Use it ONLY as context for tone, style, and continuity. Do NOT repeat or include any of the surrounding text in your response — return ONLY the new content to be inserted at the cursor.\n\nSurrounding text:\n"${this.inlineAiSurroundingText}"\n\nInstruction: ${text}`
        : text;
    }
    const apiMessages = [{ role: 'user' as const, content }];
    this.inlineAiAbortController = new AbortController();

    try {
      const response = await this.authFetch(`/api/chat/${chapter.id}`, {
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
      // Refocus the input so user can modify the prompt without mouse
      setTimeout(() => this.inlineAiInputEl?.nativeElement?.focus());
    }
  }

  acceptInlineAiResponse(): void {
    const imageUrl = this.inlineAiImageUrl();
    if (imageUrl) {
      if (!this.inlineAiCursorRange) return;
      const range = this.inlineAiCursorRange;
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      range.deleteContents();
      const img = document.createElement('img');
      img.src = this.proxyUrl(imageUrl) ?? imageUrl;
      img.style.maxWidth = '100%';
      range.insertNode(img);
      const afterRange = document.createRange();
      afterRange.setStartAfter(img);
      afterRange.collapse(true);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(afterRange);
      }
      this.scrollCursorIntoView();
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
      return;
    }

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
    const fragment = this.buildEntityAnnotatedFragment(text);
    const lastInserted = fragment.lastChild;
    range.insertNode(fragment);

    // Move cursor to end of inserted text
    const afterRange = document.createRange();
    if (lastInserted) {
      afterRange.setStartAfter(lastInserted);
    } else {
      afterRange.setStart(range.startContainer, range.startOffset);
    }
    afterRange.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }
    this.scrollCursorIntoView();

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
    this.removeAiMarker();
    this.inlineAiResizeObserver?.disconnect();
    this.inlineAiResizeObserver = null;
    this.inlineAiAnchorRect = null;
    this.inlineAiAbortController?.abort();
    this.inlineAiAbortController = null;
    this.inlineAiVisible.set(false);
    this.inlineAiInput.set('');
    this.inlineAiResponse.set('');
    this.inlineAiImageUrl.set(null);
    this.inlineAiGeneratingImage.set(false);
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

  private scrollCursorIntoView(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !this.contentEditorRef) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
    const span = document.createElement('span');
    range.insertNode(span);
    span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    span.remove();
  }

  private insertAiMarker(): void {
    this.removeAiMarker();
    if (!this.inlineAiCursorRange || !this.contentEditorRef) return;
    if (this.inlineAiSelectedText()) return;
    const marker = document.createElement('span');
    marker.className = 'ai-insertion-marker';
    marker.setAttribute('data-ai-marker', '');
    // Inline styles because Angular view encapsulation won't scope to dynamic DOM nodes
    marker.style.display = 'inline-block';
    marker.style.width = '2px';
    marker.style.height = '1.2em';
    marker.style.verticalAlign = 'text-bottom';
    marker.style.background = '#6750a4';
    marker.style.borderRadius = '1px';
    marker.style.pointerEvents = 'none';
    marker.style.margin = '0 1px';
    marker.style.animation = 'ai-marker-blink 1s step-end infinite';
    const range = this.inlineAiCursorRange;
    range.insertNode(marker);
    // Re-position the saved range after the marker so insertion goes to the right place
    const newRange = document.createRange();
    newRange.setStartAfter(marker);
    newRange.collapse(true);
    this.inlineAiCursorRange = newRange;
  }

  private removeAiMarker(): void {
    if (!this.contentEditorRef) return;
    this.contentEditorRef.nativeElement
      .querySelectorAll('.ai-insertion-marker')
      .forEach((el: Element) => el.remove());
  }

  private authFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('app_auth_token');
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  private isImageRequest(text: string): boolean {
    return /\b(generate|create|draw|make|produce|illustrate)\b[\s\S]{0,60}\b(image|picture|illustration|artwork|photo|painting)\b/i.test(text) ||
           /\b(image|draw|illustrate|paint)\s*:/i.test(text);
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
    this.activateSidebarTab(0);
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

  // ── Grammar checking ────────────────────────────────────────────────────────

  scheduleGrammarCheck(): void {
    if (this.grammarTimer) clearTimeout(this.grammarTimer);
    this.grammarTimer = setTimeout(() => this.runGrammarCheck(), 750);
  }

  private async runGrammarCheck(): Promise<void> {
    this.grammarTimer = null;
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;

    const text = this.grammarService.extractCheckableText(editor);
    if (!text.trim()) {
      this.unwrapGrammarMarks();
      this.grammarLastCheckedText = '';
      return;
    }

    // Skip if the checkable text hasn't changed since the last completed check
    if (text === this.grammarLastCheckedText) return;

    // Abort any in-flight check before starting a new one
    this.grammarAbortController?.abort();
    this.grammarAbortController = new AbortController();
    this.grammarChecking.set(true);

    const knownEntityNames = this.entities().flatMap(e =>
      [e.name, e.firstName, e.lastName, e.nickname].filter((n): n is string => !!n)
    );
    const { errors, suggestedEntities } = await this.grammarService.check(text, knownEntityNames, this.grammarAbortController.signal);

    this.grammarChecking.set(false);
    this.grammarAbortController = null;
    this.grammarLastCheckedText = text;

    // Remove stale marks and apply fresh ones
    this.unwrapGrammarMarks();
    if (errors.length > 0) {
      this.applyGrammarMarks(errors);
    }

    // Track newly-discovered entity names so they are not suggested again
    if (suggestedEntities.length > 0) {
      suggestedEntities.forEach(s => this.suggestedEntityNames.add(s.name.toLowerCase()));
    }
  }

  private unwrapGrammarMarks(): void {
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;
    const marks = editor.querySelectorAll('mark.grammar-error');
    if (marks.length === 0) return;
    marks.forEach(mark => {
      const parent = mark.parentNode!;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    editor.normalize();
  }

  /** Returns the caret position as a plain-text character offset from the start
   *  of the editor, or null if the editor does not have focus / no selection. */
  private saveCaretOffset(editor: HTMLElement): number | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return null;
    const pre = document.createRange();
    pre.setStart(editor, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  /** Restores a caret position previously saved with saveCaretOffset. */
  private restoreCaretOffset(editor: HTMLElement, targetOffset: number): void {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let remaining = targetOffset;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (remaining <= node.length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
        return;
      }
      remaining -= node.length;
    }
  }

  private unwrapEntityQuotes(): void {
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;
    const quotes = editor.querySelectorAll('span.entity-quote');
    if (quotes.length === 0) return;
    quotes.forEach(span => {
      const parent = span.parentNode!;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    editor.normalize();
  }

  private applyEntityQuotes(): void {
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;

    // Scan the whole editor as one unit to avoid block-detection edge cases
    // (e.g. text sitting directly in the editor div alongside child blocks).
    const refSpans = Array.from(editor.querySelectorAll<HTMLElement>('span.entity-reference[data-id]'));
    if (refSpans.length === 0) return;

    // Build a flat text map of all text nodes in the editor
    interface TextSegment { node: Text; start: number; end: number; }
    const segments: TextSegment[] = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const len = textNode.length;
      segments.push({ node: textNode, start: offset, end: offset + len });
      offset += len;
    }
    const fullText = segments.map(s => s.node.textContent ?? '').join('');

    // Determine the character start offset of each entity-reference span
    const spanPositions: { entityId: string; charStart: number }[] = [];
    for (const refSpan of refSpans) {
      const sw = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let spanOffset = 0;
      let sNode: Text | null;
      while ((sNode = sw.nextNode() as Text | null)) {
        if (refSpan.contains(sNode)) {
          spanPositions.push({ entityId: refSpan.getAttribute('data-id')!, charStart: spanOffset });
          break;
        }
        spanOffset += sNode.length;
      }
    }
    spanPositions.sort((a, b) => a.charStart - b.charStart);

    // Collect ALL quote matches, attributing each to the nearest preceding entity
    const pending: { quoteStart: number; quoteEnd: number; entityId: string }[] = [];
    const quoteRe = /“([^”]*)”|"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = quoteRe.exec(fullText)) !== null) {
      const quoteStart = match.index;
      const quoteEnd = quoteStart + match[0].length;

      let attributedEntityId: string | null = null;
      for (let i = spanPositions.length - 1; i >= 0; i--) {
        if (spanPositions[i].charStart < quoteStart) {
          attributedEntityId = spanPositions[i].entityId;
          break;
        }
      }
      if (!attributedEntityId) continue;
      pending.push({ quoteStart, quoteEnd, entityId: attributedEntityId });
    }

    if (pending.length === 0) return;

    const findPos = (absPos: number): { node: Text; offset: number } | null => {
      for (const seg of segments) {
        if (absPos <= seg.end) return { node: seg.node, offset: absPos - seg.start };
      }
      return null;
    };

    // Apply rightmost first so earlier text-node splits don't invalidate later offsets
    for (const { quoteStart, quoteEnd, entityId } of [...pending].reverse()) {
      const startPos = findPos(quoteStart);
      const endPos = findPos(quoteEnd);
      if (!startPos || !endPos) continue;
      if (startPos.node.parentElement?.closest('span.entity-quote')) continue;
      try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        const wrap = document.createElement('span');
        wrap.className = 'entity-quote';
        wrap.setAttribute('data-quoted-entity-id', entityId);
        range.surroundContents(wrap);
      } catch {
        // range crosses element boundaries — skip
      }
    }
  }

  private applyGrammarMarks(errors: GrammarError[]): void {
    for (const error of errors) {
      this.markFirstOccurrence(error);
    }
  }

  private markFirstOccurrence(error: GrammarError): void {
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // Skip text inside entity references, note indicators, or existing marks
        if (parent.closest('.entity-reference, .note-indicator, mark')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const content = textNode.textContent ?? '';
      const idx = content.indexOf(error.text);
      if (idx === -1) continue;

      const range = document.createRange();
      range.setStart(textNode, idx);
      range.setEnd(textNode, idx + error.text.length);

      const mark = document.createElement('mark');
      mark.className = 'grammar-error';
      mark.setAttribute('data-grammar-suggestion', error.suggestion);
      mark.setAttribute('data-grammar-message', error.message);

      try {
        range.surroundContents(mark);
      } catch {
        // Skip if the range crosses element boundaries
      }
      break; // Mark only the first occurrence per error
    }
  }

  showGrammarPopover(event: MouseEvent, markEl: HTMLElement): void {
    const suggestion = markEl.getAttribute('data-grammar-suggestion') ?? '';
    const message = markEl.getAttribute('data-grammar-message') ?? '';
    this.grammarPopoverMarkEl = markEl;
    this.grammarPopoverError.set({ text: markEl.textContent ?? '', suggestion, message });

    const POPOVER_WIDTH = 280;
    const POPOVER_HEIGHT_EST = 130;
    const GAP = 6;
    const rect = markEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const above = rect.bottom + GAP + POPOVER_HEIGHT_EST > window.innerHeight;
    const top = above ? rect.top - GAP : rect.bottom + GAP;
    this.grammarPopoverTop.set(top);
    this.grammarPopoverLeft.set(left);
    this.grammarPopoverAbove.set(above);
    this.grammarPopoverVisible.set(true);
  }

  applyGrammarSuggestion(): void {
    const error = this.grammarPopoverError();
    const markEl = this.grammarPopoverMarkEl;
    if (!error || !markEl || !markEl.parentNode) return;

    const parent = markEl.parentNode!;
    const textNode = document.createTextNode(error.suggestion);
    parent.replaceChild(textNode, markEl);
    parent.normalize();

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

    this.dismissGrammarPopover();
    this.scheduleGrammarCheck();
  }

  dismissGrammarPopover(): void {
    this.grammarPopoverVisible.set(false);
    this.grammarPopoverError.set(null);
    this.grammarPopoverMarkEl = null;
  }

  private wrapEntityReferencesInEditor(entity: Entity): void {
    if (!this.contentEditorRef) return;
    const editor = this.contentEditorRef.nativeElement;

    // Clear grammar marks so their text nodes are accessible
    this.unwrapGrammarMarks();

    // Build all name variants with their reference types, longest first so the
    // regex prefers the longest match (e.g. "Jimmy Williams" over "Jimmy").
    const variants = this.buildEntityVariants(entity);
    if (variants.length === 0) return;

    const pattern = variants
      .map(v => v.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const searchRegex = new RegExp(pattern, 'gi');

    // Lowercase lookup: matched text → reference type
    const variantMap = new Map<string, EntityReference>(
      variants.map(v => [v.text.toLowerCase(), v.refType])
    );

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('.entity-reference, .note-indicator')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      searchRegex.lastIndex = 0;
      if (searchRegex.test(node.textContent ?? '')) textNodes.push(node);
    }

    for (const textNode of textNodes) {
      const content = textNode.textContent ?? '';
      const parent = textNode.parentNode!;
      const fragment = document.createDocumentFragment();
      let lastIdx = 0;
      let match: RegExpExecArray | null;
      searchRegex.lastIndex = 0;
      while ((match = searchRegex.exec(content)) !== null) {
        if (match.index > lastIdx) {
          fragment.appendChild(document.createTextNode(content.slice(lastIdx, match.index)));
        }
        const refType = variantMap.get(match[0].toLowerCase()) ?? 'full-name';
        const span = document.createElement('span');
        span.className = 'entity-reference';
        span.setAttribute('data-id', entity.id);
        span.setAttribute('data-reference-type', refType);
        span.textContent = match[0]; // preserve exact text typed by author
        fragment.appendChild(span);
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < content.length) {
        fragment.appendChild(document.createTextNode(content.slice(lastIdx)));
      }
      parent.replaceChild(fragment, textNode);
    }

    editor.normalize();
    this.editorContent = editor.innerHTML;
    const current = this.chapter();
    if (current) {
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        this.draftService.saveDraft(current.id, this.editorContent, this.notes());
        this.hasDraft.set(true);
      }, 800);
    }

    this.scheduleGrammarCheck();
  }

  private buildEntityVariants(entity: Entity): { text: string; refType: EntityReference }[] {
    const refs = this.resolvedRefs(entity);
    const pairs: { text: string; refType: EntityReference }[] = [];
    const seen = new Set<string>();

    const add = (text: string | undefined, refType: EntityReference) => {
      if (text?.trim() && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        pairs.push({ text, refType });
      }
    };

    // Add longest forms first so the regex alternation prefers them
    if (refs.title) add(`${refs.title} ${entity.name}`, 'title-full-name');
    if (refs.title && refs.lastName) add(`${refs.title} ${refs.lastName}`, 'title-last-name');
    add(entity.name, 'full-name');
    if (refs.firstName && refs.lastName) add(`${refs.firstName} ${refs.lastName}`, 'full-name');
    add(refs.nickname, 'nickname');
    add(refs.firstName, 'first-name');
    add(refs.lastName, 'last-name');

    // Sort descending by length so the combined regex always prefers longer matches
    return pairs.sort((a, b) => b.text.length - a.text.length);
  }
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">{{ data.confirm }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  data = inject<{ title: string; message: string; confirm: string }>(MAT_DIALOG_DATA);
}
