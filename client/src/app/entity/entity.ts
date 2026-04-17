import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { EntityService } from './entity.service';
import { SeriesService } from '../series/series.service';
import { Entity } from '@shared/models/entity.model';
import { Series } from '@shared/models/series.model';
import { v4 as uuidv4 } from 'uuid';

@Component({
  selector: 'app-entity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatListModule,
    MatCardModule,
    MatSelectModule,
  ],
  templateUrl: './entity.html',
  styleUrl: './entity.css',
})
export class EntityComponent implements OnInit {
  private entityService = inject(EntityService);
  private seriesService = inject(SeriesService);

  entityList = signal<Entity[]>([]);
  seriesList = signal<Series[]>([]);
  editingEntity = signal<Entity | null>(null);
  newName = signal('');
  newType = signal<Entity['type']>('PERSON');
  newSeriesId = signal('');
  filterSeriesId = signal('');
  loading = signal(false);

  entityTypes: Entity['type'][] = ['PERSON', 'PLACE', 'THING'];

  ngOnInit(): void {
    this.loadSeries();
    this.loadEntities();
  }

  loadSeries(): void {
    this.seriesService.getAll().subscribe({
      next: (data) => this.seriesList.set(data),
    });
  }

  loadEntities(): void {
    this.loading.set(true);
    this.entityService.getAll().subscribe({
      next: (data) => {
        this.entityList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  filterBySeries(seriesId: string): void {
    this.filterSeriesId.set(seriesId);
    this.loading.set(true);
    if (seriesId) {
      this.entityService.getBySeries(seriesId).subscribe({
        next: (data) => {
          this.entityList.set(data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    } else {
      this.entityService.getAll().subscribe({
        next: (data) => {
          this.entityList.set(data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
    }
  }

  addEntity(): void {
    const name = this.newName().trim();
    const seriesId = this.newSeriesId();
    const type = this.newType();
    if (!name || !seriesId) return;

    const entity: Entity = { id: uuidv4(), name, type, seriesId };
    this.entityService.create(entity).subscribe({
      next: (created) => {
        this.entityList.update((list) => [...list, created]);
        this.newName.set('');
      },
    });
  }

  startEdit(entity: Entity): void {
    this.editingEntity.set({ ...entity });
  }

  cancelEdit(): void {
    this.editingEntity.set(null);
  }

  saveEdit(): void {
    const editing = this.editingEntity();
    if (!editing || !editing.name.trim() || !editing.seriesId) return;

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

  getSeriesTitle(seriesId: string): string {
    return this.seriesList().find((s) => s.id === seriesId)?.title ?? 'Unknown';
  }
}
