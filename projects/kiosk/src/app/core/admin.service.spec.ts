import { TestBed } from '@angular/core/testing';
import { ADMIN_IDLE_MINUTES, AdminService } from './admin.service';

describe('AdminService', () => {
  afterEach(() => vi.useRealTimers());

  it('stays locked on a wrong password and opens on the right one', async () => {
    const admin = TestBed.inject(AdminService);
    expect(admin.unlocked()).toBe(false);
    expect(await admin.unlock('nope')).toBe(false);
    expect(admin.unlocked()).toBe(false);
    expect(await admin.unlock('copperline')).toBe(true);
    expect(admin.unlocked()).toBe(true);
    admin.lock();
    expect(admin.unlocked()).toBe(false);
  });

  it('locks again after the idle time, and a touch restarts the countdown', async () => {
    vi.useFakeTimers();
    const admin = TestBed.inject(AdminService);
    await admin.unlock('copperline');
    vi.advanceTimersByTime((ADMIN_IDLE_MINUTES - 1) * 60_000);
    admin.touch();
    vi.advanceTimersByTime((ADMIN_IDLE_MINUTES - 1) * 60_000);
    expect(admin.unlocked()).toBe(true);
    vi.advanceTimersByTime(2 * 60_000);
    expect(admin.unlocked()).toBe(false);
  });

  it('ignores touches while locked', () => {
    const admin = TestBed.inject(AdminService);
    admin.touch();
    expect(admin.unlocked()).toBe(false);
  });
});
