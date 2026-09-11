// Deterministic Pastel Color Palettes for Projects
export const PASTEL_PALETTES = [
  { hue: 208, name: 'sky-blue' },     // Shortcuts (Sky Blue)
  { hue: 154, name: 'mint-green' },   // Developer (Mint Green)
  { hue: 268, name: 'lavender' },     // LoL Wrappers (Lavender)
  { hue: 28,  name: 'peach' },        // LoL Endings (Peach)
  { hue: 172, name: 'teal' },
  { hue: 336, name: 'rose' },
  { hue: 194, name: 'cyan' },
  { hue: 44,  name: 'amber' },
  { hue: 242, name: 'indigo' },
  { hue: 12,  name: 'coral' },
  { hue: 138, name: 'emerald' },
  { hue: 290, name: 'violet' }
];

export function getDeterministicHue(name) {
  if (!name) return 208;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  const palette = PASTEL_PALETTES[Math.abs(hash) % PASTEL_PALETTES.length];
  return palette.hue;
}
