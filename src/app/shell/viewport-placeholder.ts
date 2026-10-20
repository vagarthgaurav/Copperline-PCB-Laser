import { Component } from '@angular/core';

/** Stand-in for the 3D viewport until the Three.js scene exists. */
@Component({
  selector: 'app-viewport-placeholder',
  template: `<p><ng-content /></p>`,
  styles: `
    :host {
      display: grid;
      flex: 1;
      place-items: center;
      box-sizing: border-box;
      min-height: 0;
      padding: var(--space-4);
      background: var(--scene-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      text-align: center;
    }

    p {
      margin: 0;
      color: var(--ink-muted);
      font: 14px/20px var(--font-sans);
    }
  `,
})
export class ViewportPlaceholder {}
