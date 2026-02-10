export const SHARED_INPUT_INDEX = {
  mouseX: 0,
  mouseY: 1,
  mouseLeft: 2,
  mouseMiddle: 3,
  mouseRight: 4,
  quitRequested: 5,
  keysStart: 16,
} as const

export const SHARED_PYGAME_KEYS = [
  'Escape',
  ' ',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Shift',
  'Control',
  'Alt',
  'Meta',
  '-',
  '=',
  '[',
  ']',
  '\\',
  ';',
  "'",
  ',',
  '.',
  '/',
  '`',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
] as const

export const SHARED_INPUT_SLOTS = SHARED_INPUT_INDEX.keysStart + SHARED_PYGAME_KEYS.length

export const SHARED_PYGAME_KEY_TO_SLOT: Record<string, number> = Object.fromEntries(
  SHARED_PYGAME_KEYS.map((key, index) => [key, SHARED_INPUT_INDEX.keysStart + index]),
)
