import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityPanelService } from '../../services/entity-panel.service';
import { EntityEditComponent } from '../../entity-edit/entity-edit';

@Component({
  selector: 'app-entity-panel',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    EntityEditComponent,
  ],
  templateUrl: './entity-panel.html',
  styleUrl: './entity-panel.css',
})
export class EntityPanelComponent {
  panel = inject(EntityPanelService);
}
