import { create } from 'zustand';
import { upsertTerminalPageSession } from '@/utils/terminalPageState';

const HEIGHT_KEY = 'project-terminal-height';
export const DEFAULT_TERMINAL_HEIGHT = 300;

export function terminalHeightBounds(containerHeight) {
  const max = Math.max(80, containerHeight - 140);
  return { min: Math.min(160, max), max };
}

export function clampTerminalHeight(height, containerHeight) {
  const { min, max } = terminalHeightBounds(containerHeight);
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(height) ? height : DEFAULT_TERMINAL_HEIGHT)));
}

const savedHeight = () => {
  try {
    const value = Number(window.localStorage.getItem(HEIGHT_KEY));
    if (Number.isFinite(value) && value >= 80) return value;
  } catch { /* Use the default if storage is unavailable. */ }
  return DEFAULT_TERMINAL_HEIGHT;
};

export const useTerminalPanelStore = create(set => ({
  visible: false,
  height: savedHeight(),
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
  setHeight: height => {
    set({ height });
    try { window.localStorage.setItem(HEIGHT_KEY, String(height)); } catch { /* Keep the in-memory preference. */ }
  },
}));

export function openProjectTerminal(terminal) {
  upsertTerminalPageSession(terminal);
  useTerminalPanelStore.getState().show();
}
