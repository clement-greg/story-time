import { Injectable, inject, signal } from '@angular/core';
import { EntityService } from './entity.service';
import { Entity } from '@shared/models/entity.model';
import { v4 as uuidv4 } from 'uuid';

@Injectable({ providedIn: 'root' })
export class EntityPanelService {
  private entityService = inject(EntityService);

  isOpen = signal(false);
  seriesId = signal<string | null>(null);
  entityList = signal<Entity[]>([]);
  editingEntity = signal<Entity | null>(null);
  isNewEntity = signal(false);
  entityLoading = signal(false);
  showingArchived = signal(false);

  get panelWidth(): number {
    return this.editingEntity() ? 572 : 340;
  }

  open(seriesId: string): void {
    this.seriesId.set(seriesId);
    this.editingEntity.set(null);
    this.isNewEntity.set(false);
    this.showingArchived.set(false);
    this.isOpen.set(true);
    this.loadEntities(seriesId);
  }

  close(): void {
    this.isOpen.set(false);
    this.editingEntity.set(null);
    this.isNewEntity.set(false);
  }

  loadEntities(seriesId: string): void {
    this.entityLoading.set(true);
    const fetch = this.showingArchived()
      ? this.entityService.getArchivedBySeries(seriesId)
      : this.entityService.getBySeries(seriesId);
    fetch.subscribe({
      next: (data) => {
        this.entityList.set(data);
        this.entityLoading.set(false);
      },
      error: () => this.entityLoading.set(false),
    });
  }

  toggleArchived(): void {
    const seriesId = this.seriesId();
    if (!seriesId) return;
    this.editingEntity.set(null);
    this.isNewEntity.set(false);
    this.showingArchived.update(v => !v);
    this.loadEntities(seriesId);
  }

  addEntity(): void {
    const id = this.seriesId();
    if (!id) return;
    const entity: Entity = { id: uuidv4(), name: '', type: 'PERSON', seriesId: id };
    this.isNewEntity.set(true);
    this.editingEntity.set(entity);
  }

  startEditEntity(entity: Entity): void {
    this.isNewEntity.set(false);
    this.editingEntity.set({ ...entity });
  }

  cancelEditEntity(): void {
    this.editingEntity.set(null);
    this.isNewEntity.set(false);
  }

  saveEntityEdit(entity: Entity): void {
    if (this.isNewEntity()) {
      this.entityService.create(entity).subscribe({
        next: (created) => {
          this.entityList.update((list) => [...list, created]);
          this.isNewEntity.set(false);
          this.editingEntity.set(created);
        },
      });
    } else {
      this.entityService.update(entity).subscribe({
        next: (updated) => {
          this.entityList.update((list) =>
            list.map((e) => (e.id === updated.id ? updated : e))
          );
          this.editingEntity.set(null);
        },
      });
    }
  }

  deleteEntity(id: string): void {
    this.entityService.delete(id).subscribe({
      next: () => {
        this.entityList.update((list) => list.filter((e) => e.id !== id));
        if (this.editingEntity()?.id === id) {
          this.editingEntity.set(null);
        }
      },
    });
  }

  archiveEntity(id: string): void {
    this.entityService.archive(id).subscribe({
      next: () => {
        this.entityList.update((list) => list.filter((e) => e.id !== id));
        if (this.editingEntity()?.id === id) {
          this.editingEntity.set(null);
        }
      },
    });
  }

  unarchiveEntity(id: string): void {
    this.entityService.unarchive(id).subscribe({
      next: () => {
        this.entityList.update((list) => list.filter((e) => e.id !== id));
        if (this.editingEntity()?.id === id) {
          this.editingEntity.set(null);
        }
      },
    });
  }

  proxyUrl(url: string | undefined): string | null {
    if (!url) return null;
    const filename = url.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }
}
