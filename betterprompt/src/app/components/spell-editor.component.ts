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
    <div class="editor-card">
      @if (!ready()) {
        <div class="loading-state">
          <div class="loading-pulse">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <p>Loading dictionary…</p>
        </div>
      }

      <div class="editor-body" [class.hidden]="!ready()">
        <div class="toolbar">
          <div class="toolbar-left">
            @if (errorCount() > 0) {
              <span class="error-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {{ errorCount() }} {{ errorCount() === 1 ? 'error' : 'errors' }}
              </span>
            } @else if (text().trim().length > 0) {
              <span class="success-badge">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                All clear
              </span>
            }
          </div>
          <div class="toolbar-right">
            <button class="tool-btn" (click)="copyText()" title="Copy to clipboard">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button class="tool-btn" (click)="clearText()" title="Clear editor">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        <div class="editor-layers">
          <div class="backdrop" #backdrop>
            <div class="highlights" [innerHTML]="highlightedHtml()"></div>
          </div>
          <textarea
            #textarea
            [value]="text()"
            (input)="onInput($event)"
            (scroll)="onScroll()"
            (click)="onClick($event)"
            (keydown)="onKeyDown($event)"
            (blur)="onBlur()"
            placeholder="Start writing your prompt here…"
            spellcheck="false"
          ></textarea>
        </div>

        <div class="status-bar">
          <div class="status-left">
            @if (ready()) {
              <span class="status-active">
                <span class="status-dot"></span>
                Spell check active
              </span>
            }
          </div>
          <div class="status-right">
            <span>{{ wordCount() }} {{ wordCount() === 1 ? 'word' : 'words' }}</span>
            <span class="status-divider">·</span>
            <span>{{ charCount() }} {{ charCount() === 1 ? 'char' : 'chars' }}</span>
          </div>
        </div>
      </div>

      @if (activeSuggestion(); as active) {
        <div
          class="suggestion-popup"
          [style.left.px]="popupPosition().x"
          [style.top.px]="popupPosition().y"
        >
          <div class="popup-header">
            <span class="popup-word">{{ active.word }}</span>
          </div>
          @for (suggestion of active.suggestions; track suggestion; let i = $index) {
            <button
              [class.selected]="i === selectedSuggestionIndex()"
              (mousedown)="applySuggestion(suggestion, $event)"
              (mouseenter)="selectSuggestion(i)"
            >
              {{ suggestion }}
            </button>
          }
          @if (active.suggestions.length === 0) {
            <div class="no-suggestions">No suggestions found</div>
          }
        </div>
      }

      @if (copiedToast()) {
        <div class="toast">Copied to clipboard</div>
      }
    </div>
  `,
  styles: [
    `
      .editor-card {
        position: relative;
        background: #ffffff;
        border-radius: 16px;
        border: 1px solid #E8E4DF;
        box-shadow:
          0 1px 2px rgba(31, 29, 27, 0.04),
          0 4px 16px rgba(31, 29, 27, 0.05),
          0 12px 40px rgba(31, 29, 27, 0.03);
        overflow: visible;
        animation: cardIn 0.4s ease-out;
      }

      @keyframes cardIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Loading */
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px;
        gap: 16px;
      }

      .loading-pulse {
        display: flex;
        gap: 6px;
      }

      .loading-pulse .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #c2410c;
        animation: pulse 1.4s ease-in-out infinite;
      }

      .loading-pulse .dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .loading-pulse .dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      @keyframes pulse {
        0%,
        80%,
        100% {
          transform: scale(0.6);
          opacity: 0.35;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .loading-state p {
        font-family: 'Sora', sans-serif;
        font-size: 0.82rem;
        color: #a09a94;
      }

      /* Editor body */
      .editor-body {
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        overflow: hidden;
      }

      .editor-body.hidden {
        visibility: hidden;
      }

      /* Toolbar */
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid #f0ede8;
        background: #fdfaf7;
        min-height: 44px;
      }

      .toolbar-left {
        display: flex;
        align-items: center;
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 2px;
      }

      .error-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-family: 'Sora', sans-serif;
        font-size: 0.75rem;
        font-weight: 500;
        color: #dc2626;
        background: #fef2f2;
        padding: 4px 10px;
        border-radius: 20px;
        border: 1px solid #fecaca;
        animation: badgeIn 0.2s ease-out;
      }

      .success-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-family: 'Sora', sans-serif;
        font-size: 0.75rem;
        font-weight: 500;
        color: #16a34a;
        background: #f0fdf4;
        padding: 4px 10px;
        border-radius: 20px;
        border: 1px solid #bbf7d0;
        animation: badgeIn 0.2s ease-out;
      }

      @keyframes badgeIn {
        from {
          opacity: 0;
          transform: scale(0.92);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .tool-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        background: transparent;
        border-radius: 8px;
        cursor: pointer;
        color: #a09a94;
        transition: all 0.15s ease;
      }

      .tool-btn:hover {
        background: #f0ede8;
        color: #1f1d1b;
      }

      .tool-btn:active {
        transform: scale(0.92);
      }

      /* Editor layers */
      .editor-layers {
        position: relative;
        width: 100%;
        height: 420px;
        font-family: 'Newsreader', Georgia, serif;
        font-size: 16px;
        line-height: 1.75;
      }

      .backdrop,
      textarea {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        padding: 20px 24px;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        border: none;
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
        background: #ffffff;
      }

      .backdrop ::ng-deep .misspelled {
        text-decoration: underline wavy #dc2626;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 3px;
        text-decoration-skip-ink: none;
      }

      textarea {
        z-index: 2;
        background-color: transparent;
        color: #1f1d1b;
        resize: none;
        outline: none;
        caret-color: #c2410c;
      }

      textarea::placeholder {
        color: #cdc7c1;
        font-style: italic;
      }

      /* Status bar */
      .status-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 16px;
        border-top: 1px solid #f0ede8;
        background: #fdfaf7;
        font-family: 'Sora', sans-serif;
        font-size: 0.7rem;
        color: #a09a94;
      }

      .status-left {
        display: flex;
        align-items: center;
      }

      .status-active {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #16a34a;
        animation: blink 2.5s ease-in-out infinite;
      }

      @keyframes blink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.35;
        }
      }

      .status-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .status-divider {
        color: #ddd8d3;
      }

      /* Suggestion popup */
      .suggestion-popup {
        position: absolute;
        z-index: 10;
        background: #ffffff;
        border: 1px solid #e8e4df;
        border-radius: 12px;
        box-shadow:
          0 4px 12px rgba(31, 29, 27, 0.08),
          0 12px 32px rgba(31, 29, 27, 0.06);
        min-width: 170px;
        max-width: 260px;
        max-height: 260px;
        overflow-y: auto;
        padding: 4px;
        animation: popupIn 0.15s ease-out;
      }

      @keyframes popupIn {
        from {
          opacity: 0;
          transform: translateY(-4px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .popup-header {
        padding: 6px 12px 4px;
        border-bottom: 1px solid #f0ede8;
        margin-bottom: 2px;
      }

      .popup-word {
        font-family: 'Sora', sans-serif;
        font-size: 0.72rem;
        font-weight: 500;
        color: #dc2626;
        text-transform: lowercase;
      }

      .suggestion-popup button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 8px 12px;
        border: none;
        background: none;
        border-radius: 8px;
        cursor: pointer;
        font-family: 'Newsreader', serif;
        font-size: 14px;
        color: #1f1d1b;
        transition: all 0.1s ease;
      }

      .suggestion-popup button:hover,
      .suggestion-popup button.selected {
        background: #fff7ed;
        color: #c2410c;
      }

      .no-suggestions {
        padding: 10px 14px;
        color: #a09a94;
        font-style: italic;
        font-size: 13px;
        font-family: 'Sora', sans-serif;
      }

      /* Toast */
      .toast {
        position: absolute;
        bottom: 56px;
        left: 50%;
        transform: translateX(-50%);
        background: #1f1d1b;
        color: #ffffff;
        font-family: 'Sora', sans-serif;
        font-size: 0.8rem;
        font-weight: 500;
        padding: 10px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        animation: toastIn 0.2s ease-out;
        pointer-events: none;
        z-index: 20;
        white-space: nowrap;
      }

      @keyframes toastIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      /* Accessibility */
      @media (prefers-reduced-motion: reduce) {
        .editor-card,
        .suggestion-popup,
        .toast,
        .error-badge,
        .success-badge,
        .loading-pulse .dot,
        .status-dot {
          animation: none !important;
        }
      }

      /* Mobile */
      @media (max-width: 640px) {
        .editor-layers {
          height: 300px;
        }
      }
    `,
  ],
})
export class SpellEditorComponent implements OnInit, OnDestroy {
  private readonly spellChecker = inject(SpellCheckerService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroy$ = new Subject<void>();
  private readonly inputSubject = new Subject<string>();
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

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
  readonly selectedSuggestionIndex = signal(0);
  readonly copiedToast = signal(false);

  readonly wordCount = computed(() => {
    const t = this.text().trim();
    return t.length === 0 ? 0 : t.split(/\s+/).length;
  });

  readonly charCount = computed(() => this.text().length);
  readonly errorCount = computed(() => this.misspelledWords().length);

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
        this.selectedSuggestionIndex.set(0);
        this.popupPosition.set({ x: event.offsetX, y: event.offsetY + 24 });
        return;
      }
    }
    this.activeSuggestion.set(null);
  }

  onKeyDown(event: KeyboardEvent): void {
    const active = this.activeSuggestion();
    if (!active) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedSuggestionIndex.update((i) =>
          Math.min(i + 1, active.suggestions.length - 1),
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (active.suggestions.length > 0) {
          this.applySuggestion(active.suggestions[this.selectedSuggestionIndex()], null);
        }
        break;
      case 'Escape':
        this.activeSuggestion.set(null);
        break;
    }
  }

  onBlur(): void {
    setTimeout(() => this.activeSuggestion.set(null), 200);
  }

  selectSuggestion(index: number): void {
    this.selectedSuggestionIndex.set(index);
  }

  applySuggestion(suggestion: string, event: MouseEvent | null): void {
    event?.preventDefault();
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

  copyText(): void {
    const t = this.text();
    if (t.length === 0) return;
    navigator.clipboard.writeText(t).then(() => {
      this.copiedToast.set(true);
      if (this.toastTimeout) clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => this.copiedToast.set(false), 2000);
    });
  }

  clearText(): void {
    this.text.set('');
    if (this.textareaRef) {
      this.textareaRef.nativeElement.value = '';
      this.textareaRef.nativeElement.focus();
    }
    this.misspelledWords.set([]);
    this.activeSuggestion.set(null);
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
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }
}
