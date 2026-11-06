import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Button } from '@app/ui/button/button';
import { Icon } from '@app/ui/icon/icon';
import { UsbEntry, UsbService } from '../core/usb.service';

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Picks Gerber files or a zip from the plugged-in USB stick. Emits the chosen entries. */
@Component({
  selector: 'kiosk-usb-dialog',
  imports: [Button, Icon],
  template: `
    <dialog #dialog aria-labelledby="kiosk-usb-title" (cancel)="onCancel($event)">
      <div class="head">
        <button appButton variant="ghost" [disabled]="!usb.canGoUp()" aria-label="Go up one folder" (click)="usb.up()">
          <app-icon class="back" name="arrow-right" />
          Back
        </button>
        <h2 id="kiosk-usb-title">{{ title() }}</h2>
        <button appButton variant="ghost" (click)="cancelled.emit()">Close</button>
      </div>

      <div class="list" role="group" aria-label="Files on the USB stick">
        @if (usb.error(); as message) {
          <p class="note error" role="alert">{{ message }}</p>
        }
        @if (usb.path() === null) {
          @for (drive of usb.drives(); track drive.path) {
            <button type="button" class="row" (click)="usb.openDrive(drive)">
              <app-icon name="folder-open" />
              <span class="name">{{ drive.name }}</span>
            </button>
          } @empty {
            <p class="note" role="status">Plug in a USB stick. It shows up here in a moment.</p>
          }
        } @else {
          @for (entry of usb.entries(); track entry.path) {
            @if (entry.isDir) {
              <button type="button" class="row" (click)="usb.openDir(entry.path)">
                <app-icon name="folder-open" />
                <span class="name">{{ entry.name }}</span>
              </button>
            } @else {
              <button
                type="button"
                class="row file"
                [attr.aria-pressed]="isPicked(entry)"
                (click)="toggle(entry)"
              >
                <app-icon [name]="isPicked(entry) ? 'check-circle' : 'cube'" [weight]="isPicked(entry) ? 'fill' : 'regular'" />
                <span class="name">{{ entry.name }}</span>
                <span class="size">{{ size(entry) }}</span>
              </button>
            }
          } @empty {
            @if (!usb.loading()) {
              <p class="note" role="status">No folders or Gerber files here.</p>
            }
          }
        }
      </div>

      <div class="foot">
        <button appButton [disabled]="files().length === 0" (click)="pickAll()">Select all files here</button>
        <button appButton variant="primary" [disabled]="picked().length === 0" (click)="confirm()">
          <app-icon name="check" />
          {{ picked().length === 0 ? 'Open' : 'Open ' + picked().length + (picked().length === 1 ? ' file' : ' files') }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      box-sizing: border-box;
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
      max-width: none;
      max-height: none;
      padding: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-200);
      color: var(--ink);
    }

    dialog[open] {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.55);
    }

    .head,
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font: 600 18px/24px var(--font-display);
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .back {
      transform: scaleX(-1);
    }

    .list {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 6px;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: none;
      min-height: 52px;
      padding: 0 var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-300);
      color: var(--ink);
      font: 500 16px/22px var(--font-sans);
      text-align: left;
      cursor: pointer;
    }

    .row:active {
      background: var(--surface-sunken);
    }

    .row[aria-pressed='true'] {
      border-color: var(--accent-strong);
      background: var(--accent-soft);
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-family: var(--font-mono);
      font-size: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .size {
      color: var(--ink-muted);
      font-size: 14px;
    }

    .note {
      margin: var(--space-6) 0;
      color: var(--ink-muted);
      text-align: center;
    }

    .note.error {
      color: var(--danger);
    }
  `,
})
export class UsbDialog {
  protected readonly usb = inject(UsbService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly open = input.required<boolean>();
  readonly chosen = output<UsbEntry[]>();
  readonly cancelled = output<void>();

  private readonly pickedPaths = signal<ReadonlySet<string>>(new Set());

  protected readonly files = computed(() => this.usb.entries().filter((entry) => !entry.isDir));
  protected readonly picked = computed(() => this.files().filter((entry) => this.pickedPaths().has(entry.path)));
  protected readonly title = computed(() => {
    const path = this.usb.path();
    return path === null ? 'Choose a USB stick' : (path.split('/').filter(Boolean).slice(-2).join(' / ') || path);
  });

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        this.pickedPaths.set(new Set());
        el.showModal();
        this.usb.startWatching();
      } else if (!this.open() && el.open) {
        el.close();
        this.usb.stopWatching();
      }
    });
    // Moving to another folder drops the selection: a job is made of files from one place.
    effect(() => {
      this.usb.path();
      this.pickedPaths.set(new Set());
    });
  }

  protected size(entry: UsbEntry): string {
    return formatSize(entry.size);
  }

  protected isPicked(entry: UsbEntry): boolean {
    return this.pickedPaths().has(entry.path);
  }

  protected toggle(entry: UsbEntry): void {
    this.pickedPaths.update((set) => {
      const next = new Set(set);
      if (!next.delete(entry.path)) {
        next.add(entry.path);
      }
      return next;
    });
  }

  protected pickAll(): void {
    this.pickedPaths.set(new Set(this.files().map((entry) => entry.path)));
  }

  protected confirm(): void {
    this.chosen.emit(this.picked());
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }
}
