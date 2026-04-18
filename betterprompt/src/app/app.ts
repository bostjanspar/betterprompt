import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SpellEditorComponent } from './components/spell-editor.component';

@Component({
  selector: 'app-root',
  imports: [SpellEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="container">
      <h1>Betterprompt</h1>
      <app-spell-editor />
    </main>
  `,
  styles: [
    `
      .container {
        max-width: 900px;
        margin: 40px auto;
        padding: 0 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      h1 {
        margin-bottom: 24px;
        font-weight: 600;
        color: #1a1a1a;
      }
    `,
  ],
})
export class App {}
