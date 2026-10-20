import { Component } from '@angular/core';

/** Muted one-line empty state for a panel section, for example "No Gerber loaded." */
@Component({
  selector: 'app-empty-note',
  template: `<p><ng-content /></p>`,
  styles: `
    :host {
      display: block;
    }

    p {
      margin: 0;
      color: var(--ink-muted);
      font: 14px/20px var(--font-sans);
    }
  `,
})
export class EmptyNote {}
