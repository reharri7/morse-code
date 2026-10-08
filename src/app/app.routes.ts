import { Routes } from '@angular/router';
import { LearnProgressPageComponent } from './learning/pages/learn-progress/learn-progress-page.component';
import { LearnResultsPageComponent } from './learning/pages/learn-results/learn-results-page.component';
import { LearnSessionPageComponent } from './learning/pages/learn-session/learn-session-page.component';
import { LearnSetupPageComponent } from './learning/pages/learn-setup/learn-setup-page.component';
import { CopyPracticePageComponent } from './learning/pages/copy-practice/copy-practice-page.component';
import { RadioPracticePageComponent } from './learning/pages/radio-practice/radio-practice-page.component';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'learn' },
  {
    path: 'transcribe',
    loadComponent: () => import('./transcription/transcription-page.component')
      .then((module) => module.TranscriptionPageComponent),
    title: 'Receive CW — Morse Practice'
  },
  {
    path: 'learn',
    loadComponent: () => import('./learning/pages/learn-home/learn-home-page.component')
      .then((module) => module.LearnHomePageComponent),
    title: 'Learn Morse — Morse Practice'
  },
  {
    path: 'learn/setup',
    component: LearnSetupPageComponent,
    title: 'Practice setup — Morse Practice'
  },
  {
    path: 'learn/copy',
    component: CopyPracticePageComponent,
    title: 'Copy practice — Morse Practice'
  },
  {
    path: 'learn/radio',
    component: RadioPracticePageComponent,
    title: 'Simulated radio practice — Morse Practice'
  },
  {
    path: 'learn/free-copy',
    loadComponent: () => import('./learning/pages/free-copy/free-copy-page.component')
      .then((module) => module.FreeCopyPageComponent),
    title: 'Free copy — Morse Practice'
  },
  {
    path: 'learn/keying',
    loadComponent: () => import('./learning/pages/keying-practice/keying-practice-page.component')
      .then((module) => module.KeyingPracticePageComponent),
    title: 'Keying practice — Morse Practice'
  },
  {
    path: 'learn/session',
    component: LearnSessionPageComponent,
    title: 'Morse practice — Morse Practice'
  },
  {
    path: 'learn/results',
    component: LearnResultsPageComponent,
    title: 'Practice results — Morse Practice'
  },
  {
    path: 'learn/progress',
    component: LearnProgressPageComponent,
    title: 'Learning progress — Morse Practice'
  },
  { path: '**', redirectTo: 'learn' }
];
