const MAX_AGE_MS = 4 * 60 * 60 * 1000;
export function readSessionDraft<T>(
  key: string,
  parse: (value: unknown) => T | null,
  now = Date.now(),
): T | null {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      !draft ||
      !Number.isFinite(draft.savedAt) ||
      now - draft.savedAt > MAX_AGE_MS ||
      draft.savedAt > now
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parse(draft.value);
  } catch {
    return null;
  }
}
export function saveSessionDraft(key: string, value: unknown, now = Date.now()) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: now, value }));
    return true;
  } catch {
    return false;
  }
}
export function clearSessionDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage can be disabled. */
  }
}
