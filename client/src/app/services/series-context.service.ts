import { Injectable, signal } from '@angular/core';

/**
 * Tracks the series that is currently "in context" based on which page
 * the user is viewing. Page components (SeriesDetail, BookDetail, ChapterEdit)
 * push their resolved seriesId here via `set()`. The AI Assistant reads it
 * to auto-select the correct series when first opened.
 */
@Injectable({ providedIn: 'root' })
export class SeriesContextService {
  readonly currentSeriesId = signal<string | null>(null);

  set(id: string | null): void {
    this.currentSeriesId.set(id);
  }

  clear(): void {
    this.currentSeriesId.set(null);
  }
}
