import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SpellEditorComponent } from './components/spell-editor.component';

@Component({
  selector: 'app-root',
  imports: [SpellEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="app-shell">
      <header class="header">
        <h1>Betterprompt</h1>
        <p class="subtitle">Write better prompts, with confidence</p>
      </header>
      <section class="editor-section">
        <app-spell-editor />
      </section>
    </main>
  `,
  styles: [
    `
      .app-shell {
        min-height: 100vh;
        background: #F5F3EE;
      }

      .header {
        padding: 52px 24px 28px;
        text-align: center;
      }

      .header h1 {
        font-family: 'Newsreader', Georgia, serif;
        font-size: 2.5rem;
        font-weight: 700;
        color: #1F1D1B;
        letter-spacing: -0.025em;
        line-height: 1.1;
      }

      .subtitle {
        font-family: 'Sora', sans-serif;
        font-size: 0.9rem;
        color: #8A8480;
        margin-top: 8px;
        font-weight: 400;
        letter-spacing: 0.01em;
      }

      .editor-section {
        max-width: 860px;
        margin: 0 auto;
        padding: 0 24px 80px;
      }

      @media (max-width: 640px) {
        .header {
          padding: 36px 16px 20px;
        }
        .header h1 {
          font-size: 1.9rem;
        }
        .editor-section {
          padding: 0 12px 48px;
        }
      }
    `,
  ],
})
export class App {}
