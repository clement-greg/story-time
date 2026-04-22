import { Injectable, signal } from '@angular/core';

export interface GhostCompleteItem {
  id: string;
  label: string;
  prompt: string;
}

const STORAGE_KEY = 'user_settings_ghost_complete';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private _ghostCompleteItems = signal<GhostCompleteItem[]>(this.loadFromStorage());

  readonly ghostCompleteItems = this._ghostCompleteItems.asReadonly();

  private loadFromStorage(): GhostCompleteItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as GhostCompleteItem[]) : [];
    } catch {
      return [];
    }
  }

  private save(items: GhostCompleteItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    this._ghostCompleteItems.set(items);
  }

  addItem(label: string, prompt: string): void {
    const item: GhostCompleteItem = { id: crypto.randomUUID(), label: label.trim(), prompt: prompt.trim() };
    this.save([...this._ghostCompleteItems(), item]);
  }

  updateItem(id: string, label: string, prompt: string): void {
    this.save(this._ghostCompleteItems().map(item =>
      item.id === id ? { ...item, label: label.trim(), prompt: prompt.trim() } : item
    ));
  }

  removeItem(id: string): void {
    this.save(this._ghostCompleteItems().filter(item => item.id !== id));
  }

  reorderItems(items: GhostCompleteItem[]): void {
    this.save(items);
  }

  getMatchingItems(input: string): GhostCompleteItem[] {
    const lower = input.toLowerCase().trim();
    if (!lower) return this._ghostCompleteItems();
    return this._ghostCompleteItems().filter(item =>
      item.label.toLowerCase().includes(lower) || item.prompt.toLowerCase().includes(lower)
    );
  }
}
