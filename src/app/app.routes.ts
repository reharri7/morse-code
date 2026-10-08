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
    title: 'CW Receiver & Morse Code Transcriber — Morse Practice',
    data: {
      seo: {
        title: 'CW Receiver & Morse Code Transcriber — Morse Practice',
        description: 'Receive and transcribe CW locally in your browser with automatic tone lock, adaptive timing, raw text, confidence evidence, and no cloud processing.',
        canonicalPath: '/transcribe'
      }
    }
  },
  {
    path: 'learn',
    loadComponent: () => import('./learning/pages/learn-home/learn-home-page.component')
      .then((module) => module.LearnHomePageComponent),
    title: 'Learn Morse Code — Morse Practice',
    data: {
      seo: {
        title: 'Learn Morse Code — Morse Practice',
        description: 'Learn Morse code with adaptive listening drills, Koch-method character practice, words, simulated radio copy, and sending exercises that work offline.',
        canonicalPath: '/learn'
      }
    }
  },
  {
    path: 'learn/setup',
    component: LearnSetupPageComponent,
    title: 'Morse Practice Setup — Morse Practice',
    data: {
      seo: {
        title: 'Morse Practice Setup — Morse Practice',
        description: 'Choose character speed, effective speed, tone, and session length for private on-device Morse code listening practice.',
        index: false,
        canonicalPath: '/learn/setup'
      }
    }
  },
  {
    path: 'learn/copy',
    component: CopyPracticePageComponent,
    title: 'Morse Code Copy Practice — Morse Practice',
    data: {
      seo: {
        title: 'Morse Code Copy Practice — Morse Practice',
        description: 'Practice copying Morse code character groups and unlocked words with adaptive, private, browser-based audio exercises.',
        index: false,
        canonicalPath: '/learn/copy'
      }
    }
  },
  {
    path: 'learn/radio',
    component: RadioPracticePageComponent,
    title: 'Simulated CW Radio Practice — Morse Practice',
    data: {
      seo: {
        title: 'Simulated CW Radio Practice — Morse Practice',
        description: 'Practice simulated CW callsigns, contest exchanges, and radio contacts with deterministic on-device Morse audio.',
        index: false,
        canonicalPath: '/learn/radio'
      }
    }
  },
  {
    path: 'learn/free-copy',
    loadComponent: () => import('./learning/pages/free-copy/free-copy-page.component')
      .then((module) => module.FreeCopyPageComponent),
    title: 'Morse Code Free Copy Practice — Morse Practice',
    data: {
      seo: {
        title: 'Morse Code Free Copy Practice — Morse Practice',
        description: 'Build Morse code copy skill with longer generated passages, live typing, playback controls, and private on-device scoring.',
        canonicalPath: '/learn/free-copy'
      }
    }
  },
  {
    path: 'learn/keying',
    loadComponent: () => import('./learning/pages/keying-practice/keying-practice-page.component')
      .then((module) => module.KeyingPracticePageComponent),
    title: 'Morse Code Keying Practice — Morse Practice',
    data: {
      seo: {
        title: 'Morse Code Keying Practice — Morse Practice',
        description: 'Practice sending Morse code with a straight key, keyboard, touch, or USB paddle and get immediate pattern and rhythm feedback.',
        canonicalPath: '/learn/keying'
      }
    }
  },
  {
    path: 'learn/session',
    component: LearnSessionPageComponent,
    title: 'Morse Listening Session — Morse Practice',
    data: {
      seo: {
        title: 'Morse Listening Session — Morse Practice',
        description: 'An active private Morse code listening session.',
        index: false,
        canonicalPath: '/learn/session'
      }
    }
  },
  {
    path: 'learn/results',
    component: LearnResultsPageComponent,
    title: 'Morse Practice Results — Morse Practice',
    data: {
      seo: {
        title: 'Morse Practice Results — Morse Practice',
        description: 'Private results from your latest on-device Morse code practice session.',
        index: false,
        canonicalPath: '/learn/results'
      }
    }
  },
  {
    path: 'learn/progress',
    component: LearnProgressPageComponent,
    title: 'Morse Learning Progress — Morse Practice',
    data: {
      seo: {
        title: 'Morse Learning Progress — Morse Practice',
        description: 'Private on-device accuracy, speed, and character progress for Morse code practice.',
        index: false,
        canonicalPath: '/learn/progress'
      }
    }
  },
  { path: '**', redirectTo: 'learn' }
];
