export type HapticPattern =
  | 'tap'
  | 'toggle'
  | 'success'
  | 'wake'
  | 'warning';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 10,
  toggle: 18,
  success: [14, 36, 22],
  wake: [16, 42, 24],
  warning: [26, 32, 26],
};

/**
 * Triggers short tactile haptic feedback on supported mobile devices (Android/PWA).
 * Safe no-op on desktop browsers or devices without Vibration API support.
 */
export function triggerHaptic(pattern: HapticPattern = 'tap'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Ignore browser gesture/policy restrictions on Vibration API
  }
}
