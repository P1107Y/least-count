// Display-name rules (FR-1) and a small profanity filter (NFR-7).
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'rape', 'nazi', 'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'gandu', 'randi', 'lauda', 'lund'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };

const normalise = (name) =>
  name
    .toLowerCase()
    .split('')
    .map((ch) => LEET[ch] || ch)
    .join('')
    .replace(/[^a-z]/g, '');

export const checkName = (raw) => {
  if (typeof raw !== 'string') return 'Enter a display name.';
  const name = raw.trim();
  if (name.length < 2 || name.length > 15) return 'Display name must be 2 to 15 characters.';
  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) return 'Use letters, numbers, spaces and . _ \' - only.';
  const flat = normalise(name);
  if (BLOCKED.some((word) => flat.includes(word))) return 'Please choose a different display name.';
  return null;
};
