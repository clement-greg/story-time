import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SeriesService } from '../series/series.service';
import { BookService } from '../book/book.service';
import { EntityService } from '../services/entity.service';
import { HeaderService } from '../services/header.service';
import { Series } from '@shared/models/series.model';
import { Book } from '@shared/models/book.model';
import { Entity } from '@shared/models/entity.model';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-archived',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './archived.html',
  styleUrl: './archived.css',
})
export class ArchivedComponent implements OnInit {
  private seriesService = inject(SeriesService);
  private bookService = inject(BookService);
  private entityService = inject(EntityService);
  private headerService = inject(HeaderService);
  private router = inject(Router);

  loading = signal(false);
  archivedSeries = signal<Series[]>([]);
  archivedBooks = signal<Book[]>([]);
  archivedEntities = signal<Entity[]>([]);

  ngOnInit(): void {
    this.headerService.set([{ label: 'Archived Items' }], []);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    forkJoin({
      series: this.seriesService.getArchived(),
      books: this.bookService.getArchived(),
      entities: this.entityService.getAllArchived(),
    }).subscribe({
      next: ({ series, books, entities }) => {
        this.archivedSeries.set(series);
        this.archivedBooks.set(books);
        this.archivedEntities.set(entities);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  unarchiveSeries(id: string): void {
    this.seriesService.unarchive(id).subscribe({
      next: () => this.archivedSeries.update(list => list.filter(s => s.id !== id)),
    });
  }

  unarchiveBook(id: string): void {
    this.bookService.unarchive(id).subscribe({
      next: () => this.archivedBooks.update(list => list.filter(b => b.id !== id)),
    });
  }

  unarchiveEntity(id: string): void {
    this.entityService.unarchive(id).subscribe({
      next: () => this.archivedEntities.update(list => list.filter(e => e.id !== id)),
    });
  }

  proxyUrl(url: string | undefined): string | null {
    if (!url) return null;
    const filename = url.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }
}
