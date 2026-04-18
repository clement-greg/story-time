import { Component, input, output, signal, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TextFieldModule } from '@angular/cdk/text-field';
import { Entity, EntityReference } from '@shared/models/entity.model';
import { EntityService } from '../services/entity.service';

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
    TextFieldModule,
  ],
  templateUrl: './entity-edit.html',
  styleUrl: './entity-edit.css',
})
export class EntityEditComponent implements OnInit {
  private entityService = inject(EntityService);

  entity = input.required<Entity>();
  save = output<Entity>();
  cancel = output<void>();

  readonly entityTypes: Entity['type'][] = ['PERSON', 'PLACE', 'THING'];
  readonly referenceOptions: { value: EntityReference; label: string }[] = [
    { value: 'full-name', label: 'Full Name' },
    { value: 'first-name', label: 'First Name' },
    { value: 'last-name', label: 'Last Name' },
    { value: 'nickname', label: 'Nickname' },
  ];

  draft = signal<Entity | null>(null);
  thumbnailPreview = signal<string | null>(null);
  uploading = signal(false);
  generatingPersonality = signal(false);

  ngOnInit(): void {
    const e = this.entity();
    const draft = { ...e };
    if (e.type === 'PERSON' && !e.preferredReference) {
      draft.preferredReference = 'first-name';
    }
    this.draft.set(draft);
    this.thumbnailPreview.set(this.proxyUrl(e.thumbnailUrl));
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
}
