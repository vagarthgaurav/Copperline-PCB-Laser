import { Service, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import type { WorkspaceTab } from '../title-bar/title-bar';

const TABS: readonly WorkspaceTab[] = ['design', 'simulate', 'machine'];

/** Maps a router URL such as `/simulate?x=1` to a workspace tab, or null if it is none of them. */
export function tabFromUrl(url: string): WorkspaceTab | null {
  const first = url.split(/[?#]/)[0].split('/').find((segment) => segment !== '');
  return TABS.find((tab) => tab === first) ?? null;
}

/**
 * Keeps the title-bar tab and the router URL in sync. `tab` follows the URL
 * (falling back to `design` before the first navigation or on an unknown URL);
 * `select` navigates to the workspace.
 */
@Service()
export class WorkspaceRouter {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly tab = computed<WorkspaceTab>(() => tabFromUrl(this.url()) ?? 'design');

  select(tab: WorkspaceTab): Promise<boolean> {
    return this.router.navigate(['/', tab]);
  }
}
