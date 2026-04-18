import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, takeUntil, debounceTime, filter } from 'rxjs';
import { SpellCheckerService, MisspelledWord } from '../services/spell-checker.service';

@Component({
  selector: 'app-spell-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="editor-container">
      @if (!ready()) {
        <div class="loading">Loading dictionary…</div>
      }
      <div class="editor-layers" [class.hidden]="!ready()">
        <div class="backdrop" #backdrop>
          <div class="highlights" [innerHTML]="highlightedHtml()"></div>
        </div>
        <textarea
          #textarea
          [value]="text()"
          (input)="onInput($event)"
          (scroll)="onScroll()"
          (click)="onClick($event)"
          (blur)="onBlur()"
          placeholder="Start typing…"
          spellcheck="false"
        ></textarea>
      </div>

      @if (activeSuggestion(); as active) {
        <div
          class="suggestion-popup"
          [style.left.px]="popupPosition().x"
          [style.top.px]="popupPosition().y"
        >
          @for (suggestion of active.suggestions; track suggestion) {
            <button (mousedown)="applySuggestion(suggestion, $event)">
              {{ suggestion }}
            </button>
          }
          @if (active.suggestions.length === 0) {
            <div class="no-suggestions">No suggestions</div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .editor-container {
        position: relative;
        width: 100%;
        max-width: 800px;
      }
      .loading {
        padding: 20px;
        color: #666;
        font-style: italic;
      }
      .editor-layers {
        position: relative;
        width: 100%;
        height: 400px;
        font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
        font-size: 14px;
        line-height: 1.5;
      }
      .editor-layers.hidden {
        visibility: hidden;
      }
      .backdrop,
      textarea {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        padding: 10px;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        border: 1px solid #ccc;
        border-radius: 6px;
        margin: 0;
        box-sizing: border-box;
        tab-size: 4;
        -moz-tab-size: 4;
      }
      .backdrop {
        z-index: 1;
        color: transparent;
        pointer-events: none;
        overflow: hidden;
        background: #fff;
      }
      .backdrop ::ng-deep .misspelled {
        text-decoration: underline wavy red;
        text-underline-offset: 3px;
      }
      textarea {
        z-index: 2;
        background-color: transparent;
        color: #1a1a1a;
        resize: none;
        outline: none;
        caret-color: #1a1a1a;
      }
      textarea:focus {
        border-color: #4a90d9;
        box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.2);
      }
      .suggestion-popup {
        position: absolute;
        z-index: 10;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 150px;
        max-width: 250px;
        max-height: 200px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .suggestion-popup button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 8px 14px;
        border: none;
        background: none;
        cursor: pointer;
        font-family: inherit;
        font-size: 13px;
        color: #333;
      }
      .suggestion-popup button:hover {
        background: #e8f0fe;
        color: #1a56db;
      }
      .no-suggestions {
        padding: 8px 14px;
        color: #999;
        font-style: italic;
        font-size: 13px;
      }
    `,
  ],
})
export class SpellEditorComponent implements OnInit, OnDestroy {
  private readonly spellChecker = inject(SpellCheckerService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy$ = new Subject<void>();
  private readonly inputSubject = new Subject<string>();

  @ViewChild('textarea', { read: ElementRef }) textareaRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('backdrop', { read: ElementRef }) backdropRef!: ElementRef<HTMLDivElement>;

  readonly text = signal('');
  readonly ready = signal(false);
  readonly misspelledWords = signal<MisspelledWord[]>([]);
  readonly activeSuggestion = signal<{
    word: string;
    index: number;
    suggestions: string[];
  } | null>(null);
  readonly popupPosition = signal({ x: 0, y: 0 });

  readonly highlightedHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.buildHighlightedHtml()),
  );

  ngOnInit(): void {
    this.spellChecker.loadDictionary();

    this.spellChecker.ready$
      .pipe(filter(Boolean), takeUntil(this.destroy$))
      .subscribe(() => {
        this.ready.set(true);
        this.runSpellCheck(this.text());
      });

    this.inputSubject
      .pipe(debounceTime(100), takeUntil(this.destroy$))
      .subscribe((value) => this.runSpellCheck(value));
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.text.set(value);
    this.activeSuggestion.set(null);
    this.inputSubject.next(value);
  }

  onScroll(): void {
    if (this.backdropRef && this.textareaRef) {
      const textarea = this.textareaRef.nativeElement;
      const backdrop = this.backdropRef.nativeElement;
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
  }

  onClick(event: MouseEvent): void {
    const textarea = this.textareaRef.nativeElement;
    const caretPos = textarea.selectionStart;
    const misspelled = this.misspelledWords();

    for (let i = 0; i < misspelled.length; i++) {
      const m = misspelled[i];
      if (caretPos >= m.start && caretPos <= m.end) {
        this.activeSuggestion.set({
          word: m.word,
          index: i,
          suggestions: this.spellChecker.suggest(m.word),
        });
        this.popupPosition.set({ x: event.offsetX, y: event.offsetY + 24 });
        return;
      }
    }
    this.activeSuggestion.set(null);
  }

  onBlur(): void {
    setTimeout(() => this.activeSuggestion.set(null), 200);
  }

  applySuggestion(suggestion: string, event: MouseEvent): void {
    event.preventDefault();
    const active = this.activeSuggestion();
    if (!active) return;

    const current = this.text();
    const misspelled = this.misspelledWords()[active.index];
    const updated =
      current.substring(0, misspelled.start) +
      suggestion +
      current.substring(misspelled.end);

    this.text.set(updated);
    this.textareaRef.nativeElement.value = updated;
    this.activeSuggestion.set(null);
    this.runSpellCheck(updated);
  }

  private runSpellCheck(text: string): void {
    if (!this.ready()) return;
    const misspelled = this.spellChecker.checkText(text);
    this.misspelledWords.set(misspelled);
  }

  private buildHighlightedHtml(): string {
    const text = this.text();
    const misspelled = this.misspelledWords();
    if (misspelled.length === 0) return this.escapeHtml(text);

    let result = '';
    let lastIndex = 0;
    for (const m of misspelled) {
      result += this.escapeHtml(text.substring(lastIndex, m.start));
      result += `<span class="misspelled">${this.escapeHtml(m.word)}</span>`;
      lastIndex = m.end;
    }
    result += this.escapeHtml(text.substring(lastIndex));
    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
