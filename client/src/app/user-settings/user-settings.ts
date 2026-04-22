import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserSettingsService, GhostCompleteItem } from '../services/user-settings.service';
import { HeaderService } from '../services/header.service';

@Component({
  selector: 'app-user-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: './user-settings.html',
  styleUrl: './user-settings.css',
})
export class UserSettingsComponent {
  private settingsService = inject(UserSettingsService);
  private snackBar = inject(MatSnackBar);
  private headerService = inject(HeaderService);

  readonly items = this.settingsService.ghostCompleteItems;

  // New item form
  newLabel = signal('');
  newPrompt = signal('');

  // Inline editing
  editingId = signal<string | null>(null);
  editLabel = signal('');
  editPrompt = signal('');

  constructor() {
    this.headerService.set([{ label: 'Settings' }]);
  }

  addItem(): void {
    const label = this.newLabel().trim();
    const prompt = this.newPrompt().trim();
    if (!label || !prompt) {
      this.snackBar.open('Label and prompt are required.', undefined, { duration: 3000 });
      return;
    }
    this.settingsService.addItem(label, prompt);
    this.newLabel.set('');
    this.newPrompt.set('');
    this.snackBar.open('Ghost complete item added.', undefined, { duration: 2000 });
  }

  startEdit(item: GhostCompleteItem): void {
    this.editingId.set(item.id);
    this.editLabel.set(item.label);
    this.editPrompt.set(item.prompt);
  }

  saveEdit(): void {
    const id = this.editingId();
    if (!id) return;
    const label = this.editLabel().trim();
    const prompt = this.editPrompt().trim();
    if (!label || !prompt) {
      this.snackBar.open('Label and prompt are required.', undefined, { duration: 3000 });
      return;
    }
    this.settingsService.updateItem(id, label, prompt);
    this.editingId.set(null);
    this.snackBar.open('Item updated.', undefined, { duration: 2000 });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  removeItem(id: string): void {
    this.settingsService.removeItem(id);
    this.snackBar.open('Item removed.', undefined, { duration: 2000 });
  }
}
