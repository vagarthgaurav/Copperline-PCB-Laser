import { Component, computed, inject, linkedSignal } from '@angular/core';
import { GerberService } from '../../core/gerber.service';
import { EmptyNote } from '../../shell/empty-note';
import { Banner } from '../../ui/banner/banner';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';

/** Accepted when picking files: common Gerber and Excellon extensions from KiCad, Altium, Eagle and friends. */
export const GERBER_ACCEPT =
  '.gbr,.ger,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gko,.gm1,.gml,.drl,.xln,.exc,.txt,.zip';

/** Rounds to 0.1 mm and drops a trailing ".0". */
function formatMm(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** Content of the Design page's Project section: open button, file card, load banners. */
@Component({
  selector: 'app-project-section',
  imports: [Button, Icon, Banner, EmptyNote],
  template: `
    @if (project(); as project) {
      <div class="filecard">
        <span class="ficon"><app-icon name="cube" /></span>
        <div class="meta">
          <div class="nm">{{ project.name }}</div>
          <div class="small muted">{{ summary() }}</div>
          @if (project.skipped.length > 0) {
            <div class="small muted">{{ project.skipped.length }} skipped</div>
          }
        </div>
      </div>
    } @else if (!loading()) {
      <app-empty-note>No Gerber loaded. Open a Gerber or a zip of Gerbers to see the board.</app-empty-note>
    }

    <input
      #picker
      class="picker"
      type="file"
      multiple
      [accept]="accept"
      (change)="onPicked(picker)"
    />
    <button
      appButton
      class="open"
      [disabled]="loading()"
      [attr.aria-busy]="loading()"
      (click)="picker.click()"
    >
      <app-icon name="folder-open" />
      {{ loading() ? 'Reading files…' : 'Open Gerber…' }}
    </button>
    @if (loading()) {
      <p class="small muted status" role="status">Reading and parsing the Gerber files.</p>
    }

    @if (error(); as message) {
      <app-banner
        severity="error"
        [message]="message"
        dismissible
        (dismissed)="gerber.clearError()"
      />
    }
    @if (!skippedDismissed() && skippedMessage(); as message) {
      <app-banner
        severity="warning"
        [message]="message"
        dismissible
        (dismissed)="skippedDismissed.set(true)"
      />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .picker {
      display: none;
    }

    .open {
      width: 100%;
    }

    .status {
      margin: 0;
    }

    .muted {
      color: var(--ink-muted);
    }

    .filecard {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: var(--surface-300);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }

    .ficon {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--accent-strong);
    }

    .meta {
      min-width: 0;
    }

    .nm {
      overflow-wrap: anywhere;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 500;
      line-height: 18px;
    }
  `,
})
export class ProjectSection {
  protected readonly gerber = inject(GerberService);
  protected readonly accept = GERBER_ACCEPT;

  protected readonly project = this.gerber.project;
  protected readonly loading = this.gerber.loading;
  protected readonly error = this.gerber.error;

  /** Closing the skipped-files banner lasts until the next project is loaded. */
  protected readonly skippedDismissed = linkedSignal({
    source: this.project,
    computation: () => false,
  });

  protected readonly summary = computed(() => {
    const project = this.project();
    if (!project) {
      return '';
    }
    const count = project.layers.length;
    let text = `${count} ${count === 1 ? 'layer' : 'layers'}`;
    const board = this.gerber.board();
    if (board) {
      text += ` · ${formatMm(board.width)} × ${formatMm(board.height)} mm`;
    }
    return text;
  });

  protected readonly skippedMessage = computed(() => {
    const skipped = this.project()?.skipped ?? [];
    if (skipped.length === 0) {
      return null;
    }
    const count = skipped.length;
    let text = `${count} ${count === 1 ? 'file was' : 'files were'} skipped (not used for engraving).`;
    // Files that failed to parse are worth naming; unused layers such as mask or silkscreen are not.
    const unreadable = skipped.filter((file) => file.reason.startsWith('Could not parse'));
    if (unreadable.length > 0) {
      text += ` Could not read: ${unreadable.map((file) => file.fileName).join(', ')}.`;
    }
    return text;
  });

  protected onPicked(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    // Reset so choosing the same files again still fires `change`.
    input.value = '';
    void this.gerber.load(files);
  }
}
