export const APPEARANCE_STORAGE_KEY = "runproject-appearance";
export const APPEARANCE_MODES = ["system", "light", "dark"];
export function normalizeAppearance(value) {
  return APPEARANCE_MODES.includes(value) ? value : "system";
}
export function readAppearance(storage) {
  try {
    return normalizeAppearance(storage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}
export function isDarkAppearance(preference, systemDark) {
  const mode = normalizeAppearance(preference);
  return mode === "dark" || (mode === "system" && Boolean(systemDark));
}
