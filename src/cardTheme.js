import { useSyncExternalStore } from 'react';

// Each player's own card look, kept on this device only.
export const CARD_THEMES = [
  { id: 'classic', name: 'Classic', blurb: 'Ivory faces, burgundy backs' },
  { id: 'royal', name: 'Royal Gold', blurb: 'Cream and gold, black backs' },
  { id: 'midnight', name: 'Midnight', blurb: 'Dark faces, neon suits' },
  { id: 'fourcolor', name: 'Four Colour', blurb: 'A colour per suit, easy to read' },
  { id: 'vintage', name: 'Vintage', blurb: 'Aged paper, teal backs' },
];

const KEY = 'lc.cardTheme';
const listeners = new Set();

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return CARD_THEMES.some((t) => t.id === v) ? v : 'classic';
  } catch {
    return 'classic';
  }
};

let current = read();
export const applyCardTheme = () => {
  document.documentElement.dataset.cardTheme = current;
};

export const setCardTheme = (id) => {
  if (!CARD_THEMES.some((t) => t.id === id)) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
  applyCardTheme();
  listeners.forEach((fn) => fn());
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useCardTheme = () => useSyncExternalStore(subscribe, () => current);
