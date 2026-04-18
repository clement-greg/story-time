import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from './auth/auth.service';
import { HeaderService } from './services/header.service';
import { EntityPanelComponent } from './shared/entity-panel/entity-panel';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, EntityPanelComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  auth = inject(AuthService);
  header = inject(HeaderService);
  private router = inject(Router);

  signOut(): void {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
