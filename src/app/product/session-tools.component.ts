import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { analyzeHamContext, HamContextAnnotation } from '../context/ham-context';
import { DecodedCharacterEvidence } from '../core/morse/interfaces';
import { LocalProductStore, SavedCwSession } from './local-product-store';
import { buildSessionJson, buildSessionText } from './session-export';

@Component({
  selector: 'app-session-tools',
  imports: [CommonModule, FormsModule],
  templateUrl: './session-tools.component.html',
  styleUrl: './session-tools.component.css'
})
export class SessionToolsComponent implements OnChanges {
  @Input() rawText = '';
  @Input() characters: readonly DecodedCharacterEvidence[] = [];
  @Input() deviceLabel = '';
  @Input() toneFrequencyHz: number | null = null;
  @Input() characterWordsPerMinute = 0;
  @Input() effectiveWordsPerMinute = 0;

  annotations: readonly HamContextAnnotation[] = [];
  editedText = '';
  sessions: readonly SavedCwSession[];
  saveMessage = '';
  private editedDirty = false;
  private readonly store = new LocalProductStore(window.localStorage);

  constructor() {
    this.sessions = this.store.loadSessions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rawText']) {
      const previousRaw = String(changes['rawText'].previousValue ?? '');
      if (!this.rawText || !this.editedDirty || this.editedText === previousRaw) {
        this.editedText = this.rawText;
        this.editedDirty = false;
      }
      this.annotations = analyzeHamContext(this.rawText, this.characters);
    } else if (changes['characters']) {
      this.annotations = analyzeHamContext(this.rawText, this.characters);
    }
  }

  editChanged(): void {
    this.editedDirty = this.editedText !== this.rawText;
    this.saveMessage = '';
  }

  restoreRawCopy(): void {
    this.editedText = this.rawText;
    this.editedDirty = false;
  }

  useSuggestion(annotation: HamContextAnnotation): void {
    if (!annotation.replacement) return;
    const directMatch = this.editedText.slice(annotation.sourceStart, annotation.sourceEnd) === annotation.sourceText;
    const start = directMatch ? annotation.sourceStart : this.editedText.indexOf(annotation.sourceText);
    if (start < 0) return;
    this.editedText = this.editedText.slice(0, start) + annotation.replacement +
      this.editedText.slice(start + annotation.sourceText.length);
    this.editedDirty = this.editedText !== this.rawText;
    this.saveMessage = 'Suggestion added to the edited copy. The raw transcript is unchanged.';
  }

  saveCurrent(): void {
    if (!this.rawText.trim()) return;
    this.sessions = this.store.saveSession(this.currentRecord());
    this.saveMessage = this.store.lastWriteSucceeded
      ? 'Session saved on this device.'
      : 'This browser could not save the session. Export it instead so it is not lost.';
  }

  deleteSession(id: string): void {
    this.sessions = this.store.deleteSession(id);
    this.saveMessage = 'Saved session deleted from this device.';
  }

  exportCurrent(format: 'text' | 'json'): void {
    if (!this.rawText.trim()) return;
    this.download(this.currentRecord(), format);
  }

  exportSaved(session: SavedCwSession, format: 'text' | 'json'): void {
    this.download(session, format);
  }

  annotationKind(kind: HamContextAnnotation['kind']): string {
    const labels: Record<HamContextAnnotation['kind'], string> = {
      callsign: 'Callsign shape',
      'operating-term': 'Operating term',
      prosign: 'Prosign',
      'signal-report': 'Signal report'
    };
    return labels[kind];
  }

  private currentRecord(): SavedCwSession {
    const savedAt = new Date().toISOString();
    return {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt,
      rawText: this.rawText,
      editedText: this.editedText,
      annotations: this.annotations,
      metadata: {
        deviceLabel: this.deviceLabel,
        toneFrequencyHz: this.toneFrequencyHz,
        characterWordsPerMinute: this.characterWordsPerMinute,
        effectiveWordsPerMinute: this.effectiveWordsPerMinute
      }
    };
  }

  private download(session: SavedCwSession, format: 'text' | 'json'): void {
    const contents = format === 'json' ? buildSessionJson(session) : buildSessionText(session);
    const blob = new Blob([contents], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cw-session-${session.savedAt.slice(0, 10)}.${format === 'json' ? 'json' : 'txt'}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
