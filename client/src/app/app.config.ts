import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideEnvironmentInitializer, inject } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Routes } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { SeriesComponent } from './series/series';
import { SeriesDetailComponent } from './series-detail/series-detail';
import { BookComponent } from './book/book';
import { BookDetailComponent } from './book-detail/book-detail';
import { ChapterComponent } from './chapter/chapter';
import { ChapterEditComponent } from './chapter-edit/chapter-edit';
import { SomethingElseComponent } from './something-else/something-else';

const routes: Routes = [
  { path: 'series', component: SeriesComponent },
  { path: 'series/:id', component: SeriesDetailComponent },
  { path: 'books', component: BookComponent },
  { path: 'books/:id', component: BookDetailComponent },
  { path: 'chapters', component: ChapterComponent },
  { path: 'chapters/:id/edit', component: ChapterEditComponent },
  { path: 'something-else', component: SomethingElseComponent },
  { path: '', redirectTo: 'series', pathMatch: 'full' },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    provideEnvironmentInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
  ]
};
