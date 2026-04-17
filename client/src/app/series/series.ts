import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SeriesService } from './series.service';
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
    SlideOutPanelContainer,
  ],
  templateUrl: './series.html',
  styleUrl: './series.css',
})
export class SeriesComponent implements OnInit {
  private seriesService = inject(SeriesService);
  private router = inject(Router);

  seriesList = signal<Series[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingSeries = signal<Series | null>(null);
  isNew = signal(false);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

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
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingSeries.set(null);
    this.thumbnailPreview.set(null);
  }

  updateTitle(value: string): void {
    const current = this.editingSeries();
    if (current) {
      this.editingSeries.set({ ...current, title: value });
    }
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

  navigateToDetail(seriesId: string): void {
    this.router.navigate(['/series', seriesId]);
  }
}

