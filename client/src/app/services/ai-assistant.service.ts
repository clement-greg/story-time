import { Injectable, signal, computed } from '@angular/core';
import { ChatSession, ChatSessionMessage, ChatSessionSummary } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class AiAssistantService {
  // Panel open/closed state
  readonly isOpen = signal(false);

  // All session summaries (used for the sidebar list)
  readonly sessions = signal<ChatSessionSummary[]>([]);

  // The currently active full session
  readonly activeSession = signal<ChatSession | null>(null);

  // True while streaming a response
  readonly streaming = signal(false);

  readonly pinnedSessions = computed(() =>
    this.sessions().filter(s => s.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );

  readonly recentSessions = computed(() =>
    this.sessions().filter(s => !s.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );

  togglePanel(): void {
    const opening = !this.isOpen();
    this.isOpen.set(opening);
    if (opening && this.sessions().length === 0) {
      this.loadSessions();
    }
  }

  openPanel(): void {
    this.isOpen.set(true);
    if (this.sessions().length === 0) {
      this.loadSessions();
    }
  }

  closePanel(): void {
    this.isOpen.set(false);
  }

  async loadSessions(): Promise<void> {
    try {
      const res = await this.authFetch('/api/chat-sessions');
      if (res.ok) {
        const data = await res.json() as ChatSessionSummary[];
        this.sessions.set(data);
      }
    } catch {
      // Best-effort
    }
  }

  async createSession(): Promise<ChatSession | null> {
    try {
      const res = await this.authFetch('/api/chat-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const session = await res.json() as ChatSession;
        const summary: ChatSessionSummary = {
          id: session.id,
          name: session.name,
          pinned: session.pinned,
          updatedAt: session.updatedAt,
        };
        this.sessions.update(list => [summary, ...list]);
        this.activeSession.set(session);
        return session;
      }
    } catch {
      // Fall through
    }
    return null;
  }

  async openSession(id: string): Promise<void> {
    try {
      const res = await this.authFetch(`/api/chat-sessions/${id}`);
      if (res.ok) {
        const session = await res.json() as ChatSession;
        this.activeSession.set(session);
      }
    } catch {
      // Best-effort
    }
  }

  async togglePin(sessionId: string): Promise<void> {
    const summary = this.sessions().find(s => s.id === sessionId);
    if (!summary) return;
    const newPinned = !summary.pinned;
    try {
      await this.authFetch(`/api/chat-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: newPinned }),
      });
      this.sessions.update(list =>
        list.map(s => s.id === sessionId ? { ...s, pinned: newPinned } : s)
      );
    } catch {
      // Best-effort
    }
  }

  async renameSession(sessionId: string, name: string): Promise<void> {
    try {
      await this.authFetch(`/api/chat-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      this.sessions.update(list =>
        list.map(s => s.id === sessionId ? { ...s, name } : s)
      );
      const active = this.activeSession();
      if (active?.id === sessionId) {
        this.activeSession.set({ ...active, name });
      }
    } catch {
      // Best-effort
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.authFetch(`/api/chat-sessions/${sessionId}`, { method: 'DELETE' });
      this.sessions.update(list => list.filter(s => s.id !== sessionId));
      if (this.activeSession()?.id === sessionId) {
        this.activeSession.set(null);
      }
    } catch {
      // Best-effort
    }
  }

  private abortController: AbortController | null = null;

  private isImageRequest(text: string): boolean {
    return /\b(generate|create|draw|make|produce|illustrate)\b[\s\S]{0,60}\b(image|picture|illustration|artwork|photo|painting|photograph)\b/i.test(text) ||
           /\b(image|draw|illustrate|paint|photo)\s*:/i.test(text);
  }

  async sendMessage(text: string): Promise<void> {
    const session = this.activeSession();
    if (!session || this.streaming()) return;

    const userMsg: ChatSessionMessage = { role: 'user', text };
    const updatedMessages: ChatSessionMessage[] = [...session.messages, userMsg];

    // ── Image generation path ────────────────────────────────────────────────
    if (this.isImageRequest(text)) {
      const generatingPlaceholder: ChatSessionMessage = { role: 'assistant', text: 'Generating image…', generatingImage: true };
      this.activeSession.set({ ...session, messages: [...updatedMessages, generatingPlaceholder] });
      this.streaming.set(true);

      try {
        const imgRes = await this.authFetch('/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json() as { url: string; thumbnailUrl: string };
          this.updateLastAssistantMessage('');
          this.setLastAssistantImageUrl(imgData.url);
        } else {
          this.updateLastAssistantMessage('Error: image generation failed.');
          this.clearLastAssistantGenerating();
        }
      } catch {
        this.updateLastAssistantMessage('Error: could not connect to image generation service.');
        this.clearLastAssistantGenerating();
      } finally {
        this.streaming.set(false);
        await this.persistSessionMessages(session.id);
        if (session.name === 'New Chat' && updatedMessages.length === 1) {
          this.autoNameSession(session.id, updatedMessages.map(m => ({ role: m.role, content: m.text })));
        }
      }
      return;
    }

    // ── Text streaming path ──────────────────────────────────────────────────
    const assistantPlaceholder: ChatSessionMessage = { role: 'assistant', text: '' };

    this.activeSession.set({ ...session, messages: [...updatedMessages, assistantPlaceholder] });
    this.streaming.set(true);

    const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.text }));

    this.abortController = new AbortController();

    try {
      const res = await this.authFetch(`/api/chat-sessions/${session.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        this.updateLastAssistantMessage('Error: failed to get a response.');
        return;
      }

      const reader = res.body.getReader();
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
              this.updateLastAssistantMessage(`Error: ${parsed.error}`);
            } else if (parsed.content) {
              this.appendToLastAssistantMessage(parsed.content);
            }
          } catch {
            // Skip malformed SSE chunk
          }
        }
      }

      // Persist the completed exchange
      await this.persistSessionMessages(session.id);

      // Auto-name the session after the first exchange
      if (session.name === 'New Chat' && updatedMessages.length === 1) {
        this.autoNameSession(session.id, apiMessages);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        this.updateLastAssistantMessage('Error: could not connect to AI.');
      }
    } finally {
      this.streaming.set(false);
      this.abortController = null;
    }
  }

  private async persistSessionMessages(sessionId: string): Promise<void> {
    const finalSession = this.activeSession();
    if (!finalSession) return;
    const persistMessages = finalSession.messages
      .filter(m => m.text || m.imageUrl)
      .map(({ role, text, imageUrl }) => ({ role, text, ...(imageUrl ? { imageUrl } : {}) }));
    try {
      await this.authFetch(`/api/chat-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: persistMessages }),
      });
    } catch {
      // Best-effort
    }
    const now = new Date().toISOString();
    this.sessions.update(list =>
      list.map(s => s.id === sessionId ? { ...s, updatedAt: now } : s)
    );
  }

  private setLastAssistantImageUrl(imageUrl: string): void {
    this.activeSession.update(s => {
      if (!s) return s;
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = { role: 'assistant', text: '', imageUrl, generatingImage: false };
      return { ...s, messages: msgs };
    });
  }

  private clearLastAssistantGenerating(): void {
    this.activeSession.update(s => {
      if (!s) return s;
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], generatingImage: false };
      return { ...s, messages: msgs };
    });
  }

  private async autoNameSession(
    sessionId: string,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    try {
      const res = await this.authFetch(`/api/chat-sessions/${sessionId}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });
      if (res.ok) {
        const { name } = await res.json() as { name: string };
        this.sessions.update(list =>
          list.map(s => s.id === sessionId ? { ...s, name } : s)
        );
        const active = this.activeSession();
        if (active?.id === sessionId) {
          this.activeSession.set({ ...active, name });
        }
      }
    } catch {
      // Best-effort
    }
  }

  cancelStreaming(): void {
    this.abortController?.abort();
  }

  private updateLastAssistantMessage(text: string): void {
    this.activeSession.update(s => {
      if (!s) return s;
      const msgs = [...s.messages];
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], text };
      return { ...s, messages: msgs };
    });
  }

  private appendToLastAssistantMessage(delta: string): void {
    this.activeSession.update(s => {
      if (!s) return s;
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      msgs[msgs.length - 1] = { ...last, text: last.text + delta };
      return { ...s, messages: msgs };
    });
  }

  private authFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('app_auth_token');
    const headers = new Headers(init.headers as HeadersInit);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
}
