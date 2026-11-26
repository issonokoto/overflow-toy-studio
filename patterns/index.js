// Central pattern registry. Add new pattern modules here to expose them in the Studio UI & number shortcuts.

import { classicPattern } from './classic.js';
import { pinballPattern } from './pinball.js';
import { hourglassPattern } from './hourglass.js';

export const PATTERNS = [
  classicPattern,
  pinballPattern,
  hourglassPattern,
];

export function getPatternById(id) {
  return PATTERNS.find((p) => p.id === id) || PATTERNS[0];
}
