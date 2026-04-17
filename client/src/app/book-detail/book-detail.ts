import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { BookService } from '../book/book.service';
import { ChapterService } from '../chapter/chapter.service';
import { Book } from '@shared/models/book.model';
import { Chapter } from '@shared/models/chapter.model';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-book-detail',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
  ],
  templateUrl: './book-detail.html',
  styleUrl: './book-detail.css',
})
export class BookDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookService = inject(BookService);
  private chapterService = inject(ChapterService);

  book = signal<Book | null>(null);
  chapterList = signal<Chapter[]>([]);
  loading = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadBook(id);
    this.loadChapters(id);
  }

  loadBook(id: string): void {
    this.bookService.getById(id).subscribe({
      next: (data) => this.book.set(data),
    });
  }

  loadChapters(id: string): void {
    this.loading.set(true);
    this.chapterService.getByBook(id).subscribe({
      next: (data) => {
        this.chapterList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openChapter(chapter: Chapter): void {
    this.router.navigate(['/chapters', chapter.id, 'edit']);
  }

  addChapter(): void {
    const book = this.book();
    if (!book) return;
    const newChapter: Chapter = { id: uuidv4(), title: 'New Chapter', bookId: book.id };
    this.chapterService.create(newChapter).subscribe({
      next: (created) => {
        this.chapterList.update((list) => [...list, created]);
        this.router.navigate(['/chapters', created.id, 'edit']);
      },
    });
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
