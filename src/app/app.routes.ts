import { Routes } from '@angular/router';
import { LearnProgressPageComponent } from './learning/pages/learn-progress/learn-progress-page.component';
import { LearnResultsPageComponent } from './learning/pages/learn-results/learn-results-page.component';
import { LearnSessionPageComponent } from './learning/pages/learn-session/learn-session-page.component';
import { LearnSetupPageComponent } from './learning/pages/learn-setup/learn-setup-page.component';
import { CopyPracticePageComponent } from './learning/pages/copy-practice/copy-practice-page.component';
import { RadioPracticePageComponent } from './learning/pages/radio-practice/radio-practice-page.component';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'transcribe' },
  {
    path: 'transcribe',
    loadComponent: () => import('./transcription/transcription-page.component')
      .then((module) => module.TranscriptionPageComponent),
    title: 'Transcribe — CW Transcriber'
  },
  {
    path: 'learn',
    loadComponent: () => import('./learning/pages/learn-home/learn-home-page.component')
      .then((module) => module.LearnHomePageComponent),
    title: 'Learn Morse — CW Transcriber'
  },
  {
    path: 'learn/setup',
    component: LearnSetupPageComponent,
    title: 'Practice setup — CW Transcriber'
  },
  {
    path: 'learn/copy',
    component: CopyPracticePageComponent,
    title: 'Copy practice — CW Transcriber'
  },
  {
    path: 'learn/radio',
    component: RadioPracticePageComponent,
    title: 'Simulated radio practice — CW Transcriber'
  },
  {
    path: 'learn/free-copy',
    loadComponent: () => import('./learning/pages/free-copy/free-copy-page.component')
      .then((module) => module.FreeCopyPageComponent),
    title: 'Free copy — CW Transcriber'
  },
  {
    path: 'learn/keying',
    loadComponent: () => import('./learning/pages/keying-practice/keying-practice-page.component')
      .then((module) => module.KeyingPracticePageComponent),
    title: 'Keying practice — CW Transcriber'
  },
  {
    path: 'learn/session',
    component: LearnSessionPageComponent,
    title: 'Morse practice — CW Transcriber'
  },
  {
    path: 'learn/results',
    component: LearnResultsPageComponent,
    title: 'Practice results — CW Transcriber'
  },
  {
    path: 'learn/progress',
    component: LearnProgressPageComponent,
    title: 'Learning progress — CW Transcriber'
  },
  { path: '**', redirectTo: 'transcribe' }
];
