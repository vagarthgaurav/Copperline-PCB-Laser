import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MachineService } from '@app/core/machine.service';
import { ThemeService } from '@app/core/theme.service';
import { WorkspaceRouter } from '@app/core/workspace-router';
import { Button } from '@app/ui/button/button';
import { Icon } from '@app/ui/icon/icon';
import { StatusChip } from '@app/ui/status-chip/status-chip';
import { TabItem, Tabs } from '@app/ui/tabs/tabs';
import { AdminService } from './core/admin.service';
import { MachineLink } from './core/machine-link.service';
import { AdminDialog } from './ui/admin-dialog';

const ADMIN_TABS: readonly TabItem[] = [
  { id: 'design', label: 'Design' },
  { id: 'simulate', label: 'Simulate' },
  { id: 'machine', label: 'Machine' },
];

/**
 * Kiosk shell for the 7 inch touch display: a slim bar and the routed page.
 * Operators only ever see Design. The Admin button asks for a password and
 * then adds the Simulate and Machine tabs until the idle timeout or Lock.
 */
@Component({
  selector: 'kiosk-root',
  imports: [RouterOutlet, Button, Icon, StatusChip, Tabs, AdminDialog],
  host: { '(pointerdown)': 'admin.touch()' },
  template: `
    <header class="bar">
      <h1 class="brand">Copperline</h1>
      @if (admin.unlocked()) {
        <app-tabs class="tabs" label="Workspaces" idPrefix="kiosk" [tabs]="tabs" [selected]="workspace.tab()" (selectedChange)="select($event)" />
      }
      <span class="spacer"></span>
      <app-status-chip [status]="machine.status()" />
      <button appButton iconOnly [attr.aria-label]="theme.toggleLabel()" (click)="theme.toggle()">
        <app-icon [name]="theme.theme() === 'light' ? 'moon' : 'sun'" />
      </button>
      @if (admin.unlocked()) {
        <button appButton (click)="admin.lock()">Lock</button>
      } @else {
        <button appButton variant="ghost" (click)="askPassword.set(true)">
          <app-icon name="sliders-horizontal" />
          Admin
        </button>
      }
    </header>
    <main class="page" [id]="'kiosk-panel-' + workspace.tab()" [attr.role]="admin.unlocked() ? 'tabpanel' : null" [attr.aria-labelledby]="admin.unlocked() ? 'kiosk-tab-' + workspace.tab() : null">
      <router-outlet />
    </main>
    <kiosk-admin-dialog [open]="askPassword()" (unlocked)="askPassword.set(false)" (cancelled)="askPassword.set(false)" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .bar {
      display: flex;
      align-items: center;
      flex: none;
      gap: var(--space-2);
      height: 60px;
      padding: 0 var(--space-2);
      box-sizing: border-box;
      border-bottom: 1px solid var(--border);
      background: var(--surface-200);
    }

    .brand {
      margin: 0;
      font: 700 20px/1 var(--font-display);
    }

    .spacer {
      flex: 1;
    }

    .page {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    .page > :not(router-outlet) {
      flex: 1;
      min-height: 0;
    }
  `,
})
export class App {
  protected readonly admin = inject(AdminService);
  protected readonly workspace = inject(WorkspaceRouter);
  protected readonly machine = inject(MachineService);
  protected readonly theme = inject(ThemeService);
  private readonly link = inject(MachineLink);

  protected readonly tabs = ADMIN_TABS;
  protected readonly askPassword = signal(false);
  protected readonly onDesign = computed(() => this.workspace.tab() === 'design');

  constructor() {
    this.link.start();
    // Locking (button or idle timeout) closes the admin pages.
    effect(() => {
      if (!this.admin.unlocked() && this.workspace.tab() !== 'design') {
        void this.workspace.select('design');
      }
    });
  }

  protected select(id: string): void {
    if (id === 'design' || id === 'simulate' || id === 'machine') {
      void this.workspace.select(id);
    }
  }
}
