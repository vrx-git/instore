import { describe, expect, it } from 'vitest';
import { AUTO_RENEW_GAP_MS, shouldAutoRenew } from '../src/sync/google';

const now = 1_000_000_000;
const base = { email: 'shop@gmail.com', online: true, lastAttempt: 0, now };
const tok = (minsLeft: number, email = 'shop@gmail.com') => ({ expiresAt: now + minsLeft * 60_000, email });

describe('quiet Google renewal at login', () => {
  it('renews when there is no token or it is nearly expired', () => {
    expect(shouldAutoRenew({ ...base, token: null })).toBe(true);
    expect(shouldAutoRenew({ ...base, token: tok(-5) })).toBe(true);
    expect(shouldAutoRenew({ ...base, token: tok(5) })).toBe(true);
  });
  it('does not renew a fresh token', () => {
    expect(shouldAutoRenew({ ...base, token: tok(45) })).toBe(false);
  });
  it('renews if the token belongs to a different account', () => {
    expect(shouldAutoRenew({ ...base, token: tok(45, 'other@gmail.com') })).toBe(true);
  });
  it('does nothing when backup is off or offline', () => {
    expect(shouldAutoRenew({ ...base, email: '', token: null })).toBe(false);
    expect(shouldAutoRenew({ ...base, online: false, token: null })).toBe(false);
  });
  it('waits 10 minutes between automatic attempts (no redirect loops)', () => {
    expect(shouldAutoRenew({ ...base, token: null, lastAttempt: now - 60_000 })).toBe(false);
    expect(shouldAutoRenew({ ...base, token: null, lastAttempt: now - AUTO_RENEW_GAP_MS })).toBe(true);
  });
});
