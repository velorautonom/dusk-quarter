// palette.js — the whole game's colour set, named once.
// Dusk Quarter reads as a decommissioned harbour yard at last light: desaturated teal stone,
// warm sand ground and rusted steel, with two site colours that never appear anywhere else so a
// player can tell A from B at a glance from across the map.

export const PALETTE = {
  // ground and air
  fog: 0x1b2426,
  sky: 0x2b3a3c,
  floor: 0x8f8a76,
  floorLine: 0x6f6a5a,

  // structure
  wall: 0x46585a,
  wallTop: 0x556a6b,
  wallDark: 0x334446,
  crate: 0x9d5b3a,
  crateTop: 0xb0704a,
  prop: 0x6b7a72,
  spawn: 0x3c4a4c,

  // the two objectives
  siteA: 0xc4622e,
  siteB: 0x2f8b84,

  // teams
  attacker: 0xd07a3e,
  defender: 0x4e9c96,

  // light
  hemiSky: 0xd9e6e0,
  hemiGround: 0x6a5c46,
  sun: 0xffd2a1,

  // interface (mirrors the CSS custom properties in index.html)
  canvas: 0x141a1c,
  ink: 0xefe9dc,
  muted: 0x93a09e,
  accent: 0xe9a13c,
};

// CSS-side colours, kept beside the 3D ones so the HUD and the world agree.
export const CSS = {
  canvas: '#141a1c',
  surface: '#1d2629',
  hairline: '#2f3b3d',
  ink: '#efe9dc',
  muted: '#93a09e',
  accent: '#e9a13c',
  attacker: '#d07a3e',
  defender: '#4e9c96',
  danger: '#c94a3a',
};
