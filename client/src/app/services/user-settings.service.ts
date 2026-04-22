import { Injectable, signal } from '@angular/core';

export interface GhostCompleteItem {
  id: string;
  label: string;
  prompt: string;
}

const STORAGE_KEY = 'user_settings_ghost_complete';
const DARK_MODE_KEY = 'user_settings_dark_mode';
const DISPLAY_NAME_KEY = 'user_settings_display_name';
const AVATAR_URL_KEY = 'user_settings_avatar_url';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private _ghostCompleteItems = signal<GhostCompleteItem[]>(this.loadFromStorage());
  private _darkMode = signal<boolean>(localStorage.getItem(DARK_MODE_KEY) === 'true');
  private _displayName = signal<string>(localStorage.getItem(DISPLAY_NAME_KEY) ?? '');
  private _avatarUrl = signal<string>(localStorage.getItem(AVATAR_URL_KEY) ?? '');
  readonly darkMode = this._darkMode.asReadonly();
  readonly displayName = this._displayName.asReadonly();
  readonly avatarUrl = this._avatarUrl.asReadonly();

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

  setDarkMode(value: boolean): void {
    localStorage.setItem(DARK_MODE_KEY, String(value));
    this._darkMode.set(value);
  }

  setDisplayName(value: string): void {
    localStorage.setItem(DISPLAY_NAME_KEY, value);
    this._displayName.set(value);
  }

  setAvatarUrl(value: string): void {
    localStorage.setItem(AVATAR_URL_KEY, value);
    this._avatarUrl.set(value);
  }

  clearAvatarUrl(): void {
    localStorage.removeItem(AVATAR_URL_KEY);
    this._avatarUrl.set('');
  }

  getMatchingItems(input: string): GhostCompleteItem[] {
    const lower = input.toLowerCase().trim();
    if (!lower) return this._ghostCompleteItems();
    return this._ghostCompleteItems().filter(item =>
      item.label.toLowerCase().includes(lower) || item.prompt.toLowerCase().includes(lower)
    );
  }
}
