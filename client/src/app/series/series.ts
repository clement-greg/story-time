import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { TextFieldModule } from '@angular/cdk/text-field';
import { SeriesService } from './series.service';
import { AuthService } from '../auth/auth.service';
import { Series } from '@shared/models/series.model';
import { v4 as uuidv4 } from 'uuid';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';

@Component({
  selector: 'app-series',
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
    MatDividerModule,
    MatChipsModule,
    TextFieldModule,
    SlideOutPanelContainer,
  ],
  templateUrl: './series.html',
  styleUrl: './series.scss',
})
export class SeriesComponent implements OnInit {
  private seriesService = inject(SeriesService);
  private authService = inject(AuthService);
  private router = inject(Router);

  seriesList = signal<Series[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingSeries = signal<Series | null>(null);
  isNew = signal(false);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

  generatingPrompt = signal(false);

  newCollaboratorEmail = signal('');
  collaboratorError = signal<string | null>(null);

  ownedSeries = computed(() => {
    const email = this.authService.currentUser()?.email;
    return this.seriesList().filter(s => s.owner === email);
  });

  sharedSeries = computed(() => {
    const email = this.authService.currentUser()?.email;
    return this.seriesList().filter(s => s.owner !== email);
  });

  ngOnInit(): void {
    this.loadSeries();
  }

  loadSeries(): void {
    this.loading.set(true);
    this.seriesService.getAll().subscribe({
      next: (data) => {
        this.seriesList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.editingSeries.set({ id: '', title: '', thumnailUrl: '' });
    this.isNew.set(true);
    this.thumbnailPreview.set(null);
    this.showPanel.set(true);
  }

  openEdit(series: Series): void {
    this.editingSeries.set({ ...series });
    this.isNew.set(false);
    this.thumbnailPreview.set(this.proxyUrl(series.thumnailUrl));
    this.showPanel.set(true);
  }

  onPanelChanged(open: boolean): void {
    this.showPanel.set(open);
    if (!open) {
      this.editingSeries.set(null);
      this.thumbnailPreview.set(null);
      this.newCollaboratorEmail.set('');
      this.collaboratorError.set(null);
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingSeries.set(null);
    this.thumbnailPreview.set(null);
    this.newCollaboratorEmail.set('');
    this.collaboratorError.set(null);
  }

  updateTitle(value: string): void {
    const current = this.editingSeries();
    if (current) {
      this.editingSeries.set({ ...current, title: value });
    }
  }

  updateSystemPrompt(value: string): void {
    const current = this.editingSeries();
    if (current) {
      this.editingSeries.set({ ...current, systemPrompt: value });
    }
  }

  generateSystemPrompt(): void {
    const s = this.editingSeries();
    if (!s) return;
    this.generatingPrompt.set(true);
    this.seriesService.generateSystemPrompt(s.id, s.systemPrompt ?? '').subscribe({
      next: ({ systemPrompt }) => {
        this.editingSeries.set({ ...s, systemPrompt });
        this.generatingPrompt.set(false);
      },
      error: () => this.generatingPrompt.set(false),
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = () => this.thumbnailPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    // Upload to Azure
    this.uploading.set(true);
    this.seriesService.uploadThumbnail(file).subscribe({
      next: ({ url, thumbnailUrl }) => {
        const current = this.editingSeries();
        if (current) {
          this.editingSeries.set({ ...current, thumnailUrl: thumbnailUrl, originalUrl: url });
        }
        // Switch preview from local data URL to the proxy URL
        this.thumbnailPreview.set(this.proxyUrl(thumbnailUrl));
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }

  saveEdit(): void {
    const editing = this.editingSeries();
    if (!editing || !editing.title.trim()) return;

    if (this.isNew()) {
      const series: Series = { ...editing, id: uuidv4() };
      this.seriesService.create(series).subscribe({
        next: (created) => {
          this.seriesList.update((list) => [...list, created]);
          this.closePanel();
        },
      });
    } else {
      this.seriesService.update(editing).subscribe({
        next: (updated) => {
          this.seriesList.update((list) =>
            list.map((s) => (s.id === updated.id ? updated : s))
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

  addCollaborator(): void {
    const s = this.editingSeries();
    const email = this.newCollaboratorEmail().trim();
    if (!s || !email) return;
    this.collaboratorError.set(null);
    this.seriesService.addCollaborator(s.id, email).subscribe({
      next: (updated) => {
        this.editingSeries.set(updated);
        this.seriesList.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.newCollaboratorEmail.set('');
      },
      error: (err) => {
        this.collaboratorError.set(err?.error?.error ?? 'Failed to add collaborator');
      },
    });
  }

  removeCollaborator(email: string): void {
    const s = this.editingSeries();
    if (!s) return;
    this.seriesService.removeCollaborator(s.id, email).subscribe({
      next: (updated) => {
        this.editingSeries.set(updated);
        this.seriesList.update(list => list.map(x => x.id === updated.id ? updated : x));
      },
    });
 }

  navigateToDetail(seriesId: string): void {
    this.router.navigate(['/series', seriesId]);
  }

}

