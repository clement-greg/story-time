import { Component, inject, signal, OnInit } from '@angular/core';
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
import { TextFieldModule } from '@angular/cdk/text-field';
import { SeriesService } from './series.service';
import { Series } from '@shared/models/series.model';
import { v4 as uuidv4 } from 'uuid';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';
import { EntityService } from '../services/entity.service';
import { Entity } from '@shared/models/entity.model';
import { EntityEditComponent } from '../entity-edit/entity-edit';

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
    TextFieldModule,
    SlideOutPanelContainer,
    EntityEditComponent,
  ],
  templateUrl: './series.html',
  styleUrl: './series.css',
})
export class SeriesComponent implements OnInit {
  private seriesService = inject(SeriesService);
  private entityService = inject(EntityService);
  private router = inject(Router);

  seriesList = signal<Series[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingSeries = signal<Series | null>(null);
  isNew = signal(false);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

  generatingPrompt = signal(false);

  showEntityPanel = signal(false);
  entityList = signal<Entity[]>([]);
  editingEntity = signal<Entity | null>(null);
  newEntityName = signal('');
  newEntityType = signal<Entity['type']>('PERSON');
  entityLoading = signal(false);
  readonly entityTypes: Entity['type'][] = ['PERSON', 'PLACE', 'THING'];

  get panelWidth(): number {
    return 400 + (this.showEntityPanel() ? 400 : 0) + (this.editingEntity() ? 400 : 0);
  }

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
    this.showEntityPanel.set(false);
    this.editingEntity.set(null);
    this.showPanel.set(true);
  }

  openEdit(series: Series): void {
    this.editingSeries.set({ ...series });
    this.isNew.set(false);
    this.thumbnailPreview.set(this.proxyUrl(series.thumnailUrl));
    this.showEntityPanel.set(false);
    this.editingEntity.set(null);
    this.showPanel.set(true);
  }

  openEntityPanel(): void {
    const s = this.editingSeries();
    if (!s) return;
    this.editingEntity.set(null);
    this.showEntityPanel.set(true);
    this.loadEntities(s.id);
  }

  closeEntityPanel(): void {
    this.showEntityPanel.set(false);
    this.editingEntity.set(null);
    this.newEntityName.set('');
  }

  onPanelChanged(open: boolean): void {
    this.showPanel.set(open);
    if (!open) {
      this.editingSeries.set(null);
      this.thumbnailPreview.set(null);
      this.showEntityPanel.set(false);
      this.editingEntity.set(null);
      this.newEntityName.set('');
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingSeries.set(null);
    this.thumbnailPreview.set(null);
    this.showEntityPanel.set(false);
    this.editingEntity.set(null);
    this.newEntityName.set('');
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

  navigateToDetail(seriesId: string): void {
    this.router.navigate(['/series', seriesId]);
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
    const s = this.editingSeries();
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

  saveEntityEdit(entity: Entity): void {
    this.entityService.update(entity).subscribe({
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
}

