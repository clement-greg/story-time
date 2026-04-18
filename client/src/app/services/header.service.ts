import { Injectable, signal } from '@angular/core';

export interface BreadcrumbItem {
  label: string;
  link?: string;
}

export interface HeaderMenuAction {
  icon: string;
  label: string;
  action: () => void;
}

@Injectable({ providedIn: 'root' })
export class HeaderService {
  breadcrumbs = signal<BreadcrumbItem[]>([]);
  menuActions = signal<HeaderMenuAction[]>([]);

  set(breadcrumbs: BreadcrumbItem[], actions: HeaderMenuAction[] = []): void {
    this.breadcrumbs.set(breadcrumbs);
    this.menuActions.set(actions);
  }

  clear(): void {
    this.breadcrumbs.set([]);
    this.menuActions.set([]);
  }
}
