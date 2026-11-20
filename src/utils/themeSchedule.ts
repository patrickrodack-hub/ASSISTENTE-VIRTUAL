export type ResolvedThemeMode = 'sala-stark' | 'hologram' | 'dark' | 'light';
export type ThemeMode = 'auto' | ResolvedThemeMode;

export interface AutoThemeSchedule {
  /** Hour (0-23) when daytime "Sala Stark" activates */
  dayStartHour: number;
  /** Hour (0-23) when nighttime "Holográfico" activates */
  nightStartHour: number;
}

export const DEFAULT_AUTO_THEME_SCHEDULE: AutoThemeSchedule = {
  dayStartHour: 6,
  nightStartHour: 18,
};

export const AUTO_THEME_SCHEDULE_STORAGE_KEY = 'rodack_auto_theme_schedule_v1';

export function clampHour(hour: number, fallback: number): number {
  if (!Number.isFinite(hour)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(hour)));
}

export function loadAutoThemeSchedule(): AutoThemeSchedule {
  if (typeof window === 'undefined') return DEFAULT_AUTO_THEME_SCHEDULE;
  try {
    const raw = window.localStorage.getItem(AUTO_THEME_SCHEDULE_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_THEME_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<AutoThemeSchedule>;
    const dayStartHour = clampHour(
      Number(parsed.dayStartHour),
      DEFAULT_AUTO_THEME_SCHEDULE.dayStartHour
    );
    const nightStartHour = clampHour(
      Number(parsed.nightStartHour),
      DEFAULT_AUTO_THEME_SCHEDULE.nightStartHour
    );
    if (dayStartHour === nightStartHour) {
      return DEFAULT_AUTO_THEME_SCHEDULE;
    }
    return { dayStartHour, nightStartHour };
  } catch {
    return DEFAULT_AUTO_THEME_SCHEDULE;
  }
}

export function saveAutoThemeSchedule(schedule: AutoThemeSchedule): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AUTO_THEME_SCHEDULE_STORAGE_KEY,
      JSON.stringify(schedule)
    );
  } catch {
    // ignore storage errors
  }
}

/**
 * Resolves between 'sala-stark' (daytime) and 'hologram' (nighttime)
 * based on the current local hour and configured schedule.
 */
export function resolveAutoThemeByHour(
  hour: number,
  schedule: AutoThemeSchedule = DEFAULT_AUTO_THEME_SCHEDULE
): 'sala-stark' | 'hologram' {
  const { dayStartHour, nightStartHour } = schedule;
  if (dayStartHour < nightStartHour) {
    return hour >= dayStartHour && hour < nightStartHour
      ? 'sala-stark'
      : 'hologram';
  }
  // Inverted schedule (e.g., dayStart 20, nightStart 8)
  return hour >= dayStartHour || hour < nightStartHour
    ? 'sala-stark'
    : 'hologram';
}

export function formatHourLabel(hour: number): string {
  return `${String(clampHour(hour, 0)).padStart(2, '0')}:00`;
}

export interface AutoThemeTransitionInfo {
  activeAutoTheme: 'sala-stark' | 'hologram';
  activeThemeLabel: string;
  nextTheme: 'sala-stark' | 'hologram';
  nextThemeLabel: string;
  nextSwitchHourLabel: string;
  remainingText: string;
}

export function getAutoThemeTransitionInfo(
  now: Date,
  schedule: AutoThemeSchedule = DEFAULT_AUTO_THEME_SCHEDULE
): AutoThemeTransitionInfo {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const activeAutoTheme = resolveAutoThemeByHour(currentHour, schedule);
  const nextTheme: 'sala-stark' | 'hologram' =
    activeAutoTheme === 'sala-stark' ? 'hologram' : 'sala-stark';
  const targetHour =
    nextTheme === 'hologram' ? schedule.nightStartHour : schedule.dayStartHour;

  const nowTotalMin = currentHour * 60 + currentMinute;
  let targetTotalMin = targetHour * 60;
  if (targetTotalMin <= nowTotalMin) {
    targetTotalMin += 24 * 60;
  }
  const diffMin = targetTotalMin - nowTotalMin;
  const remH = Math.floor(diffMin / 60);
  const remM = diffMin % 60;

  const remainingText =
    remH > 0
      ? remM > 0
        ? `em ${remH}h ${remM}min`
        : `em ${remH}h`
      : `em ${Math.max(1, remM)}min`;

  return {
    activeAutoTheme,
    activeThemeLabel:
      activeAutoTheme === 'sala-stark' ? 'Sala Stark' : 'Holográfico',
    nextTheme,
    nextThemeLabel: nextTheme === 'sala-stark' ? 'Sala Stark' : 'Holográfico',
    nextSwitchHourLabel: formatHourLabel(targetHour),
    remainingText,
  };
}
