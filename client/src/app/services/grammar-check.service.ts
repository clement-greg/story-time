import { Injectable } from '@angular/core';

export interface GrammarError {
  text: string;
  suggestion: string;
  message: string;
}

export interface SuggestedEntity {
  name: string;
  type: 'PERSON' | 'PLACE' | 'THING';
  description: string;
}

@Injectable({ providedIn: 'root' })
export class GrammarCheckService {
  private authFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const token = localStorage.getItem('app_auth_token');
    const headers = new Headers(init.headers as HeadersInit);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  async check(text: string, knownEntityNames: string[] = [], signal?: AbortSignal): Promise<{ errors: GrammarError[]; suggestedEntities: SuggestedEntity[] }> {
    try {
      const response = await this.authFetch('/api/grammar/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, knownEntityNames }),
        signal,
      });
      if (!response.ok) return { errors: [], suggestedEntities: [] };
      const data = await response.json() as { errors: GrammarError[]; suggestedEntities: SuggestedEntity[] };
      return {
        errors: Array.isArray(data.errors) ? data.errors : [],
        suggestedEntities: Array.isArray(data.suggestedEntities) ? data.suggestedEntities : [],
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return { errors: [], suggestedEntities: [] };
      return { errors: [], suggestedEntities: [] };
    }
  }

  /**
   * Extracts visible text from the editor, returning only paragraphs that
   * contain at least one complete sentence (ending in . ! or ?).
   * Incomplete sentences (currently being typed) are excluded.
   */
  extractCheckableText(editorEl: HTMLElement): string {
    const fullText = editorEl.innerText ?? '';
    const paragraphs = fullText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
    const complete = paragraphs.filter(p => /[.!?]['"»\u201d\u2019]?\s*$/.test(p));
    return complete.join('\n\n');
  }
}
