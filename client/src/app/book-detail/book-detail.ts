import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { BookService } from '../book/book.service';
import { ChapterService } from '../chapter/chapter.service';
import { SeriesService } from '../series/series.service';
import { Book } from '@shared/models/book.model';
import { Chapter } from '@shared/models/chapter.model';
import { v4 as uuidv4 } from 'uuid';
import { HeaderService } from '../services/header.service';
import { EntityPanelService } from '../services/entity-panel.service';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';

@Component({
  selector: 'app-book-detail',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    DragDropModule,
    SlideOutPanelContainer,
  ],
  templateUrl: './book-detail.html',
  styleUrl: './book-detail.css',
})
export class BookDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookService = inject(BookService);
  private chapterService = inject(ChapterService);
  private seriesService = inject(SeriesService);
  private headerService = inject(HeaderService);
  private entityPanel = inject(EntityPanelService);

  book = signal<Book | null>(null);
  chapterList = signal<Chapter[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingBook = signal<Book | null>(null);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

  get rightPanelWidth(): number {
    return 420;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadBook(id);
    this.loadChapters(id);
  }

  loadBook(id: string): void {
    this.bookService.getById(id).subscribe({
      next: (data) => {
        this.book.set(data);
        this.seriesService.getById(data.seriesId).subscribe({
          next: (series) => {
            this.headerService.set(
              [{ label: series.title, link: '/series/' + series.id }, { label: data.title }],
              [{ icon: 'people', label: 'Entities', action: () => this.entityPanel.open(series.id) }]
            );
          },
        });
      },
    });
  }

  loadChapters(id: string): void {
    this.loading.set(true);
    this.chapterService.getByBook(id).subscribe({
      next: (data) => {
        const sorted = [...data].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
        this.chapterList.set(sorted);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openEditBook(): void {
    const b = this.book();
    if (!b) return;
    this.editingBook.set({ ...b });
    this.thumbnailPreview.set(this.proxyUrl(b.thumnailUrl));
    this.showPanel.set(true);
  }

  onPanelChanged(open: boolean): void {
    this.showPanel.set(open);
    if (!open) {
      this.editingBook.set(null);
      this.thumbnailPreview.set(null);
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingBook.set(null);
    this.thumbnailPreview.set(null);
  }

  updateTitle(value: string): void {
    const current = this.editingBook();
    if (current) {
      this.editingBook.set({ ...current, title: value });
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => this.thumbnailPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.uploading.set(true);
    this.bookService.uploadThumbnail(file).subscribe({
      next: ({ url, thumbnailUrl }) => {
        const current = this.editingBook();
        if (current) {
          this.editingBook.set({ ...current, thumnailUrl: thumbnailUrl, originalUrl: url });
        }
        this.thumbnailPreview.set(this.proxyUrl(thumbnailUrl));
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }

  saveEdit(): void {
    const editing = this.editingBook();
    if (!editing || !editing.title.trim()) return;
    this.bookService.update(editing).subscribe({
      next: (updated) => {
        this.book.set(updated);
        this.closePanel();
      },
    });
  }

  openChapter(chapter: Chapter): void {
    this.router.navigate(['/chapters', chapter.id, 'edit']);
  }

  addChapter(): void {
    const book = this.book();
    if (!book) return;
    const newChapter: Chapter = { id: uuidv4(), title: 'New Chapter', bookId: book.id, sortOrder: this.chapterList().length };
    this.chapterService.create(newChapter).subscribe({
      next: (created) => {
        this.chapterList.update((list) => [...list, created]);
        this.router.navigate(['/chapters', created.id, 'edit']);
      },
    });
  }

  onDrop(event: CdkDragDrop<Chapter[]>): void {
    const list = [...this.chapterList()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.chapterList.set(list);
    const reordered = list.map((c, i) => ({ id: c.id, sortOrder: i }));
    this.chapterService.reorder(reordered).subscribe();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }

  proxyUrl(azureUrl: string | undefined): string | null {
    if (!azureUrl) return null;
    const filename = azureUrl.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }

  goBack(): void {
    const book = this.book();
    if (book?.seriesId) {
      this.router.navigate(['/series', book.seriesId]);
    } else {
      this.router.navigate(['/series']);
    }
  }
}
