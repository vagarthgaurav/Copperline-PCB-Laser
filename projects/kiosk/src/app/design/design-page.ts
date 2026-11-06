import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { GerberService } from '@app/core/gerber.service';
import { MachineService } from '@app/core/machine.service';
import { PlacementService } from '@app/core/placement.service';
import { formatEta } from '@app/features/machine/machine-format';
import { Banner } from '@app/ui/banner/banner';
import { Button } from '@app/ui/button/button';
import { ConfirmDialog } from '@app/ui/confirm-dialog/confirm-dialog';
import { Icon } from '@app/ui/icon/icon';
import { JobControl } from '../core/job-control.service';
import { UsbEntry, UsbService } from '../core/usb.service';
import { BoardCanvas } from '../ui/board-canvas';
import { UsbDialog } from '../ui/usb-dialog';

/**
 * The only screen operators see: pick a board from the USB stick, drag it to
 * where it sits on the peg board, home the machine, Start and Stop. It fits
 * the 800 x 480 touch display with 52 px buttons.
 */
@Component({
  selector: 'kiosk-design-page',
  imports: [BoardCanvas, Button, Icon, Banner, ConfirmDialog, UsbDialog],
  template: `
    <section class="stage" aria-label="Board placement">
      <kiosk-board-canvas class="canvas" />
      <span class="chip side" aria-live="polite">{{ placement.side() === 'top' ? 'Top side' : 'Bottom side' }}</span>
      @if (!gerber.project() && !gerber.loading()) {
        <p class="empty">Plug in a USB stick, then tap <strong>Open board</strong>.</p>
      }
      @if (gerber.loading()) {
        <p class="empty" role="status">Reading the board…</p>
      }
      @if (machine.job(); as job) {
        <div class="progress">
          <div class="bar" role="progressbar" aria-label="Engraving progress" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percent()">
            <i [style.width.%]="percent()"></i>
          </div>
          <span class="text">{{ percent() }}% · {{ eta() }} left</span>
        </div>
      }
    </section>

    <section class="controls" aria-label="Controls">
      @if (gerber.error(); as message) {
        <app-banner severity="error" [message]="message" dismissible (dismissed)="gerber.clearError()" />
      }
      @if (usbError(); as message) {
        <app-banner severity="error" [message]="message" dismissible (dismissed)="usbError.set(null)" />
      }
      @if (machine.alarm()) {
        <app-banner severity="error" [message]="machine.alarmText()">
          <button appButton size="sm" (click)="machine.unlock()">Unlock</button>
        </app-banner>
      }
      @if (result(); as r) {
        <app-banner [severity]="r.severity" [message]="r.text" dismissible (dismissed)="resultDismissed.set(true)" />
      }
      @if (jobControl.error(); as message) {
        <app-banner severity="error" [message]="message" />
      }

      <button appButton class="wide" (click)="usbOpen.set(true)">
        <app-icon name="folder-open" />
        {{ gerber.project() ? 'Change board' : 'Open board' }}
      </button>
      @if (gerber.project(); as project) {
        <p class="board" [title]="project.name">{{ project.name }}</p>
      }

      <div class="pair">
        <button appButton [disabled]="!gerber.project()" (click)="placement.rotate()">
          <app-icon name="arrow-clockwise" />
          Rotate
        </button>
        <button appButton [disabled]="!gerber.project()" (click)="flip()">
          <app-icon name="flip-horizontal" />
          Flip
        </button>
      </div>

      <div class="home">
        <button appButton class="wide" [disabled]="!machine.canMove()" (click)="machine.home()">
          <app-icon name="house" />
          Home
        </button>
        <div class="pair">
          <button appButton size="sm" [disabled]="!machine.canMove()" (click)="machine.homeAxis('X')">Home X</button>
          <button appButton size="sm" [disabled]="!machine.canMove()" (click)="machine.homeAxis('Y')">Home Y</button>
        </div>
      </div>

      <div class="pair run">
        <button appButton variant="danger" [disabled]="!jobControl.canStop()" (click)="jobControl.stop()">
          <app-icon name="stop" />
          Stop
        </button>
        <button
          appButton
          variant="primary"
          [disabled]="!jobControl.canStart()"
          [attr.aria-describedby]="jobControl.startBlocker() ? 'kiosk-start-hint' : null"
          (click)="jobControl.requestStart()"
        >
          <app-icon name="play" />
          Start
        </button>
      </div>
      @if (jobControl.startBlocker(); as hint) {
        <p id="kiosk-start-hint" class="hint">{{ hint }}</p>
      }
    </section>

    <app-confirm-dialog
      heading="Start engraving?"
      confirmLabel="Start"
      [open]="jobControl.confirming()"
      [busy]="jobControl.preparing()"
      (confirmed)="jobControl.confirmStart()"
      (cancelled)="jobControl.cancel()"
    >
      <p class="confirm-text">
        The laser will engrave <strong>{{ gerber.project()?.name }}</strong> on the
        {{ placement.side() === 'top' ? 'top' : 'bottom' }} side. Check that the board is pinned and the lid is closed.
      </p>
    </app-confirm-dialog>

    <kiosk-usb-dialog [open]="usbOpen()" (chosen)="onChosen($event)" (cancelled)="usbOpen.set(false)" />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 228px;
      gap: var(--space-2);
      height: 100%;
      min-height: 0;
      padding: var(--space-2);
      box-sizing: border-box;
    }

    .stage {
      position: relative;
      display: flex;
      min-width: 0;
      min-height: 0;
    }

    .canvas {
      flex: 1;
    }

    .chip {
      position: absolute;
      top: var(--space-2);
      left: var(--space-2);
      padding: 4px 12px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-pill);
      background: var(--surface-300);
      font-size: 14px;
      font-weight: 600;
      pointer-events: none;
    }

    .empty {
      position: absolute;
      inset: auto var(--space-4) var(--space-4);
      margin: 0;
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-300);
      text-align: center;
      pointer-events: none;
    }

    .progress {
      position: absolute;
      inset: auto var(--space-3) var(--space-3);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-300);
      pointer-events: none;
    }

    .bar {
      flex: 1;
      height: 10px;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    .bar i {
      display: block;
      height: 100%;
      background: var(--accent);
    }

    .text {
      font: 500 14px/20px var(--font-mono);
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .wide {
      width: 100%;
    }

    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    .home {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .run {
      margin-top: auto;
    }

    .board {
      margin: 0;
      overflow: hidden;
      color: var(--ink-muted);
      font: 500 13px/18px var(--font-mono);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hint {
      margin: 0;
      color: var(--ink-muted);
      font-size: 13px;
      line-height: 18px;
    }

    .confirm-text {
      margin: 0;
    }
  `,
})
export class DesignPage {
  protected readonly gerber = inject(GerberService);
  protected readonly placement = inject(PlacementService);
  protected readonly machine = inject(MachineService);
  protected readonly jobControl = inject(JobControl);
  private readonly usb = inject(UsbService);

  protected readonly usbOpen = signal(false);
  protected readonly usbError = signal<string | null>(null);

  protected readonly percent = computed(() => Math.round(this.machine.progress() * 100));
  protected readonly eta = computed(() => formatEta(this.machine.job()?.etaSeconds ?? 0));

  /** The last job's outcome stays on screen until dismissed, and a new job clears it. */
  protected readonly resultDismissed = linkedSignal<unknown, boolean>({
    source: () => this.machine.jobResult(),
    computation: () => false,
  });

  protected readonly result = computed<{ severity: 'warning' | 'error'; text: string } | null>(() => {
    const result = this.machine.jobResult();
    if (result === null || this.resultDismissed()) {
      return null;
    }
    switch (result.kind) {
      case 'completed':
        return { severity: 'warning', text: 'Engraving finished.' };
      case 'stopped':
        return { severity: 'warning', text: 'Engraving stopped.' };
      case 'failed':
        return { severity: 'error', text: `Engraving failed. ${result.message}` };
    }
  });

  protected flip(): void {
    this.placement.setSide(this.placement.side() === 'top' ? 'bottom' : 'top');
  }

  protected async onChosen(entries: UsbEntry[]): Promise<void> {
    this.usbOpen.set(false);
    this.usbError.set(null);
    try {
      await this.gerber.load(await this.usb.readFiles(entries));
    } catch (error) {
      this.usbError.set(typeof error === 'string' ? error : 'Could not read the files from the USB stick.');
    }
  }
}
