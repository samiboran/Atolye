/**
 * Simple client-side production/export limit, per roadmap item
 * "Kullanıcı arayüzü + üretim limiti sistemi". Purely local (localStorage) -
 * there is no server to enforce a real quota, but it caps how much export
 * work (and thus battery/CPU) a single browser session will do in a day,
 * and caps how long any single exported clip can be.
 */

const STORAGE_KEY = 'mvg_export_log';
export const MAX_EXPORTS_PER_DAY = 10;
export const MAX_CLIP_SECONDS = 90;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readLog() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function exportsUsedToday() {
  const log = readLog();
  return log[todayKey()] || 0;
}

export function canExport() {
  return exportsUsedToday() < MAX_EXPORTS_PER_DAY;
}

export function recordExport() {
  const log = readLog();
  const key = todayKey();
  log[key] = (log[key] || 0) + 1;
  // Keep the log small - only today's entry matters.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ [key]: log[key] }));
}
