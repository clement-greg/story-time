import { Component, input, output, signal, inject, effect } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Entity, EntityReference } from '@shared/models/entity.model';
import { EntityService } from '../services/entity.service';
import { ImageGenDialogComponent, ImageGenResult } from './image-gen-dialog';

@Component({
  selector: 'app-entity-edit',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TextFieldModule,
  ],
  templateUrl: './entity-edit.html',
  styleUrl: './entity-edit.css',
})
export class EntityEditComponent {
  private entityService = inject(EntityService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  entity = input.required<Entity>();
  save = output<Entity>();
  cancel = output<void>();
  archive = output<string>();
  unarchive = output<string>();

  readonly entityTypes: Entity['type'][] = ['PERSON', 'PLACE', 'THING'];
  readonly referenceOptions: { value: EntityReference; label: string; requiresTitle?: boolean }[] = [
    { value: 'full-name', label: 'Full Name' },
    { value: 'first-name', label: 'First Name' },
    { value: 'last-name', label: 'Last Name' },
    { value: 'nickname', label: 'Nickname' },
    { value: 'title-full-name', label: 'Title + Full Name (e.g. Dr Sanderson Williams)', requiresTitle: true },
    { value: 'title-last-name', label: 'Title + Last Name (e.g. Dr Williams)', requiresTitle: true },
  ];

  draft = signal<Entity | null>(null);
  thumbnailPreview = signal<string | null>(null);
  uploading = signal(false);
  generatingImage = signal(false);
  generatingPersonality = signal(false);

  constructor() {
    effect(() => {
      const e = this.entity();
      const draft = { ...e };
      if (e.type === 'PERSON' && !e.preferredReference) {
        draft.preferredReference = 'first-name';
      }
      this.draft.set(draft);
      this.thumbnailPreview.set(this.proxyUrl(e.thumbnailUrl));
    });
  }

  update<K extends keyof Entity>(field: K, value: Entity[K]): void {
    const current = this.draft();
    if (current) {
      const updated = { ...current, [field]: value };
      if (field === 'type' && value === 'PERSON' && !current.preferredReference) {
        updated.preferredReference = 'first-name';
      }
      this.draft.set(updated);
    }
  }

  proxyUrl(url: string | undefined): string | null {
    if (!url) return null;
    const filename = url.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => this.thumbnailPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    this.uploading.set(true);
    this.entityService.uploadThumbnail(file).subscribe({
      next: ({ url, thumbnailUrl }) => {
        const current = this.draft();
        if (current) {
          this.draft.set({ ...current, thumbnailUrl, originalUrl: url });
        }
        this.thumbnailPreview.set(this.proxyUrl(thumbnailUrl));
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }

  onNameBlur(): void {
    const d = this.draft();
    if (!d || d.type !== 'PERSON') return;
    if (d.firstName?.trim() || d.lastName?.trim()) return;
    const parts = d.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, parts.length - 1).join(' ');
      this.draft.set({ ...d, firstName, lastName });
    } else if (parts.length === 1 && parts[0]) {
      this.draft.set({ ...d, firstName: parts[0], lastName: '' });
    }
  }

  openGenerateImageDialog(): void {
    const dialogRef = this.dialog.open(ImageGenDialogComponent, { width: '500px' });
    dialogRef.afterClosed().subscribe((result: ImageGenResult | undefined) => {
      if (!result) return;
      this.generatingImage.set(true);
      this.entityService.generateImage(result.prompt, result.provider).subscribe({
        next: ({ url, thumbnailUrl }) => {
          const current = this.draft();
          if (current) {
            this.draft.set({ ...current, thumbnailUrl, originalUrl: url });
          }
          this.thumbnailPreview.set(this.proxyUrl(thumbnailUrl));
          this.generatingImage.set(false);
        },
        error: () => this.generatingImage.set(false),
      });
    });
  }

  onSave(): void {
    const d = this.draft();
    if (!d || !d.name.trim()) return;
    this.save.emit(d);
  }

  generatePersonality(): void {
    const d = this.draft();
    if (!d) return;
    this.generatingPersonality.set(true);
    this.entityService.generatePersonality(d.id, d.personality ?? '').subscribe({
      next: ({ personality }) => {
        this.draft.set({ ...d, personality });
        this.generatingPersonality.set(false);
      },
      error: () => this.generatingPersonality.set(false),
    });
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onArchive(): void {
    const d = this.draft();
    if (d?.id) {
      this.archive.emit(d.id);
    }
  }

  onUnarchive(): void {
    const d = this.draft();
    if (d?.id) {
      this.unarchive.emit(d.id);
    }
  }

  openRelationshipDiagram(): void {
    const d = this.draft();
    if (d?.seriesId) {
      this.router.navigate(['/series', d.seriesId, 'relationships']);
    }
  }
}
