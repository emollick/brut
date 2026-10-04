// The parameter space. A building is a type plus a flat bag of numbers and choices ("DNA").
// Everything the inspector shows, every preset, every mutation is driven from this table.
import { clamp, hexToLin } from '../util.js';

export const ACCENTS = {
  none:   { label: 'None', hex: null },
  red:    { label: 'Vermilion', hex: 0xa5312a },
  ochre:  { label: 'Ochre', hex: 0xd6a22a },
  blue:   { label: 'Ultramarine', hex: 0x2b4f93 },
  green:  { label: 'English green', hex: 0x3f6f50 },
  orange: { label: 'Orange', hex: 0xc9601f },
  sky:    { label: 'Ceruléen', hex: 0x7fa9c4 },
  white:  { label: 'White', hex: 0xe6e1d3 },
  umber:  { label: 'Burnt umber', hex: 0x5e3628 },
  poly:   { label: 'Polychrome', hex: 0x000000 },
};
const POLY = ['red', 'ochre', 'blue', 'green', 'white', 'umber'];
export function accentColor(name, i = 0) {
  if (name === 'poly') name = POLY[Math.abs(i) % POLY.length];
  const a = ACCENTS[name];
  return a && a.hex !== null ? hexToLin(a.hex) : null;
}

// ---- parameter definitions -------------------------------------------------
// t: i int, f float, e enum, c colour-choice. g: inspector group. b: shown in the short list.
export const PARAMS = {
  // form
  floors:  { t: 'i', g: 'form', label: 'Storeys', min: 1, max: 60, b: 1, tip: 'Number of floors above the undercroft.' },
  floorH:  { t: 'f', g: 'form', label: 'Storey height', min: 2.6, max: 6, step: 0.1, unit: 'm', tip: 'Floor to floor. 2.26 m clear was Le Corbusier’s Modulor ceiling; civic floors run 4–6 m.' },
  bays:    { t: 'i', g: 'form', label: 'Bays', min: 1, max: 44, b: 1, tip: 'Structural bays along the length.' },
  bayW:    { t: 'f', g: 'form', label: 'Bay width', min: 2.4, max: 9, step: 0.1, unit: 'm', tip: 'Spacing of cross-walls or columns. Cross-wall housing sits near 3.6–4.2 m; office frames 6–9 m.' },
  depth:   { t: 'f', g: 'form', label: 'Depth', min: 6, max: 44, step: 0.5, unit: 'm', b: 1, tip: 'Plan depth, front to back. Past about 14 m a dual-aspect flat stops getting daylight to its middle.' },
  // section
  lift:    { t: 'f', g: 'section', label: 'Undercroft', min: 0, max: 24, step: 0.5, unit: 'm', b: 1, tip: 'Height the building is lifted clear of the ground.' },
  stepF:   { t: 'f', g: 'section', label: 'Front step', min: -3, max: 3.6, step: 0.1, unit: 'm', b: 1, tip: 'Setback per tier on the front. Positive steps back into terraces; negative jetties each tier out over the one below.' },
  stepB:   { t: 'f', g: 'section', label: 'Back step', min: -3, max: 3.6, step: 0.1, unit: 'm', tip: 'Setback per tier on the back.' },
  stepE:   { t: 'f', g: 'section', label: 'End step', min: -1, max: 2, step: 0.5, unit: 'bay', tip: 'Setback per tier at each end, in bays.' },
  tier:    { t: 'i', g: 'section', label: 'Storeys per tier', min: 1, max: 12, tip: 'How many floors move together when the section steps.' },
  profile: { t: 'e', g: 'section', label: 'Profile', opts: { linear: 'Every tier', diamond: 'Out and back', cap: 'Top only' }, tip: 'How the steps are spread up the building: every tier in turn, out to the middle and back again, or only the top.' },
  // structure
  supports:{ t: 'e', g: 'structure', label: 'Supports', opts: { pilotis: 'Pilotis', piers: 'Tapered piers', blades: 'Blade walls', vlegs: 'V-legs', arcade: 'Arcade', none: 'Cores only' }, tip: 'What carries the building across the undercroft.' },
  supEvery:{ t: 'i', g: 'structure', label: 'Support spacing', min: 1, max: 4, unit: 'bay', tip: 'Supports land on every nth bay line.' },
  core:    { t: 'e', g: 'structure', label: 'Circulation core', opts: { internal: 'Internal', end: 'One end', ends: 'Both ends', detached: 'Detached tower', spine: 'Stair towers', none: 'None' }, b: 1, tip: 'Lifts and stairs. Pulled out of the block, the core becomes a tower of its own, joined by bridges.' },
  coreH:   { t: 'f', g: 'structure', label: 'Core overrun', min: 0, max: 16, step: 0.5, unit: 'm', tip: 'How far the core rises past the roof.' },
  bridgeN: { t: 'i', g: 'structure', label: 'Bridge every', min: 1, max: 6, unit: 'fl', tip: 'A detached core is bridged to the block every nth floor.' },
  // façade
  front:   { t: 'e', g: 'facade', label: 'Front', opts: null, b: 1, tip: 'Façade system on the front.' },
  back:    { t: 'e', g: 'facade', label: 'Back', opts: null, tip: 'Façade system on the back.' },
  ends:    { t: 'e', g: 'facade', label: 'Ends', opts: null, tip: 'Façade system on the gable ends.' },
  fdepth:  { t: 'f', g: 'facade', label: 'Relief', min: 0.15, max: 3.2, step: 0.05, unit: 'm', b: 1, tip: 'Depth of the façade: loggia, balcony projection, fin or reveal.' },
  solid:   { t: 'f', g: 'facade', label: 'Solidity', min: 0, max: 1, step: 0.02, tip: 'Share of wall to window: sill and parapet heights, pier widths.' },
  rhythm:  { t: 'e', g: 'facade', label: 'Rhythm', opts: { even: 'Even', alt: 'Alternate bays', rows: 'Alternate floors', checker: 'Chequer', random: 'Irregular' }, tip: 'Which cells of the grid take the feature.' },
  finN:    { t: 'i', g: 'facade', label: 'Subdivision', min: 1, max: 6, tip: 'Fins or mullions per bay.' },
  // surface
  finish:  { t: 'e', g: 'surface', label: 'Concrete finish', opts: { boardH: 'Board-marked, horizontal', boardV: 'Board-marked, vertical', rib: 'Ribbed and hammered', hammer: 'Bush-hammered', panel: 'Ply panels and tie holes', precast: 'Precast, exposed aggregate', smooth: 'Fair-faced' }, b: 1, tip: 'What the formwork left behind. Sawn boards print their grain; ribs are cast then broken with a hammer to show the stone.' },
  tone:    { t: 'f', g: 'surface', label: 'Warmth', min: 0, max: 1, step: 0.02, tip: 'Cool grey cement to warm sand aggregate.' },
  value:   { t: 'f', g: 'surface', label: 'Lightness', min: 0, max: 1, step: 0.02, tip: 'Dark basalt mixes to white cement.' },
  accent:  { t: 'c', g: 'surface', label: 'Colour', b: 1, tip: 'Painted colour. Le Corbusier kept it off the concrete face and inside the reveals.' },
  accentAt:{ t: 'e', g: 'surface', label: 'Colour goes on', opts: { reveals: 'Reveals', panels: 'Panels', soffits: 'Soffits', doors: 'Doors' }, tip: 'Where the paint is allowed.' },
  // crown
  crown:   { t: 'e', g: 'crown', label: 'Roof', opts: { none: 'Flat', parapet: 'Parapet', terrace: 'Roof terrace', tanks: 'Tanks and plant', boiler: 'Boiler house', parasol: 'Parasol', sawtooth: 'North lights', vaults: 'Vaults', garden: 'Garden' }, b: 1, tip: 'What happens on top.' },
  // life
  planting:{ t: 'f', g: 'life', label: 'Planting', min: 0, max: 1, step: 0.02, tip: 'Planters on balconies, terraces and roofs.' },
  age:     { t: 'f', g: 'life', label: 'Weathering', min: 0, max: 1.3, step: 0.01, b: 1, tip: 'Rain streaks, algae and rust. Concrete records its weather.' },
  use:     { t: 'e', g: 'life', label: 'Use', opts: { housing: 'Housing', work: 'Offices', civic: 'Civic' }, tip: 'Who is inside, and when their lights are on.' },
  seed:    { t: 'i', g: 'life', label: 'Variation', min: 1, max: 999, tip: 'Shuffles everything left to chance.' },

  // cluster
  mW:      { t: 'f', g: 'form', label: 'Module width', min: 4, max: 12, step: 0.2, unit: 'm', tip: 'Short side of the precast box.' },
  mL:      { t: 'f', g: 'form', label: 'Module length', min: 6, max: 18, step: 0.2, unit: 'm', b: 1, tip: 'Long side of the precast box.' },
  mH:      { t: 'f', g: 'form', label: 'Module height', min: 2.8, max: 4.5, step: 0.1, unit: 'm' },
  nx:      { t: 'i', g: 'form', label: 'Rows', min: 1, max: 14, b: 1 },
  nz:      { t: 'i', g: 'form', label: 'Ranks', min: 1, max: 10, b: 1 },
  levels:  { t: 'i', g: 'form', label: 'Levels', min: 1, max: 16, b: 1 },
  fill:    { t: 'f', g: 'section', label: 'Density', min: 0.15, max: 1, step: 0.02, b: 1, tip: 'How many places in the lattice hold a module.' },
  slope:   { t: 'f', g: 'section', label: 'Hill', min: 0, max: 1, step: 0.02, b: 1, tip: 'Zero stacks a block; one piles a hill.' },
  shift:   { t: 'f', g: 'section', label: 'Offset', min: 0, max: 1, step: 0.02, tip: 'How far alternate levels slide over the ones below.' },
  // capsule / drum
  cores:   { t: 'i', g: 'structure', label: 'Cores', min: 1, max: 4, b: 1 },
  capsN:   { t: 'i', g: 'form', label: 'Capsules per floor', min: 2, max: 8, b: 1 },
  capW:    { t: 'f', g: 'form', label: 'Capsule width', min: 2.2, max: 5, step: 0.1, unit: 'm' },
  capL:    { t: 'f', g: 'form', label: 'Capsule length', min: 3, max: 9, step: 0.1, unit: 'm' },
  radius:  { t: 'f', g: 'form', label: 'Radius', min: 4, max: 40, step: 0.5, unit: 'm', b: 1 },
  petals:  { t: 'i', g: 'facade', label: 'Lobes', min: 0, max: 24, b: 1, tip: 'Scalloped balconies around the drum. Zero keeps it a plain cylinder.' },
  swell:   { t: 'f', g: 'section', label: 'Swell', min: -0.6, max: 0.8, step: 0.02, b: 1, tip: 'Flares or pinches the profile on the way up.' },
  top:     { t: 'e', g: 'crown', label: 'Top', opts: { flat: 'Flat', disc: 'Disc', saucer: 'Saucer', dome: 'Dome', crownring: 'Ring of fins', mast: 'Mast' }, b: 1 },
  ring:    { t: 'e', g: 'facade', label: 'Wall', opts: { bands: 'Banded', fins: 'Radial fins', glass: 'Glazed', blank: 'Blank' }, b: 1 },
  // megastructure
  bars:    { t: 'i', g: 'form', label: 'Bars', min: 1, max: 7, b: 1, tip: 'Slabs laid across the cores, alternating direction.' },
  barL:    { t: 'f', g: 'form', label: 'Bar length', min: 24, max: 130, step: 1, unit: 'm', b: 1 },
  barF:    { t: 'i', g: 'form', label: 'Storeys per bar', min: 1, max: 5 },
  gap:     { t: 'f', g: 'section', label: 'Gap between bars', min: 0, max: 14, step: 0.5, unit: 'm', b: 1, tip: 'Open air between one bar and the next. The city shows through.' },
  span:    { t: 'f', g: 'structure', label: 'Core spacing', min: 14, max: 60, step: 1, unit: 'm' },
  // hall
  width:   { t: 'f', g: 'form', label: 'Width', min: 10, max: 110, step: 1, unit: 'm', b: 1 },
  length:  { t: 'f', g: 'form', label: 'Length', min: 10, max: 150, step: 1, unit: 'm', b: 1 },
  height:  { t: 'f', g: 'form', label: 'Height', min: 4, max: 90, step: 0.5, unit: 'm', b: 1 },
  roof:    { t: 'e', g: 'crown', label: 'Roof', opts: { flat: 'Coffered slab', folded: 'Folded plate', vaults: 'Barrel vaults', saw: 'North lights', butterfly: 'Butterfly', pyramid: 'Inverted pyramid', shell: 'Shell' }, b: 1 },
  portico: { t: 'e', g: 'structure', label: 'Portico', opts: { none: 'None', columns: 'Colonnade', piers: 'Giant piers', canopy: 'Cantilever canopy' }, b: 1 },
  fly:     { t: 'f', g: 'section', label: 'Fly tower', min: 0, max: 1, step: 0.02, b: 1, tip: 'A blank tower over the stage. Theatres need it; it makes any hall look like one.' },
  plinth:  { t: 'f', g: 'section', label: 'Plinth', min: 0, max: 8, step: 0.25, unit: 'm', tip: 'A raised base with steps.' },
  walls:   { t: 'e', g: 'facade', label: 'Walls', opts: { blank: 'Blank', slots: 'Slots', fins: 'Fins', glazed: 'Glazed', relief: 'Relief', holes: 'Cut-outs' }, b: 1 },
  // monument
  kind:    { t: 'e', g: 'form', label: 'Figure', opts: null, b: 1 },
  count:   { t: 'i', g: 'form', label: 'Members', min: 2, max: 24, b: 1 },
  spread:  { t: 'f', g: 'section', label: 'Spread', min: 0, max: 1, step: 0.02, b: 1 },
  twist:   { t: 'f', g: 'section', label: 'Twist', min: -1, max: 1, step: 0.02 },
  lean:    { t: 'f', g: 'section', label: 'Lean', min: 0, max: 1, step: 0.02, b: 1 },
  mound:   { t: 'f', g: 'section', label: 'Mound', min: 0, max: 14, step: 0.5, unit: 'm' },
  // deck
  deckH:   { t: 'f', g: 'section', label: 'Deck level', min: 2.6, max: 14, step: 0.2, unit: 'm', b: 1 },
  stairs:  { t: 'i', g: 'structure', label: 'Stairs', min: 0, max: 4, b: 1 },
  voids:   { t: 'f', g: 'section', label: 'Light wells', min: 0, max: 1, step: 0.02, tip: 'Openings cut through the deck.' },
};

export const FACADES = {
  loggia: 'Loggia / brise-soleil', duplex: 'Double-height loggia', balcony: 'Balconies', gallery: 'Deck access',
  ribbon: 'Ribbon window', punched: 'Punched wall', slot: 'Slots', fins: 'Fins', grid: 'Frame and infill',
  pod: 'Precast window boxes', blank: 'Blank wall',
};
PARAMS.front.opts = PARAMS.back.opts = PARAMS.ends.opts = FACADES;


// one line on what each choice is, shown under the inspector while it is in hand
const FACADE_NOTES = {
  loggia: 'The glass is set back behind a concrete grid. Each cell is a balcony, and the grid shades the room behind it: a brise-soleil.',
  duplex: 'Loggias two storeys high, one to a flat. Maisonettes interlock behind them, so a corridor is only needed every few floors.',
  balcony: 'Slabs cantilevered off the wall, each with a solid upstand. The rhythm setting alternates or staggers them.',
  gallery: 'An open walkway along the floor with front doors off it. This is deck access, the street in the sky.',
  ribbon: 'A continuous band of window between bands of wall. The structure stands behind it, free of the façade.',
  punched: 'Windows cut one at a time into a thick wall. The depth of the reveal is the relief.',
  slot: 'Narrow vertical slits in a heavy wall.',
  fins: 'Vertical blades in front of the glass. They cut low sun from the side and give the wall a grain.',
  grid: 'Columns and beams stand proud; panels and glass fill the bays between them.',
  pod: 'Precast window boxes hung on the wall, each one a hood around its opening.',
  blank: 'No openings: a gable end, a stair tower, the wall of an auditorium.',
};
export const NOTES = {
  front: FACADE_NOTES, back: FACADE_NOTES, ends: FACADE_NOTES,
  supports: {
    pilotis: 'Round columns. Lifting the block frees the ground beneath it.',
    piers: 'Thick legs that widen as they rise to meet the table above.',
    blades: 'Cross-walls brought down to the ground as fins.',
    vlegs: 'Raking legs that meet at the ground.',
    arcade: 'Square piers along both edges with a deep beam over them.',
    none: 'Only the cores touch the ground.',
  },
  core: {
    internal: 'Lifts and stairs inside the plan. Only the motor rooms show on the roof.',
    end: 'A stair and lift tower closes one end of the block.',
    ends: 'A stair and lift tower closes each end of the block.',
    detached: 'A separate service tower joined to the block by bridges, as at Trellick Tower.',
    spine: 'Stair towers stand against the back wall at intervals.',
    none: 'No core is expressed.',
  },
  crown: {
    none: 'A flat roof with nothing on it.',
    parapet: 'An upstand around a flat roof.',
    terrace: 'The roof as a public deck: ventilation stacks, a gymnasium, a paddling pool.',
    tanks: 'Water tanks and plant rooms, left in view.',
    boiler: 'A plant room cantilevered out at the top.',
    parasol: 'A second roof on legs, shading the first.',
    sawtooth: 'North lights. The steep side of each tooth is glazed and lets in even light.',
    vaults: 'A row of concrete barrel vaults.',
    garden: 'Soil, trees and shrubs.',
  },
  finish: {
    boardH: 'Cast against rough sawn boards laid flat, which leave their grain and joints in the face. This is béton brut.',
    boardV: 'Cast against rough sawn boards stood upright. The grain runs with the rain.',
    rib: 'Cast with ribs, then the ridges are broken off by hammer to show the stone inside. Paul Rudolph used it at Yale.',
    hammer: 'The hardened face is chipped away with a pick or bush hammer, as at the Barbican.',
    panel: 'Cast against smooth sheets of plywood. The holes left by the form ties are kept as a pattern.',
    precast: 'Panels made in a factory with the stone showing, lifted into place and jointed.',
    smooth: 'Plain, even concrete from steel forms.',
  },
  roof: {
    flat: 'A deep flat slab that oversails the walls.',
    folded: 'A slab pleated into ridges so that it can span the hall.',
    vaults: 'Barrel vaults side by side along the hall.',
    saw: 'North lights across the width.',
    butterfly: 'Two slopes falling to a valley in the middle.',
    pyramid: 'The roof swells outward as it rises and overhangs the walls.',
    shell: 'One vault across the whole hall.',
  },
  walls: {
    blank: 'Plain walls.', slots: 'Plain walls with tall slits.', fins: 'Glass behind a screen of deep fins.',
    glazed: 'Glass between columns.', relief: 'Blocks cast proud of the wall at random.',
    holes: 'A second wall stands off the first and is cut with large triangular openings.',
  },
  portico: {
    none: 'The wall meets the ground with no porch.', columns: 'A row of round columns under the roof.',
    piers: 'Giant blade piers under a deep beam.', canopy: 'A slab thrown out over the steps from two stub walls.',
  },
  top: {
    flat: 'A flat roof.', disc: 'A wide disc raised on short piers.', saucer: 'A shallow dome over a dish.',
    dome: 'A dome.', crownring: 'A ring of fins standing above the roof.', mast: 'A mast.',
  },
  ring: {
    bands: 'Solid balcony bands alternate with bands of glass.', fins: 'Fins radiate from the drum over its full height.',
    glass: 'Glass from floor to floor with thin slab edges.', blank: 'A solid shaft with a few slits.',
  },
  kind: {
    wings: 'Slabs splitting upward and apart.', flower: 'Petals that open as they rise.', shards: 'Spikes driven out from one point.',
    gate: 'Two pylons and a lintel.', eye: 'A ring stood on edge, with rays.', needle: 'Blades leaning together to a point.',
    blocks: 'Rough blocks piled without a plan.',
    watertower: 'A tank held up on a stem.', chimney: 'A tapering stack with warning bands.', cooling: 'A hyperbolic shell on raking legs.',
    mast: 'A concrete shaft carrying decks and an aerial.', silos: 'Cylinders in a row under a headhouse.',
  },
};
export const GROUPS = { form: 'Form', section: 'Section', structure: 'Structure', facade: 'Façade', surface: 'Surface', crown: 'Roof', life: 'Life' };

const SURF = { finish: 'boardH', tone: 0.45, value: 0.5, accent: 'none', accentAt: 'reveals', age: 0.3, planting: 0.2, seed: 1 };
const BAR = { floors: 12, floorH: 3, bays: 14, bayW: 3.8, depth: 13, lift: 0, stepF: 0, stepB: 0, stepE: 0, tier: 1, profile: 'linear', supports: 'pilotis', supEvery: 2, core: 'internal', coreH: 3, bridgeN: 3, front: 'loggia', back: 'ribbon', ends: 'blank', fdepth: 1.4, solid: 0.5, rhythm: 'even', finN: 3, crown: 'parapet', use: 'housing', ...SURF };

// ---- typologies ------------------------------------------------------------
export const TYPES = {
  slab: {
    label: 'Slab', gen: 'bar', blurb: 'A long bar of dwellings lifted on legs.',
    keys: Object.keys(BAR),
    base: { ...BAR, floors: 17, bays: 22, bayW: 3.9, depth: 15, lift: 7, supports: 'piers', supEvery: 2, front: 'loggia', back: 'loggia', ends: 'blank', fdepth: 1.6, crown: 'terrace', accent: 'poly', core: 'internal' },
    presets: {
      'Marseille': { floors: 17, bays: 22, bayW: 3.9, depth: 15, lift: 7, supports: 'piers', front: 'duplex', back: 'loggia', fdepth: 1.7, crown: 'terrace', accent: 'poly', finish: 'boardH', tone: 0.55, age: 0.35 },
      'Park Hill': { floors: 11, bays: 30, bayW: 3.4, depth: 11, lift: 0, front: 'gallery', back: 'grid', ends: 'blank', fdepth: 2.2, crown: 'none', accent: 'ochre', accentAt: 'panels', core: 'spine', finish: 'boardH', tone: 0.6, rhythm: 'even' },
      'Robin Hood': { floors: 9, bays: 26, bayW: 3.6, depth: 12, lift: 0, front: 'fins', back: 'gallery', ends: 'blank', fdepth: 0.9, finN: 2, crown: 'parapet', accent: 'none', core: 'ends', finish: 'precast', tone: 0.4, value: 0.55 },
      'Ministry': { floors: 14, bays: 18, bayW: 6, depth: 18, floorH: 3.6, lift: 9, supports: 'vlegs', supEvery: 2, front: 'fins', back: 'fins', ends: 'blank', fdepth: 0.9, finN: 4, crown: 'parasol', use: 'work', accent: 'none', finish: 'panel', value: 0.62, tone: 0.35 },
      'Microrayon': { floors: 16, bays: 24, bayW: 3.2, depth: 11.5, lift: 0, front: 'balcony', back: 'punched', ends: 'blank', fdepth: 1.1, rhythm: 'alt', crown: 'tanks', accent: 'sky', accentAt: 'panels', core: 'spine', finish: 'precast', tone: 0.3, value: 0.6 },
    },
  },
  tower: {
    label: 'Tower', gen: 'bar', blurb: 'A point block. The core can stand apart and bridge across.',
    keys: Object.keys(BAR),
    base: { ...BAR, floors: 28, bays: 6, bayW: 4.2, depth: 15, lift: 0, core: 'detached', coreH: 9, bridgeN: 3, front: 'balcony', back: 'balcony', ends: 'punched', fdepth: 1.3, rhythm: 'even', crown: 'boiler', finish: 'hammer', tone: 0.4, value: 0.45 },
    presets: {
      'Trellick': { floors: 31, bays: 7, bayW: 4.3, depth: 14, core: 'detached', coreH: 10, bridgeN: 3, front: 'balcony', back: 'ribbon', ends: 'blank', fdepth: 1.2, crown: 'boiler', finish: 'hammer', accent: 'none', tone: 0.42 },
      'Barbican': { floors: 42, bays: 5, bayW: 6.4, depth: 24, core: 'internal', coreH: 7, front: 'balcony', back: 'balcony', ends: 'balcony', fdepth: 2.2, rhythm: 'even', solid: 0.75, crown: 'parapet', finish: 'hammer', tone: 0.5, value: 0.38, age: 0.4 },
      'Velasca': { floors: 26, bays: 5, bayW: 5.2, depth: 22, floorH: 3.4, stepF: -2.6, stepB: -2.6, stepE: -0.5, tier: 18, profile: 'cap', core: 'internal', front: 'punched', back: 'punched', ends: 'punched', fdepth: 0.6, solid: 0.55, crown: 'parapet', finish: 'precast', tone: 0.75, value: 0.5 },
      'Point block': { floors: 20, bays: 4, bayW: 5.5, depth: 20, core: 'internal', front: 'ribbon', back: 'ribbon', ends: 'ribbon', fdepth: 0.4, crown: 'tanks', finish: 'panel', value: 0.6 },
      'Torre': { floors: 34, bays: 3, bayW: 7, depth: 21, floorH: 3.3, lift: 8, supports: 'blades', supEvery: 1, core: 'end', coreH: 12, front: 'pod', back: 'pod', ends: 'slot', fdepth: 0.9, rhythm: 'checker', crown: 'parasol', finish: 'boardV', use: 'work' },
    },
  },
  terrace: {
    label: 'Ziggurat', gen: 'bar', blurb: 'Each floor steps back; every roof becomes the terrace above.',
    keys: Object.keys(BAR),
    base: { ...BAR, floors: 7, bays: 26, bayW: 4.4, depth: 30, lift: 0, stepF: 2.6, stepB: 0, tier: 1, front: 'balcony', back: 'gallery', ends: 'blank', fdepth: 1.6, solid: 0.8, planting: 0.75, crown: 'parapet', core: 'spine', finish: 'boardH', tone: 0.5, value: 0.6 },
    presets: {
      'Alexandra Road': { floors: 7, bays: 32, bayW: 4.2, depth: 28, stepF: 2.7, stepB: -0.6, front: 'balcony', back: 'ribbon', fdepth: 1.5, solid: 0.85, planting: 0.8, finish: 'boardH', value: 0.72, tone: 0.35, crown: 'parapet' },
      'Brunswick': { floors: 8, bays: 24, bayW: 4.6, depth: 34, stepF: 2.4, stepB: 2.4, front: 'ribbon', back: 'ribbon', ends: 'blank', fdepth: 0.6, crown: 'tanks', core: 'ends', coreH: 8, finish: 'smooth', value: 0.7, tone: 0.55 },
      'Pyramid': { floors: 12, bays: 16, bayW: 5, depth: 80, floorH: 3.3, stepF: 3.3, stepB: 3.3, stepE: 0.5, tier: 1, front: 'loggia', back: 'loggia', ends: 'loggia', fdepth: 1.5, crown: 'garden', planting: 0.9, core: 'none' },
      'Hillside': { floors: 5, bays: 18, bayW: 5.4, depth: 26, stepF: 3.6, tier: 1, front: 'balcony', back: 'blank', fdepth: 2.4, solid: 0.9, planting: 1, crown: 'garden', core: 'none', finish: 'boardV' },
    },
  },
  cantilever: {
    label: 'Inverted', gen: 'bar', blurb: 'Top-heavy. Each tier hangs out over the one beneath.',
    keys: Object.keys(BAR),
    base: { ...BAR, floors: 9, floorH: 4, bays: 9, bayW: 7, depth: 34, lift: 0, stepF: -2.6, stepB: -2.6, stepE: -0.5, tier: 3, profile: 'linear', front: 'pod', back: 'pod', ends: 'pod', fdepth: 1.2, rhythm: 'even', crown: 'parapet', core: 'none', use: 'civic', finish: 'precast', tone: 0.55, value: 0.55, supports: 'arcade' },
    presets: {
      'City Hall': { floors: 9, floorH: 4.2, bays: 11, bayW: 7.2, depth: 44, lift: 9, supports: 'blades', supEvery: 1, stepF: -2.4, stepB: -2.4, stepE: -0.5, tier: 3, front: 'pod', back: 'pod', ends: 'pod', fdepth: 1.6, rhythm: 'even', crown: 'parapet', finish: 'precast', use: 'civic' },
      'Library': { floors: 8, floorH: 4.4, bays: 6, bayW: 8, depth: 48, lift: 12, supports: 'vlegs', supEvery: 1, stepF: -3, stepB: -3, stepE: -0.5, tier: 1, profile: 'diamond', front: 'ribbon', back: 'ribbon', ends: 'ribbon', fdepth: 0.5, solid: 0.15, crown: 'none', core: 'none', finish: 'smooth', use: 'civic' },
      'Museum': { floors: 5, floorH: 5.4, bays: 5, bayW: 8.5, depth: 30, stepF: -3, stepB: 0, stepE: 0, tier: 1, front: 'blank', back: 'blank', ends: 'slot', fdepth: 0.6, rhythm: 'random', crown: 'none', core: 'end', coreH: 4, finish: 'hammer', value: 0.3, tone: 0.3, use: 'civic' },
      'Mushroom': { floors: 14, bays: 5, bayW: 6, depth: 30, lift: 0, stepF: -3, stepB: -3, stepE: -1, tier: 9, profile: 'cap', front: 'slot', back: 'slot', ends: 'slot', fdepth: 0.7, crown: 'tanks', finish: 'boardV', use: 'work' },
    },
  },
  cluster: {
    label: 'Cluster', gen: 'cluster', blurb: 'Precast boxes stacked so each roof is a garden for the next.',
    keys: ['mW', 'mL', 'mH', 'nx', 'nz', 'levels', 'fill', 'slope', 'shift', 'lift', 'fdepth', 'solid', 'finish', 'tone', 'value', 'accent', 'accentAt', 'planting', 'age', 'use', 'seed'],
    base: { mW: 5.4, mL: 11.6, mH: 3.2, nx: 7, nz: 4, levels: 10, fill: 0.5, slope: 0.75, shift: 0.5, lift: 0, fdepth: 0.6, solid: 0.5, use: 'housing', ...SURF, finish: 'precast', tone: 0.6, value: 0.62, planting: 0.6 },
    presets: {
      'Habitat': { nx: 8, nz: 4, levels: 11, fill: 0.48, slope: 0.8, shift: 0.5, finish: 'precast', tone: 0.62, value: 0.64 },
      'Casbah': { mW: 4.6, mL: 7, nx: 10, nz: 7, levels: 5, fill: 0.62, slope: 0.35, shift: 0.3, finish: 'boardV', tone: 0.8, value: 0.75, accent: 'white' },
      'Stack': { mW: 6, mL: 16, nx: 3, nz: 2, levels: 14, fill: 0.7, slope: 0.1, shift: 1, lift: 4, finish: 'boardH', tone: 0.3, value: 0.4 },
    },
  },
  capsule: {
    label: 'Capsules', gen: 'capsule', blurb: 'Service cores with living pods plugged on. Metabolism: the building as a thing that grows.',
    keys: ['cores', 'floors', 'floorH', 'capsN', 'capW', 'capL', 'fill', 'coreH', 'lift', 'top', 'finish', 'tone', 'value', 'accent', 'accentAt', 'age', 'use', 'seed'],
    base: { cores: 2, floors: 13, floorH: 2.7, capsN: 4, capW: 2.6, capL: 4.2, fill: 0.9, coreH: 6, lift: 6, top: 'mast', use: 'housing', ...SURF, finish: 'smooth', value: 0.78, tone: 0.3, accent: 'none' },
    presets: {
      'Nakagin': { cores: 2, floors: 13, capsN: 4, capW: 2.6, capL: 4.1, fill: 0.92, lift: 6, coreH: 6, value: 0.8 },
      'Helix': { cores: 1, floors: 22, capsN: 6, capW: 3, capL: 5.5, fill: 0.7, lift: 9, coreH: 14, top: 'disc', accent: 'orange', accentAt: 'panels' },
      'Colony': { cores: 4, floors: 9, capsN: 5, capW: 3.4, capL: 6.5, fill: 0.6, lift: 3, coreH: 4, top: 'flat', finish: 'precast', value: 0.6 },
    },
  },
  drum: {
    label: 'Drum', gen: 'drum', blurb: 'Round in plan: a corn-cob tower, a saucer on a stem, a rotunda.',
    keys: ['radius', 'floors', 'floorH', 'lift', 'swell', 'petals', 'ring', 'fdepth', 'solid', 'finN', 'top', 'coreH', 'supports', 'finish', 'tone', 'value', 'accent', 'accentAt', 'planting', 'age', 'use', 'seed'],
    base: { radius: 11, floors: 26, floorH: 3, lift: 0, swell: 0, petals: 14, ring: 'bands', fdepth: 1.6, solid: 0.6, finN: 3, top: 'flat', coreH: 4, supports: 'pilotis', use: 'housing', ...SURF, finish: 'boardV', tone: 0.5, value: 0.55 },
    presets: {
      'Corn cob': { radius: 11, floors: 30, lift: 0, petals: 16, ring: 'bands', fdepth: 2, top: 'flat', swell: 0 },
      'Saucer': { radius: 16, floors: 2, floorH: 4.5, lift: 26, swell: 0.6, petals: 0, ring: 'glass', top: 'saucer', supports: 'none', coreH: 10, use: 'civic', finish: 'panel', value: 0.66 },
      'Rotunda': { radius: 26, floors: 3, floorH: 5, lift: 0, swell: 0, petals: 0, ring: 'fins', fdepth: 2.2, finN: 2, top: 'dome', use: 'civic', finish: 'rib' },
      'Silo': { radius: 8, floors: 18, floorH: 3.2, petals: 0, ring: 'blank', top: 'crownring', swell: -0.1, use: 'work', finish: 'boardH', value: 0.45 },
      'Torres': { radius: 9, floors: 22, lift: 5, petals: 7, ring: 'bands', fdepth: 3, solid: 0.9, top: 'disc', swell: 0.08, planting: 0.6 },
    },
  },
  mega: {
    label: 'Megastructure', gen: 'mega', blurb: 'Bars laid across cores like logs, with the ground left free underneath.',
    keys: ['bars', 'barL', 'barF', 'floorH', 'depth', 'gap', 'span', 'lift', 'coreH', 'front', 'fdepth', 'solid', 'finN', 'rhythm', 'crown', 'finish', 'tone', 'value', 'accent', 'accentAt', 'planting', 'age', 'use', 'seed'],
    base: { bars: 5, barL: 70, barF: 2, floorH: 3.4, depth: 14, gap: 5, span: 34, lift: 9, coreH: 5, front: 'ribbon', fdepth: 0.6, solid: 0.5, finN: 3, rhythm: 'even', crown: 'none', use: 'work', ...SURF, finish: 'panel', value: 0.6, tone: 0.4 },
    presets: {
      'Tbilisi': { bars: 5, barL: 72, barF: 2, depth: 14, gap: 4.5, span: 34, lift: 10, front: 'ribbon', finish: 'panel' },
      'Space frame': { bars: 7, barL: 96, barF: 1, depth: 10, gap: 8, span: 46, lift: 14, front: 'fins', finN: 4, finish: 'boardH', value: 0.45 },
      'Bridge': { bars: 2, barL: 110, barF: 4, depth: 18, gap: 0, span: 62, lift: 22, front: 'loggia', fdepth: 1.5, crown: 'parapet', use: 'housing', accent: 'red' },
    },
  },
  hall: {
    label: 'Hall', gen: 'hall', blurb: 'Theatre, library, assembly, church. Big rooms in blank walls.',
    keys: ['width', 'length', 'height', 'roof', 'walls', 'portico', 'fly', 'plinth', 'fdepth', 'finN', 'solid', 'finish', 'tone', 'value', 'accent', 'accentAt', 'planting', 'age', 'seed'],
    base: { width: 46, length: 62, height: 16, roof: 'folded', walls: 'fins', portico: 'piers', fly: 0.5, plinth: 1.5, fdepth: 1.4, finN: 2, solid: 0.6, use: 'civic', ...SURF, finish: 'rib', tone: 0.45, value: 0.5 },
    presets: {
      'Theatre': { width: 52, length: 70, height: 15, roof: 'flat', walls: 'blank', portico: 'canopy', fly: 0.9, plinth: 3, finish: 'boardH' },
      'Assembly': { width: 64, length: 64, height: 18, roof: 'pyramid', walls: 'holes', portico: 'piers', fly: 0, plinth: 2, finish: 'panel', value: 0.62 },
      'Church': { width: 24, length: 44, height: 22, roof: 'butterfly', walls: 'slots', portico: 'none', fly: 0.35, plinth: 0.75, finish: 'boardV', value: 0.4 },
      'Market': { width: 60, length: 110, height: 11, roof: 'vaults', walls: 'glazed', portico: 'columns', fly: 0, plinth: 0, finish: 'smooth', value: 0.7 },
      'Works': { width: 54, length: 120, height: 12, roof: 'saw', walls: 'relief', portico: 'none', fly: 0, plinth: 0, finish: 'precast' },
      'Kunsthalle': { width: 40, length: 40, height: 20, roof: 'shell', walls: 'relief', portico: 'canopy', fly: 0, plinth: 4, finish: 'hammer', value: 0.34 },
    },
  },
  monument: {
    label: 'Monument', gen: 'monument', blurb: 'Concrete with no use but memory.',
    keys: ['kind', 'height', 'count', 'spread', 'twist', 'lean', 'mound', 'finish', 'tone', 'value', 'age', 'seed'],
    base: { kind: 'wings', height: 30, count: 2, spread: 0.6, twist: 0.2, lean: 0.5, mound: 3, ...SURF, finish: 'boardV', tone: 0.35, value: 0.62, age: 0.5, planting: 0 },
    presets: {
      'Wings': { kind: 'wings', height: 32, count: 2, spread: 0.6, lean: 0.55 },
      'Flower': { kind: 'flower', height: 24, count: 6, spread: 0.7, lean: 0.6, mound: 2 },
      'Fist': { kind: 'shards', height: 34, count: 5, spread: 0.45, lean: 0.35, twist: 0.4 },
      'Gate': { kind: 'gate', height: 28, count: 2, spread: 0.5, lean: 0, mound: 0 },
      'Eye': { kind: 'eye', height: 26, count: 12, spread: 0.6, lean: 0.3, mound: 4 },
      'Needle': { kind: 'needle', height: 70, count: 3, spread: 0.3, lean: 0.1, mound: 2 },
      'Blocks': { kind: 'blocks', height: 16, count: 14, spread: 0.6, lean: 0.3, twist: 0.5, mound: 0 },
    },
  },
  works: {
    label: 'Works', gen: 'works', blurb: 'The engineering the city runs on, left in the open.',
    keys: ['kind', 'height', 'radius', 'count', 'swell', 'finish', 'tone', 'value', 'age', 'seed'],
    base: { kind: 'watertower', height: 42, radius: 9, count: 1, swell: 0.4, ...SURF, finish: 'boardV', tone: 0.4, value: 0.55, age: 0.5, planting: 0 },
    presets: {
      'Water tower': { kind: 'watertower', height: 42, radius: 9, swell: 0.5 },
      'Stack': { kind: 'chimney', height: 110, radius: 4, count: 1 },
      'Cooling tower': { kind: 'cooling', height: 84, radius: 32, swell: 0.4 },
      'Telecom': { kind: 'mast', height: 150, radius: 7, count: 3 },
      'Silos': { kind: 'silos', height: 34, radius: 5, count: 6 },
    },
  },
  deck: {
    label: 'Deck', gen: 'deck', blurb: 'A raised ground: the pedestrian city lifted over the road.',
    keys: ['width', 'length', 'deckH', 'floors', 'stairs', 'voids', 'supports', 'supEvery', 'planting', 'solid', 'finish', 'tone', 'value', 'accent', 'age', 'seed'],
    base: { width: 40, length: 70, deckH: 4.5, floors: 1, stairs: 2, voids: 0.3, supports: 'pilotis', supEvery: 1, solid: 0.7, ...SURF, finish: 'boardH', planting: 0.6 },
    presets: {
      'Podium': { width: 60, length: 90, deckH: 5, floors: 1, stairs: 3, voids: 0.35 },
      'Walkway': { width: 5, length: 90, deckH: 6, floors: 1, stairs: 2, voids: 0, planting: 0 },
      'Car park': { width: 34, length: 64, deckH: 2.9, floors: 5, stairs: 1, voids: 0, planting: 0, solid: 1 },
    },
  },
};
PARAMS.kind.optsByType = {
  monument: { wings: 'Wings', flower: 'Flower', shards: 'Shards', gate: 'Gate', eye: 'Ring', needle: 'Needle', blocks: 'Blocks' },
  works: { watertower: 'Water tower', chimney: 'Chimney', cooling: 'Cooling tower', mast: 'Telecom tower', silos: 'Silos' },
};

export const TYPE_ORDER = ['slab', 'tower', 'terrace', 'cantilever', 'cluster', 'capsule', 'drum', 'mega', 'hall', 'monument', 'works', 'deck'];

export function optionsFor(key, type) {
  const p = PARAMS[key];
  if (p.optsByType && p.optsByType[type]) return p.optsByType[type];
  return p.opts;
}

export function makeDNA(type, preset) {
  const T = TYPES[type];
  const d = { type, ...T.base };
  if (preset && T.presets[preset]) Object.assign(d, T.presets[preset]);
  return sanitize(d);
}

export function sanitize(d) {
  const T = TYPES[d.type];
  if (!T) return d;
  for (const k of T.keys) {
    const p = PARAMS[k]; if (!p) continue;
    if (d[k] === undefined) d[k] = T.base[k];
    if (p.t === 'i') d[k] = Math.round(clamp(+d[k], p.min, p.max));
    else if (p.t === 'f') d[k] = clamp(+d[k], p.min, p.max);
    else if (p.t === 'e') { const o = optionsFor(k, d.type); if (o && !(d[k] in o)) d[k] = T.base[k]; }
    else if (p.t === 'c') { if (!(d[k] in ACCENTS)) d[k] = 'none'; }
  }
  return d;
}

// nudge a design: `amount` 0..1 is how far from home it is allowed to wander
export function mutate(d0, amount, R) {
  const d = { ...d0 }, T = TYPES[d.type];
  for (const k of T.keys) {
    const p = PARAMS[k];
    if (k === 'seed') { d.seed = R.int(1, 999); continue; }
    if (k === 'use' || k === 'age') continue;
    if (p.t === 'i' || p.t === 'f') {
      if (!R.chance(0.35 + amount * 0.5)) continue;
      const span = (p.max - p.min) * amount * 0.5;
      let v = d[k] + (R() + R() - 1) * span;
      d[k] = p.t === 'i' ? Math.round(v) : Math.round(v / (p.step || 0.01)) * (p.step || 0.01);
    } else if (R.chance(amount * 0.45)) {
      const o = Object.keys(p.t === 'c' ? ACCENTS : optionsFor(k, d.type));
      d[k] = R.pick(o);
    }
  }
  return sanitize(d);
}

export function randomize(type, R) {
  const T = TYPES[type];
  const names = Object.keys(T.presets);
  const d = makeDNA(type, R.pick(names));
  return mutate(d, 0.55, R);
}

export function describe(d) {
  const T = TYPES[d.type];
  return T ? T.label : d.type;
}
