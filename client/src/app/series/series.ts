import { Component, inject, signal, OnInit, computed } from '@angular/core';

const WRITING_QUOTES: { text: string; author: string }[] = [
  { text: "Start writing, no matter what. The water does not flow until the faucet is turned on.", author: "Louis L'Amour" },
  { text: "You can always edit a bad page. You can't edit a blank page.", author: "Jodi Picoult" },
  { text: "There is nothing to writing. All you do is sit down at a typewriter and bleed.", author: "Ernest Hemingway" },
  { text: "If there's a book that you want to read, but it hasn't been written yet, then you must write it.", author: "Toni Morrison" },
  { text: "The first draft of anything is shit.", author: "Ernest Hemingway" },
  { text: "Writing is the painting of the voice.", author: "Voltaire" },
  { text: "Either write something worth reading or do something worth writing.", author: "Benjamin Franklin" },
  { text: "A writer is someone for whom writing is more difficult than it is for other people.", author: "Thomas Mann" },
  { text: "One day I will find the right words, and they will be simple.", author: "Jack Kerouac" },
  { text: "If you don't have time to read, you don't have the time — or the tools — to write.", author: "Stephen King" },
  { text: "The scariest moment is always just before you start.", author: "Stephen King" },
  { text: "The most valuable of all talents is that of never using two words when one will do.", author: "Thomas Jefferson" },
  { text: "Easy reading is damn hard writing.", author: "Nathaniel Hawthorne" },
  { text: "Fill your paper with the breathings of your heart.", author: "William Wordsworth" },
  { text: "Writing is thinking. To write well is to think clearly. That's why it's so hard.", author: "David McCullough" },
  { text: "The pen is the tongue of the mind.", author: "Miguel de Cervantes" },
  { text: "You must stay drunk on writing so reality cannot destroy you.", author: "Ray Bradbury" },
  { text: "We are all apprentices in a craft where no one ever becomes a master.", author: "Ernest Hemingway" },
  { text: "Writing is the only thing that, when I do it, I don't feel I should be doing something else.", author: "Gloria Steinem" },
  { text: "You fail only if you stop writing.", author: "Ray Bradbury" },
  { text: "The difference between the right word and the almost right word is the difference between lightning and a lightning bug.", author: "Mark Twain" },
  { text: "You have to write the book that wants to be written.", author: "Madeleine L'Engle" },
  { text: "The writer must believe that what he is doing is the most important thing in the world.", author: "John Steinbeck" },
  { text: "You can't wait for inspiration. You have to go after it with a club.", author: "Jack London" },
  { text: "Writing is utter solitude, the descent into the cold abyss of oneself.", author: "Franz Kafka" },
  { text: "If I don't write to empty my mind, I go mad.", author: "Lord Byron" },
  { text: "Write what disturbs you, what you fear, what you have not been willing to speak about.", author: "Natalie Goldberg" },
  { text: "The purpose of a writer is to keep civilization from destroying itself.", author: "Albert Camus" },
  { text: "Prose is architecture, not interior decoration.", author: "Ernest Hemingway" },
  { text: "The road to hell is paved with adverbs.", author: "Stephen King" },
  { text: "Write hard and clear about what hurts.", author: "Ernest Hemingway" },
  { text: "Not a wasted word. This has been a main point to my literary thinking all my life.", author: "Hunter S. Thompson" },
  { text: "A story has no beginning or end; arbitrarily one chooses that moment of experience from which to look back or from which, to look ahead.", author: "Graham Greene" },
  { text: "Be obscure clearly.", author: "E.B. White" },
  { text: "Words are a lens to focus one's mind.", author: "Ayn Rand" },
  { text: "A writer never has a vacation. For a writer, life consists of either writing or thinking about writing.", author: "Eugene Ionesco" },
  { text: "There's no such thing as writer's block. That was invented by people in California who couldn't write.", author: "Terry Pratchett" },
  { text: "A writer only begins a book. A reader finishes it.", author: "Samuel Johnson" },
  { text: "Don't tell me the moon is shining; show me the glint of light on broken glass.", author: "Anton Chekhov" },
  { text: "Every secret of a writer's soul, every experience of his life, every quality of his mind, is written large in his works.", author: "Virginia Woolf" },
  { text: "If you want to be a writer, you must do two things above all others: read a lot and write a lot.", author: "Stephen King" },
  { text: "A writer who waits for ideal conditions under which to work will die without putting a word to paper.", author: "E.B. White" },
  { text: "Write. Rewrite. When not writing or rewriting, read. I know of no shortcuts.", author: "Larry L. King" },
  { text: "We do not write in order to be understood; we write in order to understand.", author: "C.S. Lewis" },
  { text: "Writing a book is a horrible, exhausting struggle, like a long bout with some painful illness.", author: "George Orwell" },
  { text: "The most important things are the hardest to say.", author: "Stephen King" },
  { text: "An author in his book must be like God in the universe, present everywhere and visible nowhere.", author: "Gustave Flaubert" },
  { text: "Writing a novel is like driving a car at night. You can only see as far as your headlights, but you can make the whole trip that way.", author: "E.L. Doctorow" },
  { text: "Substitute 'damn' every time you're inclined to write 'very'; your editor will delete it and the writing will be just as it should be.", author: "Mark Twain" },
  { text: "I write to give myself strength. I write to be the characters that I am not. I write to explore all the things I'm afraid of.", author: "Joss Whedon" },
  { text: "The greatest part of a writer's time is spent in reading, in order to write; a man will turn over half a library to make one book.", author: "Samuel Johnson" },
  { text: "One must be drenched in words, literally soaked in them, to have the right ones form themselves into the proper pattern at the right moment.", author: "Hart Crane" },
  { text: "There is no greater agony than bearing an untold story inside you.", author: "Maya Angelou" },
];
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { TextFieldModule } from '@angular/cdk/text-field';
import { SeriesService } from './series.service';
import { AuthService } from '../auth/auth.service';
import { Series } from '@shared/models/series.model';
import { v4 as uuidv4 } from 'uuid';
import { SlideOutPanelContainer } from '../shared/slide-out-panel-container/slide-out-panel-container';

@Component({
  selector: 'app-series',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatSelectModule,
    MatDividerModule,
    MatChipsModule,
    TextFieldModule,
    SlideOutPanelContainer,
  ],
  templateUrl: './series.html',
  styleUrl: './series.scss',
})
export class SeriesComponent implements OnInit {
  private seriesService = inject(SeriesService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  });

  readonly firstName = computed(() =>
    (this.authService.currentUser()?.name ?? '').split(' ')[0]
  );

  readonly quote = signal(WRITING_QUOTES[Math.floor(Math.random() * WRITING_QUOTES.length)]);

  seriesList = signal<Series[]>([]);
  loading = signal(false);
  showPanel = signal(false);
  editingSeries = signal<Series | null>(null);
  isNew = signal(false);
  uploading = signal(false);
  thumbnailPreview = signal<string | null>(null);

  generatingPrompt = signal(false);

  newCollaboratorEmail = signal('');
  collaboratorError = signal<string | null>(null);

  ownedSeries = computed(() => {
    const email = this.authService.currentUser()?.email;
    return this.seriesList().filter(s => s.owner === email);
  });

  sharedSeries = computed(() => {
    const email = this.authService.currentUser()?.email;
    return this.seriesList().filter(s => s.owner !== email);
  });

  ngOnInit(): void {
    this.loadSeries();
  }

  loadSeries(): void {
    this.loading.set(true);
    this.seriesService.getAll().subscribe({
      next: (data) => {
        this.seriesList.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openNew(): void {
    this.editingSeries.set({ id: '', title: '', thumnailUrl: '' });
    this.isNew.set(true);
    this.thumbnailPreview.set(null);
    this.showPanel.set(true);
  }

  openEdit(series: Series): void {
    this.editingSeries.set({ ...series });
    this.isNew.set(false);
    this.thumbnailPreview.set(this.proxyUrl(series.thumnailUrl));
    this.showPanel.set(true);
  }

  onPanelChanged(open: boolean): void {
    this.showPanel.set(open);
    if (!open) {
      this.editingSeries.set(null);
      this.thumbnailPreview.set(null);
      this.newCollaboratorEmail.set('');
      this.collaboratorError.set(null);
    }
  }

  closePanel(): void {
    this.showPanel.set(false);
    this.editingSeries.set(null);
    this.thumbnailPreview.set(null);
    this.newCollaboratorEmail.set('');
    this.collaboratorError.set(null);
  }

  updateTitle(value: string): void {
    const current = this.editingSeries();
    if (current) {
      this.editingSeries.set({ ...current, title: value });
    }
  }

  updateSystemPrompt(value: string): void {
    const current = this.editingSeries();
    if (current) {
      this.editingSeries.set({ ...current, systemPrompt: value });
    }
  }

  generateSystemPrompt(): void {
    const s = this.editingSeries();
    if (!s) return;
    this.generatingPrompt.set(true);
    this.seriesService.generateSystemPrompt(s.id, s.systemPrompt ?? '').subscribe({
      next: ({ systemPrompt }) => {
        this.editingSeries.set({ ...s, systemPrompt });
        this.generatingPrompt.set(false);
      },
      error: () => this.generatingPrompt.set(false),
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = () => this.thumbnailPreview.set(reader.result as string);
    reader.readAsDataURL(file);

    // Upload to Azure
    this.uploading.set(true);
    this.seriesService.uploadThumbnail(file).subscribe({
      next: ({ url, thumbnailUrl }) => {
        const current = this.editingSeries();
        if (current) {
          this.editingSeries.set({ ...current, thumnailUrl: thumbnailUrl, originalUrl: url });
        }
        // Switch preview from local data URL to the proxy URL
        this.thumbnailPreview.set(this.proxyUrl(thumbnailUrl));
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }

  saveEdit(): void {
    const editing = this.editingSeries();
    if (!editing || !editing.title.trim()) return;

    if (this.isNew()) {
      const series: Series = { ...editing, id: uuidv4() };
      this.seriesService.create(series).subscribe({
        next: (created) => {
          this.seriesList.update((list) => [...list, created]);
          this.closePanel();
        },
      });
    } else {
      this.seriesService.update(editing).subscribe({
        next: (updated) => {
          this.seriesList.update((list) =>
            list.map((s) => (s.id === updated.id ? updated : s))
          );
          this.closePanel();
        },
      });
    }
  }

  proxyUrl(azureUrl: string | undefined): string | null {
    if (!azureUrl) return null;
    const filename = azureUrl.split('/').pop();
    return filename ? `/api/image/${filename}` : null;
  }

  addCollaborator(): void {
    const s = this.editingSeries();
    const email = this.newCollaboratorEmail().trim();
    if (!s || !email) return;
    this.collaboratorError.set(null);
    this.seriesService.addCollaborator(s.id, email).subscribe({
      next: (updated) => {
        this.editingSeries.set(updated);
        this.seriesList.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.newCollaboratorEmail.set('');
      },
      error: (err) => {
        this.collaboratorError.set(err?.error?.error ?? 'Failed to add collaborator');
      },
    });
  }

  removeCollaborator(email: string): void {
    const s = this.editingSeries();
    if (!s) return;
    this.seriesService.removeCollaborator(s.id, email).subscribe({
      next: (updated) => {
        this.editingSeries.set(updated);
        this.seriesList.update(list => list.map(x => x.id === updated.id ? updated : x));
      },
    });
 }

  navigateToDetail(seriesId: string): void {
    this.router.navigate(['/series', seriesId]);
  }

}

