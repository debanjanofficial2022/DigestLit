// The Digestlit logo: a serif "Dl" monogram in a thin circle, like a journal
// seal. Deep navy on off-white, no animation. Three versions are kept so the
// owner can choose one on the /logo page; "seal" is the one in use.

const NAVY = '#1c2b4a';
const GOLD = '#a8874a';
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";

const mono = (y = 61, size = 40) =>
  `<text x="50" y="${y}" text-anchor="middle" font-family="${SERIF}" font-size="${size}" font-weight="600" fill="${NAVY}" letter-spacing="-1">D<tspan font-style="italic" font-weight="500" dx="1">l</tspan></text>`;

export const LOGOS = {
  // A: one thin ring around the monogram
  seal: {
    name: 'Seal',
    note: 'One thin ring. Plain and clear at any size; works as the site icon.',
    svg: () =>
      `<circle cx="50" cy="50" r="46" fill="none" stroke="${NAVY}" stroke-width="2"/>${mono()}`,
  },
  // B: a double ring with a small gold point, like a society seal
  double: {
    name: 'Double ring',
    note: 'An outer and an inner hairline ring with a small gold point under the letters.',
    svg: () =>
      `<circle cx="50" cy="50" r="47" fill="none" stroke="${NAVY}" stroke-width="1.6"/>` +
      `<circle cx="50" cy="50" r="41" fill="none" stroke="${NAVY}" stroke-width="0.8"/>` +
      mono(58, 36) +
      `<circle cx="50" cy="71" r="2" fill="${GOLD}"/>`,
  },
  // C: the name set around the ring, for print and the sign-in page
  lettered: {
    name: 'Lettered seal',
    note: 'The name runs around the ring. Best large; too fine for a tab icon.',
    svg: () =>
      `<defs><path id="dl-arc" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"/></defs>` +
      `<circle cx="50" cy="50" r="47" fill="none" stroke="${NAVY}" stroke-width="1.4"/>` +
      `<circle cx="50" cy="50" r="30" fill="none" stroke="${NAVY}" stroke-width="0.8"/>` +
      `<text font-family="${SERIF}" font-size="8.2" fill="${NAVY}"><textPath href="#dl-arc" startOffset="0" textLength="228" lengthAdjust="spacing">DIGESTLIT · NEW PAPERS, READ ·</textPath></text>` +
      mono(58.5, 26) +
      `<path d="M41 63.5h18" stroke="${GOLD}" stroke-width="1"/>`,
  },
};

export const CURRENT_LOGO = 'seal';

/** An inline SVG of one logo version. */
export function logoSVG(key = CURRENT_LOGO, size = 40, label = 'Digestlit') {
  const logo = LOGOS[key] || LOGOS[CURRENT_LOGO];
  return `<svg class="logo" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}">${logo.svg()}</svg>`;
}
