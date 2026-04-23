import {
  Component, inject, signal, computed, ViewChild, ElementRef, AfterViewChecked, OnInit, OnDestroy, HostListener, effect,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { parse as parseMarkdown } from 'marked';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiAssistantService } from '../services/ai-assistant.service';
import { ChatMessageHighlight, ChatSessionMessage, ChatSessionSummary } from '@shared/models';

@Component({
  selector: 'app-ai-assistant',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './ai-assistant.html',
  styleUrl: './ai-assistant.css',
})
export class AiAssistantComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messagesEl') messagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInputEl') chatInputEl?: ElementRef<HTMLTextAreaElement>;

  readonly aiAssistant = inject(AiAssistantService);
  private sanitizer = inject(DomSanitizer);

  readonly input = signal('');
  readonly renamingSessionId = signal<string | null>(null);
  readonly renameValue = signal('');

  // Drag-to-pin state
  readonly isDragOver = signal(false);
  readonly isUnpinDragOver = signal(false);
  private draggingSessionId: string | null = null;

  // Mobile sidebar drawer
  readonly mobileSidebarOpen = signal(false);

  // Highlight toolbar
  readonly highlightColors = [
    { value: '#ffe066', label: 'Yellow' },
    { value: '#b9fbc0', label: 'Green' },
    { value: '#b3d9ff', label: 'Blue' },
    { value: '#ffb3c6', label: 'Pink' },
  ];
  readonly highlightToolbar = signal<{ x: number; y: number; messageIndex: number } | null>(null);
  private pendingSelection: { startOffset: number; endOffset: number; messageIndex: number } | null = null;
  private readonly renderCache = new Map<string, SafeHtml>();

  // Highlight summary tray
  readonly showHighlightsSummary = signal(false);
  readonly activeHighlightId = signal<string | null>(null);
  readonly allHighlights = computed(() => {
    const session = this.aiAssistant.activeSession();
    if (!session) return [];
    const entries: Array<{ messageIndex: number; highlight: ChatMessageHighlight; excerpt: string }> = [];
    session.messages.forEach((msg, i) => {
      if (!msg.highlights?.length) return;
      const plain = this.getMessagePlainText(msg);
      for (const hl of msg.highlights) {
        const raw = plain.slice(hl.startOffset, hl.endOffset);
        const excerpt = raw.length > 90 ? raw.slice(0, 88) + '…' : raw;
        entries.push({ messageIndex: i, highlight: hl, excerpt });
      }
    });
    entries.sort((a, b) => a.messageIndex - b.messageIndex || a.highlight.startOffset - b.highlight.startOffset);
    return entries;
  });

  private shouldScrollToBottom = false;
  private scrollSmooth = false;
  private userScrolledUpDuringStream = false;
  private streamRafId: number | null = null;

  constructor() {
    // Start/stop the streaming scroll loop whenever streaming state changes
    effect(() => {
      if (this.aiAssistant.streaming()) {
        this.userScrolledUpDuringStream = false;
        this.startStreamScroll();
      } else {
        this.stopStreamScroll();
      }
    });
  }

  // Touch tracking — fixes iOS double-tap on draggable elements
  private touchStartY = 0;
  private lastTouchHandledAt = 0;

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const toolbarEl = document.querySelector('.highlight-toolbar');
    if (toolbarEl && !toolbarEl.contains(event.target as Node)) {
      window.getSelection()?.removeAllRanges();
      this.highlightToolbar.set(null);
      this.pendingSelection = null;
    }
  }

  onSessionTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0].clientY;
  }

  onSessionTouchEnd(id: string, event: TouchEvent): void {
    const dy = Math.abs(event.changedTouches[0].clientY - this.touchStartY);
    if (dy > 10) return; // was a scroll, not a tap
    event.preventDefault(); // suppress the ghost click that follows
    this.lastTouchHandledAt = Date.now();
    this.openSession(id);
  }

  onSessionClick(id: string): void {
    if (Date.now() - this.lastTouchHandledAt < 600) return; // already handled by touchend
    this.openSession(id);
  }

  readonly activeSessionId = computed(() => this.aiAssistant.activeSession()?.id ?? null);

  ngOnInit(): void {
    this.aiAssistant.loadSessions();
  }

  ngOnDestroy(): void {
    this.stopStreamScroll();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom(this.scrollSmooth);
      this.shouldScrollToBottom = false;
      this.scrollSmooth = false;
    }
  }

  async newChat(): Promise<void> {
    this.aiAssistant.startPendingSession();
    this.input.set('');
    this.mobileSidebarOpen.set(false);
    this.showHighlightsSummary.set(false);
    this.activeHighlightId.set(null);
    this.shouldScrollToBottom = true;
    setTimeout(() => this.chatInputEl?.nativeElement.focus());
  }

  async openSession(id: string): Promise<void> {
    await this.aiAssistant.openSession(id);
    this.input.set('');
    this.mobileSidebarOpen.set(false);
    this.showHighlightsSummary.set(false);
    this.activeHighlightId.set(null);
    // First pass: scroll after Angular renders the messages
    setTimeout(() => {
      this.scrollToBottom(true);
      this.chatInputEl?.nativeElement.focus();
      // Second pass: scroll again after images/layout settle
      setTimeout(() => this.scrollToBottom(true), 400);
    });
  }

  async send(): Promise<void> {
    const text = this.input().trim();
    if (!text || this.aiAssistant.streaming()) return;
    this.input.set('');
    this.userScrolledUpDuringStream = false;
    this.shouldScrollToBottom = true;
    await this.aiAssistant.sendMessage(text);
    this.shouldScrollToBottom = true;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  async togglePin(session: ChatSessionSummary, event: Event): Promise<void> {
    event.stopPropagation();
    await this.aiAssistant.togglePin(session.id);
  }

  async deleteSession(sessionId: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.aiAssistant.deleteSession(sessionId);
  }

  startRename(session: ChatSessionSummary, event: Event): void {
    event.stopPropagation();
    this.renamingSessionId.set(session.id);
    this.renameValue.set(session.name);
  }

  async commitRename(sessionId: string): Promise<void> {
    const name = this.renameValue().trim();
    if (name) {
      await this.aiAssistant.renameSession(sessionId, name);
    }
    this.renamingSessionId.set(null);
  }

  cancelRename(): void {
    this.renamingSessionId.set(null);
  }

  onRenameKeyDown(event: KeyboardEvent, sessionId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename(sessionId);
    } else if (event.key === 'Escape') {
      this.cancelRename();
    }
  }

  // ── Drag to pin ──────────────────────────────────────────────────────────

  onDragStart(event: DragEvent, sessionId: string): void {
    this.draggingSessionId = sessionId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', sessionId);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  onUnpinDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.isUnpinDragOver.set(true);
  }

  onUnpinDragLeave(): void {
    this.isUnpinDragOver.set(false);
  }

  async onDropToPin(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isDragOver.set(false);
    const id = this.draggingSessionId;
    if (!id) return;
    const session = this.aiAssistant.sessions().find(s => s.id === id);
    if (session && !session.pinned) {
      await this.aiAssistant.togglePin(id);
    }
    this.draggingSessionId = null;
  }

  async onDropToUnpin(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isUnpinDragOver.set(false);
    const id = this.draggingSessionId;
    if (!id) return;
    const session = this.aiAssistant.sessions().find(s => s.id === id);
    if (session && session.pinned) {
      await this.aiAssistant.togglePin(id);
    }
    this.draggingSessionId = null;
  }

  proxyUrl(azureUrl: string | undefined): string | null {
    if (!azureUrl) return null;
    const filename = azureUrl.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }

  // ── Highlight summary navigation ────────────────────────────────────────

  navigateToHighlight(messageIndex: number, highlightId: string): void {
    this.activeHighlightId.set(highlightId);
    const container = this.messagesEl?.nativeElement;
    if (!container) return;
    const markEl = container.querySelector(`mark[data-highlight-id="${highlightId}"]`) as HTMLElement | null;
    const target = markEl ?? (container.querySelector(`[data-msg-index="${messageIndex}"]`) as HTMLElement | null);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (markEl) {
      markEl.classList.remove('highlight-flash');
      // Force reflow so re-adding the class re-triggers the animation
      void markEl.offsetWidth;
      markEl.classList.add('highlight-flash');
    }
  }

  navigateToNextHighlight(): void {
    const all = this.allHighlights();
    if (!all.length) return;
    const activeId = this.activeHighlightId();
    const idx = all.findIndex(e => e.highlight.id === activeId);
    const next = all[(idx + 1) % all.length];
    this.navigateToHighlight(next.messageIndex, next.highlight.id);
  }

  navigateToPrevHighlight(): void {
    const all = this.allHighlights();
    if (!all.length) return;
    const activeId = this.activeHighlightId();
    const idx = all.findIndex(e => e.highlight.id === activeId);
    const prev = all[(idx - 1 + all.length) % all.length];
    this.navigateToHighlight(prev.messageIndex, prev.highlight.id);
  }

  private getMessagePlainText(msg: ChatSessionMessage): string {
    const rawHtml = parseMarkdown(msg.text) as string;
    const div = document.createElement('div');
    div.innerHTML = rawHtml;
    return div.textContent ?? '';
  }

  onMessagesMouseUp(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.highlightToolbar.set(null);
      this.pendingSelection = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const ancestor = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const markdownEl = ancestor?.closest('.chat-markdown') as HTMLElement | null;
    if (!markdownEl) {
      this.highlightToolbar.set(null);
      this.pendingSelection = null;
      return;
    }

    const msgEl = markdownEl.closest('[data-msg-index]') as HTMLElement | null;
    const messageIndex = msgEl ? parseInt(msgEl.dataset['msgIndex'] ?? '-1', 10) : -1;
    if (messageIndex < 0) {
      this.highlightToolbar.set(null);
      this.pendingSelection = null;
      return;
    }

    const startOffset = this.getTextOffset(markdownEl, range.startContainer, range.startOffset);
    const endOffset = this.getTextOffset(markdownEl, range.endContainer, range.endOffset);
    if (startOffset >= endOffset) {
      this.highlightToolbar.set(null);
      this.pendingSelection = null;
      return;
    }

    this.pendingSelection = { startOffset, endOffset, messageIndex };

    const rect = range.getBoundingClientRect();
    const toolbarWidth = 200;
    const toolbarHeight = 44;
    const margin = 8;

    let x = rect.left + rect.width / 2 - toolbarWidth / 2;
    let y = rect.top - toolbarHeight - margin;

    x = Math.max(margin, Math.min(x, window.innerWidth - toolbarWidth - margin));
    if (y < margin) {
      y = rect.bottom + margin;
    }
    y = Math.min(y, window.innerHeight - toolbarHeight - margin);

    this.highlightToolbar.set({ x, y, messageIndex });
  }

  private getTextOffset(root: Node, targetNode: Node, targetOffset: number): number {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node === targetNode) return offset + targetOffset;
      offset += node.textContent?.length ?? 0;
    }
    return offset + targetOffset;
  }

  async addHighlight(color: string): Promise<void> {
    if (!this.pendingSelection) return;
    const { startOffset, endOffset, messageIndex } = this.pendingSelection;
    const highlight: ChatMessageHighlight = {
      id: crypto.randomUUID(),
      startOffset,
      endOffset,
      color,
    };
    this.highlightToolbar.set(null);
    this.pendingSelection = null;
    window.getSelection()?.removeAllRanges();
    await this.aiAssistant.addHighlight(messageIndex, highlight);
  }

  async eraseHighlights(): Promise<void> {
    if (!this.pendingSelection) return;
    const { startOffset, endOffset, messageIndex } = this.pendingSelection;
    this.highlightToolbar.set(null);
    this.pendingSelection = null;
    window.getSelection()?.removeAllRanges();
    await this.aiAssistant.removeHighlightsInRange(messageIndex, startOffset, endOffset);
  }

  renderMessageHtml(msg: ChatSessionMessage, absoluteIndex: number): SafeHtml {
    const highlights = msg.highlights ?? [];
    const cacheKey = `${absoluteIndex}:${msg.text}:${JSON.stringify(highlights)}`;
    const cached = this.renderCache.get(cacheKey);
    if (cached) return cached;
    const rawHtml = parseMarkdown(msg.text) as string;
    const html = highlights.length
      ? this.applyHighlightsToHtml(rawHtml, highlights, absoluteIndex)
      : rawHtml;
    const result = this.sanitizer.bypassSecurityTrustHtml(html);
    this.renderCache.set(cacheKey, result);
    return result;
  }

  private applyHighlightsToHtml(rawHtml: string, highlights: ChatMessageHighlight[], msgIndex: number): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');
    const root = doc.body;
    // Process highest startOffset first to avoid cumulative offset drift
    const sorted = [...highlights].sort((a, b) => b.startOffset - a.startOffset);
    for (const hl of sorted) {
      this.applyHighlightNode(root, hl, msgIndex);
    }
    return root.innerHTML;
  }

  private applyHighlightNode(root: Element, hl: ChatMessageHighlight, msgIndex: number): void {
    const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    let cumOffset = 0;
    const toWrap: { node: Text; from: number; to: number }[] = [];

    for (const node of textNodes) {
      const len = node.length;
      const nodeStart = cumOffset;
      const nodeEnd = cumOffset + len;
      if (nodeEnd <= hl.startOffset || nodeStart >= hl.endOffset) {
        cumOffset += len;
        continue;
      }
      const from = Math.max(0, hl.startOffset - nodeStart);
      const to = Math.min(len, hl.endOffset - nodeStart);
      toWrap.push({ node, from, to });
      cumOffset += len;
    }

    // Apply right-to-left within each text node to keep earlier offsets valid
    for (const { node, from, to } of [...toWrap].reverse()) {
      const parent = node.parentNode;
      if (!parent) continue;
      try {
        const after = node.splitText(to);
        const highlighted = node.splitText(from);
        const mark = root.ownerDocument!.createElement('mark');
        mark.className = 'chat-highlight';
        mark.style.background = hl.color;
        mark.dataset['highlightId'] = hl.id;
        mark.dataset['msgIndex'] = String(msgIndex);
        parent.insertBefore(mark, after);
        mark.appendChild(highlighted);
      } catch {
        // Skip if DOM structure prevents wrapping (e.g. complex overlap)
      }
    }
  }

  private scrollToBottom(smooth = false): void {
    if (this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }
  }

  onMessagesScroll(): void {
    if (!this.aiAssistant.streaming() || !this.messagesEl) return;
    const el = this.messagesEl.nativeElement;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled more than 80px away from the bottom, stop auto-scrolling
    if (distanceFromBottom > 80) {
      this.userScrolledUpDuringStream = true;
    }
  }

  private startStreamScroll(): void {
    const tick = () => {
      if (!this.aiAssistant.streaming()) return;
      if (!this.userScrolledUpDuringStream && this.messagesEl) {
        const el = this.messagesEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
      this.streamRafId = requestAnimationFrame(tick);
    };
    this.streamRafId = requestAnimationFrame(tick);
  }

  private stopStreamScroll(): void {
    if (this.streamRafId !== null) {
      cancelAnimationFrame(this.streamRafId);
      this.streamRafId = null;
    }
  }
}
