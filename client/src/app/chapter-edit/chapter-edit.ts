import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ChapterService } from '../chapter/chapter.service';
import { Chapter } from '@shared/models/chapter.model';

@Component({
  selector: 'app-chapter-edit',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './chapter-edit.html',
  styleUrl: './chapter-edit.css',
})
export class ChapterEditComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chapterService = inject(ChapterService);

  chapter = signal<Chapter | null>(null);
  saving = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.chapterService.getById(id).subscribe({
      next: (data) => this.chapter.set(data),
    });
  }

  updateTitle(value: string): void {
    const current = this.chapter();
    if (current) {
      this.chapter.set({ ...current, title: value });
    }
  }

  save(): void {
    const chapter = this.chapter();
    if (!chapter || !chapter.title.trim()) return;

    this.saving.set(true);
    this.chapterService.update(chapter).subscribe({
      next: () => {
        this.saving.set(false);
        this.goBack();
      },
      error: () => this.saving.set(false),
    });
  }

  goBack(): void {
    const chapter = this.chapter();
    if (chapter?.bookId) {
      this.router.navigate(['/books', chapter.bookId]);
    } else {
      this.router.navigate(['/series']);
    }
  }
}
