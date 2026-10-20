import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WorkspaceRouter, tabFromUrl } from './workspace-router';

@Component({ template: '' })
class Blank {}

describe('tabFromUrl', () => {
  it('reads the first path segment', () => {
    expect(tabFromUrl('/design')).toBe('design');
    expect(tabFromUrl('/simulate?x=1')).toBe('simulate');
    expect(tabFromUrl('/machine#top')).toBe('machine');
  });

  it('returns null for anything else', () => {
    expect(tabFromUrl('/')).toBeNull();
    expect(tabFromUrl('')).toBeNull();
    expect(tabFromUrl('/other')).toBeNull();
  });
});

describe('WorkspaceRouter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', redirectTo: 'design' },
          { path: 'design', component: Blank },
          { path: 'simulate', component: Blank },
          { path: 'machine', component: Blank },
          { path: 'elsewhere', component: Blank },
        ]),
      ],
    });
  });

  it('defaults to design before any navigation', () => {
    expect(TestBed.inject(WorkspaceRouter).tab()).toBe('design');
  });

  it('follows the URL', async () => {
    const workspace = TestBed.inject(WorkspaceRouter);
    await TestBed.inject(Router).navigateByUrl('/machine');
    expect(workspace.tab()).toBe('machine');
    await TestBed.inject(Router).navigateByUrl('/simulate');
    expect(workspace.tab()).toBe('simulate');
  });

  it('falls back to design on an unknown URL', async () => {
    const workspace = TestBed.inject(WorkspaceRouter);
    await TestBed.inject(Router).navigateByUrl('/machine');
    await TestBed.inject(Router).navigateByUrl('/elsewhere');
    expect(workspace.tab()).toBe('design');
  });

  it('navigates when a tab is selected', async () => {
    const workspace = TestBed.inject(WorkspaceRouter);
    await workspace.select('simulate');
    expect(TestBed.inject(Router).url).toBe('/simulate');
    expect(workspace.tab()).toBe('simulate');
  });
});
