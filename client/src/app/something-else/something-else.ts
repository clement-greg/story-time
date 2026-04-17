import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { SomethingElseService } from './something-else.service';
import { SomethingElse } from '@shared/models/something-else';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-something-else',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatListModule,
    MatCardModule,
  ],
  templateUrl: './something-else.html',
  styleUrl: './something-else.css',
})
export class SomethingElseComponent implements OnInit {
  private somethingElseService = inject(SomethingElseService);

  itemList = signal<SomethingElse[]>([]);
  editingItem = signal<SomethingElse | null>(null);
  newTitle = signal('');
  loading = signal(false);

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.loading.set(true);
    this.somethingElseService.getAll().subscribe({
      next: (data) => {
        this.itemList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  addItem(): void {
    const title = this.newTitle().trim();
    if (!title) return;

    const item: SomethingElse = { id: uuidv4(), title };
    this.somethingElseService.create(item).subscribe({
      next: (created) => {
        this.itemList.update((list) => [...list, created]);
        this.newTitle.set('');
      },
    });
  }

  startEdit(item: SomethingElse): void {
    this.editingItem.set({ ...item });
  }

  cancelEdit(): void {
    this.editingItem.set(null);
  }

  saveEdit(): void {
    const editing = this.editingItem();
    if (!editing || !editing.title.trim()) return;

    this.somethingElseService.update(editing).subscribe({
      next: (updated) => {
        this.itemList.update((list) =>
          list.map((i) => (i.id === updated.id ? updated : i))
        );
        this.editingItem.set(null);
      },
    });
  }

  deleteItem(id: string): void {
    this.somethingElseService.delete(id).subscribe({
      next: () => {
        this.itemList.update((list) => list.filter((i) => i.id !== id));
      },
    });
  }
}
