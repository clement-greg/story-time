import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Entity } from '@shared/models/entity.model';
import { RelationshipType, RELATIONSHIP_TYPES } from '@shared/models/entity-relationship.model';

export interface RelationshipDialogData {
  source: Entity;
  target: Entity;
  relationshipType?: RelationshipType;
  description?: string;
}

export interface RelationshipDialogResult {
  relationshipType: RelationshipType;
  description: string;
}

@Component({
  selector: 'app-relationship-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Define Relationship</h2>
    <mat-dialog-content>
      <p class="relationship-summary">
        <strong>{{ data.source.name }}</strong> → <strong>{{ data.target.name }}</strong>
      </p>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Relationship Type</mat-label>
        <mat-select [(ngModel)]="relationshipType">
          @for (type of relationshipTypes; track type.value) {
            <mat-option [value]="type.value">{{ type.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Description (optional)</mat-label>
        <input matInput [(ngModel)]="description" placeholder="e.g. Best friends since childhood" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!relationshipType" (click)="confirm()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    mat-dialog-content { min-width: 380px; }
    .relationship-summary { margin-bottom: 16px; font-size: 14px; }
  `],
})
export class RelationshipDialogComponent {
  data = inject<RelationshipDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<RelationshipDialogComponent>);

  relationshipTypes = RELATIONSHIP_TYPES;
  relationshipType: RelationshipType | null = this.data.relationshipType ?? null;
  description = this.data.description ?? '';

  confirm(): void {
    if (this.relationshipType) {
      this.dialogRef.close({
        relationshipType: this.relationshipType,
        description: this.description,
      } as RelationshipDialogResult);
    }
  }
}
