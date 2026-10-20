import { Component, ElementRef, computed, inject, input, model, output, viewChildren } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { WindowService } from '../core/window.service';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { IconName } from '../ui/icon/icons';
import { MachineStatus, StatusChip } from '../ui/status-chip/status-chip';
import { WindowControls } from './window-controls';

export type WorkspaceTab = 'design' | 'simulate' | 'machine';

interface TabDef {
  readonly id: WorkspaceTab;
  readonly label: string;
  readonly icon: IconName;
}

const TABS: readonly TabDef[] = [
  { id: 'design', label: 'Design', icon: 'cube' },
  { id: 'simulate', label: 'Simulate', icon: 'play' },
  { id: 'machine', label: 'Machine', icon: 'plugs-connected' },
];

/**
 * Custom 48px window title bar: brand, workspace tabs, file chip, machine
 * status, theme toggle, the single primary Export action and window controls.
 * Only the spacer and the file chip carry `data-tauri-drag-region`.
 */
@Component({
  selector: 'app-title-bar',
  imports: [Button, Icon, StatusChip, WindowControls],
  templateUrl: './title-bar.html',
  styleUrl: './title-bar.scss',
  host: {
    '[class.inactive]': '!win.focused()',
    '[class.maximized]': 'win.maximized()',
  },
})
export class TitleBar {
  protected readonly theme = inject(ThemeService);
  protected readonly win = inject(WindowService);

  /** Active workspace. The shell binds this to the router. */
  readonly tab = model<WorkspaceTab>('design');
  /** Name of the loaded file; the chip is hidden when null. */
  readonly fileName = input<string | null>(null);
  /** Optional text after the file name, such as "Top side". */
  readonly fileDetail = input<string | null>(null);
  readonly status = input<MachineStatus>('disconnected');
  /** Overrides the default word for the status. */
  readonly statusLabel = input<string>();
  readonly exportDisabled = input(false);
  readonly exportRequested = output<void>();

  protected readonly tabs = TABS;
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected readonly themeIcon = computed<IconName>(() => (this.theme.theme() === 'light' ? 'moon' : 'sun'));

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const last = TABS.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.tab.set(TABS[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}
