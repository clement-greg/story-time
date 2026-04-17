import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { SeriesService } from '../series/series.service';
import { BookService } from '../book/book.service';
import { EntityService } from '../entity/entity.service';
import { Series } from '@shared/models/series.model';
import { Book } from '@shared/models/book.model';
import { Entity } from '@shared/models/entity.model';
import { v4 as uuidv4 } from 'uuid';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';

@Component({
  selector: 'app-series-detail',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatSelectModule,
    SlideOutPanelContainer,
  ],
  templateUrl: './series-detail.html',
  styleUrl: './series-detail.css',
})
export class SeriesDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private seriesService = inject(SeriesService);
  private bookService = inject(BookService);
  private entityService = inject(EntityService);

  series = signal<Series | null>(null);
  bookList = signal<Book[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingBook = signal<Book | null>(null);
  isNew = signal(false);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

  panelMode = signal<'book' | 'entity' | null>(null);
  entityList = signal<Entity[]>([]);
  editingEntity = signal<Entity | null>(null);
  newEntityName = signal('');
  newEntityType = signal<Entity['type']>('PERSON');
  entityLoading = signal(false);
  readonly entityTypes: Entity['type'][] = ['PERSON', 'PLACE', 'THING'];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadSeries(id);
    this.loadBooks(id);
  }

  loadSeries(id: string): void {
    this.seriesService.getById(id).subscribe({
      next: (data) => this.series.set(data),
    });
  }

  loadBooks(id: string): void {
    this.loading.set(true);
    this.bookService.getBySeries(id).subscribe({
      next: (data) => {
        this.bookList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    const s = this.series();
    if (!s) return;
    this.editingBook.set({ id: '', title: '', seriesId: s.id });
    this.isNew.set(true);
    this.thumbnailPreview.set(null);
    this.panelMode.set('book');
    this.showPanel.set(true);
  }

  openEdit(book: Book): void {
    this.editingBook.set({ ...book });
    this.isNew.set(false);
    this.thumbnailPreview.set(this.proxyUrl(book.thumnailUrl));
    this.panelMode.set('book');
    this.showPanel.set(true);
  }

  openBook(book: Book): void {
    this.router.navigate(['/books', book.id]);
  }

  onPanelChanged(open: boolean): void {
    this.showPanel.set(open);
    if (!open) {
      this.editingBook.set(null);
      this.thumbnailPreview.set(null);
      this.panelMode.set(null);
      this.editingEntity.set(null);
      this.newEntityName.set('');
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingBook.set(null);
    this.editingEntity.set(null);
    this.newEntityName.set('');
    this.thumbnailPreview.set(null);
    this.panelMode.set(null);
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

    if (this.isNew()) {
      const book: Book = { ...editing, id: uuidv4() };
      this.bookService.create(book).subscribe({
        next: (created) => {
          this.bookList.update((list) => [...list, created]);
          this.closePanel();
        },
      });
    } else {
      this.bookService.update(editing).subscribe({
        next: (updated) => {
          this.bookList.update((list) =>
            list.map((b) => (b.id === updated.id ? updated : b))
          );
          this.closePanel();
        },
      });
    }
  }

  proxyUrl(azureUrl: string | undefined): string | null {
    if (!azureUrl) return null;
    const filename = azureUrl.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }

  openEntities(): void {
    const s = this.series();
    if (!s) return;
    this.editingBook.set(null);
    this.thumbnailPreview.set(null);
    this.panelMode.set('entity');
    this.showPanel.set(true);
    this.loadEntities(s.id);
  }

  loadEntities(seriesId: string): void {
    this.entityLoading.set(true);
    this.entityService.getBySeries(seriesId).subscribe({
      next: (data) => {
        this.entityList.set(data);
        this.entityLoading.set(false);
      },
      error: () => this.entityLoading.set(false),
    });
  }

  addEntity(): void {
    const s = this.series();
    const name = this.newEntityName().trim();
    if (!name || !s) return;

    const entity: Entity = { id: uuidv4(), name, type: this.newEntityType(), seriesId: s.id };
    this.entityService.create(entity).subscribe({
      next: (created) => {
        this.entityList.update((list) => [...list, created]);
        this.newEntityName.set('');
      },
    });
  }

  startEditEntity(entity: Entity): void {
    this.editingEntity.set({ ...entity });
  }

  cancelEditEntity(): void {
    this.editingEntity.set(null);
  }

  saveEntityEdit(): void {
    const editing = this.editingEntity();
    if (!editing || !editing.name.trim()) return;

    this.entityService.update(editing).subscribe({
      next: (updated) => {
        this.entityList.update((list) =>
          list.map((e) => (e.id === updated.id ? updated : e))
        );
        this.editingEntity.set(null);
      },
    });
  }

  deleteEntity(id: string): void {
    this.entityService.delete(id).subscribe({
      next: () => {
        this.entityList.update((list) => list.filter((e) => e.id !== id));
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/series']);
  }
}
