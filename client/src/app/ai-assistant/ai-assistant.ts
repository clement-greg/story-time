import {
  Component, inject, signal, computed, ViewChild, ElementRef, AfterViewChecked, OnInit,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { parse as parseMarkdown } from 'marked';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AiAssistantService } from '../services/ai-assistant.service';
import { ChatSessionSummary } from '@shared/models';

@Component({
  selector: 'app-ai-assistant',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './ai-assistant.html',
  styleUrl: './ai-assistant.css',
})
export class AiAssistantComponent implements OnInit, AfterViewChecked {
  @ViewChild('messagesEl') messagesEl?: ElementRef<HTMLDivElement>;

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

  private shouldScrollToBottom = false;
  private scrollSmooth = false;

  // Touch tracking — fixes iOS double-tap on draggable elements
  private touchStartY = 0;
  private lastTouchHandledAt = 0;

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

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom(this.scrollSmooth);
      this.shouldScrollToBottom = false;
      this.scrollSmooth = false;
    }
  }

  async newChat(): Promise<void> {
    await this.aiAssistant.createSession();
    this.input.set('');
    this.mobileSidebarOpen.set(false);
    this.shouldScrollToBottom = true;
  }

  async openSession(id: string): Promise<void> {
    await this.aiAssistant.openSession(id);
    this.input.set('');
    this.mobileSidebarOpen.set(false);
    // First pass: scroll after Angular renders the messages
    setTimeout(() => {
      this.scrollToBottom(true);
      // Second pass: scroll again after images/layout settle
      setTimeout(() => this.scrollToBottom(true), 400);
    });
  }

  async send(): Promise<void> {
    const text = this.input().trim();
    if (!text || this.aiAssistant.streaming()) return;
    this.input.set('');
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

  markdownToHtml(text: string): SafeHtml {
    const html = parseMarkdown(text) as string;
    return this.sanitizer.sanitize(1 /* SecurityContext.HTML */, html) ?? '';
  }

  private scrollToBottom(smooth = false): void {
    if (this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }
  }
}
