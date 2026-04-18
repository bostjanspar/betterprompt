import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, forkJoin, Observable } from 'rxjs';
import Typo from 'typo-js';

export interface MisspelledWord {
  word: string;
  start: number;
  end: number;
}

@Injectable({ providedIn: 'root' })
export class SpellCheckerService {
  private readonly http = inject(HttpClient);
  private typo: Typo | null = null;
  private readonly readySubject = new BehaviorSubject<boolean>(false);
  readonly ready$: Observable<boolean> = this.readySubject.asObservable();

  loadDictionary(): void {
    forkJoin({
      aff: this.http.get('/assets/dictionaries/en_US.aff', { responseType: 'text' }),
      dic: this.http.get('/assets/dictionaries/en_US.dic', { responseType: 'text' }),
    }).subscribe(({ aff, dic }) => {
      this.typo = new Typo('en_US', aff, dic);
      this.readySubject.next(true);
    });
  }

  check(word: string): boolean {
    return this.typo?.check(word) ?? true;
  }

  suggest(word: string): string[] {
    return this.typo?.suggest(word) ?? [];
  }

  checkText(text: string): MisspelledWord[] {
    if (!this.typo) return [];
    const misspelled: MisspelledWord[] = [];
    const regex = /\b[\w']+\b/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const word = match[0];
      if (!this.check(word)) {
        misspelled.push({ word, start: match.index, end: match.index + word.length });
      }
    }
    return misspelled;
  }
}
