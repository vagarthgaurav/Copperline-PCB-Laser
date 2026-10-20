import { TestBed } from '@angular/core/testing';
import { PANEL_WIDTHS_STORAGE_KEY, PanelWidthService } from './panel-width.service';

function create(): PanelWidthService {
  return TestBed.inject(PanelWidthService);
}

describe('PanelWidthService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('defaults both panels to 320 px', () => {
    const service = create();
    expect(service.left()).toBe(320);
    expect(service.right()).toBe(320);
  });

  it('clamps widths to 240..560 px', () => {
    const service = create();
    service.setLeft(100);
    service.setRight(900);
    expect(service.left()).toBe(240);
    expect(service.right()).toBe(560);
    service.setLeft(9999);
    expect(service.left()).toBe(560);
  });

  it('keeps the centre at 480 px or more when room is reported', () => {
    const service = create();
    service.setAvailable(1100);
    service.setRight(300);
    service.setLeft(560);
    // 1100 - 480 - 300
    expect(service.left()).toBe(320);
    expect(service.leftMax()).toBe(320);
    expect(service.rightMax()).toBe(300);
  });

  it('shrinks the shown widths when the window shrinks and restores them when it grows', () => {
    const service = create();
    service.setAvailable(2000);
    service.setLeft(560);
    service.setRight(400);
    service.setAvailable(1036);
    expect(service.left() + service.right()).toBe(1036 - 480);
    expect(service.left()).toBeGreaterThanOrEqual(240);
    expect(service.right()).toBeGreaterThanOrEqual(240);
    expect(service.left()).toBeGreaterThanOrEqual(service.right());
    service.setAvailable(2000);
    expect(service.left()).toBe(560);
    expect(service.right()).toBe(400);
  });

  it('never goes below the minimum even in a tiny window', () => {
    const service = create();
    service.setAvailable(300);
    expect(service.left()).toBe(240);
    expect(service.right()).toBe(240);
  });

  it('persists and restores widths', () => {
    create().setLeft(400);
    TestBed.resetTestingModule();
    const service = create();
    expect(service.left()).toBe(400);
    expect(service.right()).toBe(320);
    expect(JSON.parse(localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY)!)).toEqual({
      left: 400,
      right: 320,
    });
  });

  it('does not persist the shrunken widths of a small window', () => {
    const service = create();
    service.setLeft(500);
    service.setRight(500);
    service.setAvailable(1036);
    expect(JSON.parse(localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY)!)).toEqual({
      left: 500,
      right: 500,
    });
  });

  it.each(['not json', '"text"', 'null', '[]', '{"left":"wide","right":null}'])(
    'falls back to defaults for corrupt storage %s',
    (raw) => {
      localStorage.setItem(PANEL_WIDTHS_STORAGE_KEY, raw);
      const service = create();
      expect(service.left()).toBe(320);
      expect(service.right()).toBe(320);
    },
  );

  it('clamps out-of-range stored values and keeps the good half', () => {
    localStorage.setItem(PANEL_WIDTHS_STORAGE_KEY, JSON.stringify({ left: 5000, right: 'x' }));
    const service = create();
    expect(service.left()).toBe(560);
    expect(service.right()).toBe(320);
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const service = create();
    expect(service.left()).toBe(320);
    service.setLeft(350);
    expect(service.left()).toBe(350);
  });
});
