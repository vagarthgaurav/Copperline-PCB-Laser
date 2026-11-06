import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  SETTING_GROUPS,
  SettingDef,
  formatSettingValue,
  isValidSettingValue,
  maskBitChanges,
  settingDef,
} from '../../core/grbl-settings';
import { MachineService } from '../../core/machine.service';
import { EmptyNote } from '../../shell/empty-note';
import { Banner } from '../../ui/banner/banner';
import { Button } from '../../ui/button/button';
import { ConfirmDialog } from '../../ui/confirm-dialog/confirm-dialog';
import { Field, FieldValue } from '../../ui/field/field';
import { Icon } from '../../ui/icon/icon';
import { SettingRow } from './setting-row';

interface SettingGroup {
  readonly name: string;
  readonly settings: readonly { def: SettingDef; current: string }[];
}

interface PendingChange {
  readonly def: SettingDef;
  readonly from: string;
  readonly to: string;
  /** Labelled bits that flip, for a mask. */
  readonly bits: readonly string[];
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Content of the Machine page's Settings tab: every setting the connected
 * machine reports (`$$`), grouped, searchable, each with an explanation.
 * Edits are collected here; Submit lists them in a confirmation dialog and
 * only Confirm sends them to the machine.
 */
@Component({
  selector: 'app-settings-section',
  imports: [Field, Button, Icon, EmptyNote, SettingRow, Banner, ConfirmDialog],
  template: `
    <div class="bar">
      <app-field
        class="search"
        kind="text"
        label="Find a setting"
        placeholder="Name, number or word"
        [disabled]="!loaded() && query() === ''"
        [value]="query()"
        (valueChange)="onQuery($event)"
      />
      <button appButton size="sm" [disabled]="!connected() || machine.settingsLoading() || saving()" (click)="reload()">
        <app-icon name="arrow-clockwise" [size]="16" />
        {{ loaded() ? 'Reload' : 'Read' }}
      </button>
    </div>
    <p class="note small">
      The machine stores a setting as soon as it is submitted. Wrong values can make it move the wrong way or fire the
      laser; change a few at a time.
    </p>
    @if (machine.settingsError(); as message) {
      <app-banner severity="error" [message]="message" />
    }
    <div class="submit">
      <button appButton variant="primary" [disabled]="!canSubmit()" (click)="dialogOpen.set(true)">
        Submit changes{{ changes().length > 0 ? ' (' + changes().length + ')' : '' }}
      </button>
      @if (invalidCount() > 0) {
        <span class="small invalid">{{ invalidCount() }} with an invalid value</span>
      } @else if (changes().length > 0 && !machine.canMove()) {
        <span class="small invalid">The machine must be connected and idle.</span>
      }
    </div>
    @if (!connected()) {
      <app-empty-note>Connect to the machine to read its settings.</app-empty-note>
    } @else if (machine.settingsLoading()) {
      <app-empty-note>Reading settings…</app-empty-note>
    } @else if (!loaded()) {
      <app-empty-note>Press Read to load the machine's settings.</app-empty-note>
    } @else if (groups().length === 0) {
      <app-empty-note>No setting matches “{{ query() }}”.</app-empty-note>
    } @else {
      @for (group of groups(); track group.name) {
        <details [open]="query() !== ''">
          <summary>
            <app-icon name="caret-right" [size]="16" />
            {{ group.name }}
            <span class="count small">{{ group.settings.length }}</span>
          </summary>
          <div class="rows">
            @for (item of group.settings; track item.def.id) {
              <app-setting-row
                [def]="item.def"
                [current]="item.current"
                [value]="valueOf(item.def.id, item.current)"
                [changed]="isChanged(item.def.id)"
                [disabled]="!machine.canMove() || saving()"
                (valueChange)="onValue(item.def.id, item.current, $event)"
                (revert)="revert(item.def.id)"
              />
            }
          </div>
        </details>
      }
    }

    <app-confirm-dialog
      heading="Save these settings?"
      [confirmLabel]="'Save ' + changes().length + (changes().length === 1 ? ' setting' : ' settings')"
      [open]="dialogOpen()"
      [busy]="saving()"
      (confirmed)="onConfirm()"
      (cancelled)="dialogOpen.set(false)"
    >
      <p class="lead">
        These {{ changes().length === 1 ? 'change is' : changes().length + ' changes are' }} written to the machine's
        memory and take effect at once.
      </p>
      <ul class="changes">
        @for (change of changes(); track change.def.id) {
          <li>
            <span class="body-strong">\${{ change.def.id }} · {{ change.def.name }}</span>
            <span class="values">
              <span class="from">{{ change.from }}</span>
              <span aria-label="changes to">→</span>
              <span class="to">{{ change.to }}</span>
            </span>
            @if (change.bits.length > 0) {
              <span class="small bits">{{ change.bits.join(', ') }}</span>
            }
          </li>
        }
      </ul>
    </app-confirm-dialog>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .bar {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }

    .search {
      flex: 1;
      min-width: 0;
    }

    .note {
      margin: 0;
      color: var(--ink-muted);
    }

    .submit {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .invalid {
      color: var(--danger);
    }

    details {
      border-top: 1px solid var(--border);
    }

    summary {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 40px;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary app-icon {
      transition: transform 120ms;
    }

    details[open] > summary app-icon {
      transform: rotate(90deg);
    }

    .count {
      margin-left: auto;
      color: var(--ink-muted);
    }

    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-2) 0 var(--space-4);
    }

    .lead {
      margin: 0 0 var(--space-3);
      color: var(--ink-muted);
    }

    .changes {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .changes li {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      background: var(--surface-sunken);
      border-radius: var(--radius-md);
    }

    .values {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-family: var(--font-mono);
    }

    .from {
      color: var(--ink-muted);
    }

    .to {
      color: var(--accent-strong);
      font-weight: 600;
    }

    .bits {
      color: var(--ink-muted);
    }
  `,
})
export class SettingsSection {
  protected readonly machine = inject(MachineService);
  protected readonly query = signal('');
  protected readonly dialogOpen = signal(false);
  protected readonly saving = signal(false);

  /** Edited values by setting number; null is an input that is not a number yet. */
  private readonly drafts = signal<Readonly<Record<number, number | null>>>({});

  protected readonly connected = computed(() => this.machine.connection() === 'connected');
  protected readonly loaded = computed(() => Object.keys(this.machine.settings()).length > 0);

  /** The machine's settings that match the search, by group, in catalog order. */
  protected readonly groups = computed<SettingGroup[]>(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    const found = Object.entries(this.machine.settings())
      .map(([id, current]) => ({ def: settingDef(Number(id)), current }))
      .filter(({ def }) => {
        const text = `$${def.id} ${def.name} ${def.group} ${def.description}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => a.def.id - b.def.id);
    const names: string[] = [...SETTING_GROUPS];
    return names
      .map((name) => ({ name, settings: found.filter(({ def }) => def.group === name) }))
      .filter((group) => group.settings.length > 0);
  });

  /** Every edited setting with a valid value, in number order. */
  protected readonly changes = computed<PendingChange[]>(() => {
    const settings = this.machine.settings();
    const result: PendingChange[] = [];
    for (const [key, to] of Object.entries(this.drafts())) {
      const id = Number(key);
      const def = settingDef(id);
      const from = toNumber(settings[id]);
      if (to === null || from === null || !isValidSettingValue(def, to)) {
        continue;
      }
      result.push({
        def,
        from: formatSettingValue(def, from),
        to: formatSettingValue(def, to),
        bits: def.kind === 'mask' ? maskBitChanges(def, from, to) : [],
      });
    }
    return result.sort((a, b) => a.def.id - b.def.id);
  });

  protected readonly invalidCount = computed(
    () => Object.keys(this.drafts()).length - this.changes().length,
  );

  protected readonly canSubmit = computed(
    () =>
      this.changes().length > 0 &&
      this.invalidCount() === 0 &&
      this.machine.canMove() &&
      !this.machine.settingsLoading() &&
      !this.saving(),
  );

  constructor() {
    if (this.connected() && !this.loaded()) {
      void this.machine.loadSettings();
    }
    // Edits mean nothing once the settings are gone (disconnect or reload).
    effect(() => {
      if (!this.loaded()) {
        this.drafts.set({});
        this.dialogOpen.set(false);
      }
    });
  }

  protected valueOf(id: number, current: string): number | null {
    const drafts = this.drafts();
    return id in drafts ? drafts[id] : toNumber(current);
  }

  protected isChanged(id: number): boolean {
    return id in this.drafts();
  }

  protected onValue(id: number, current: string, value: number | null): void {
    if (value === toNumber(current)) {
      this.revert(id);
    } else {
      this.drafts.update((drafts) => ({ ...drafts, [id]: value }));
    }
  }

  protected revert(id: number): void {
    this.drafts.update((drafts) => {
      const { [id]: _removed, ...rest } = drafts;
      return rest;
    });
  }

  protected onQuery(value: FieldValue): void {
    this.query.set(typeof value === 'string' ? value : '');
  }

  protected reload(): void {
    this.drafts.set({});
    void this.machine.loadSettings();
  }

  /** Writes the changes one by one and stops at the first one the machine refuses; that one and the rest stay edited. */
  protected async onConfirm(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      for (const change of this.changes()) {
        const to = this.drafts()[change.def.id];
        if (to === null || to === undefined || !(await this.machine.writeSetting(change.def.id, String(to)))) {
          break;
        }
        this.revert(change.def.id);
      }
    } finally {
      this.saving.set(false);
      this.dialogOpen.set(false);
    }
  }
}
