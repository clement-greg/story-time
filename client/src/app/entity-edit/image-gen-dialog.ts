import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { TextFieldModule } from '@angular/cdk/text-field';

@Component({
  selector: 'app-image-gen-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatInputModule,
    MatFormFieldModule,
    TextFieldModule,
  ],
  template: `
    <h2 mat-dialog-title>Generate Image</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="prompt-field">
        <mat-label>Image prompt</mat-label>
        <textarea matInput
                  cdkTextareaAutosize
                  cdkAutosizeMinRows="4"
                  cdkAutosizeMaxRows="10"
                  [(ngModel)]="prompt"
                  placeholder="Describe the image you want to generate…"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [disabled]="!prompt.trim()" (click)="confirm()">
        Generate
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .prompt-field { width: 100%; }
    mat-dialog-content { min-width: 420px; }
  `],
})
export class ImageGenDialogComponent {
  private dialogRef = inject(MatDialogRef<ImageGenDialogComponent>);

  prompt = '';

  confirm(): void {
    const text = this.prompt.trim();
    if (text) this.dialogRef.close(text);
  }
}
