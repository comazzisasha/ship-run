'use strict';
/* ==========================================================================
   SHIP RUN  -  game.js

   1. Settings                 7. Drawing
   2. Your CMU constants       8. Playing (random run / practice / editor test)
   3. Geometry helpers         9. Saving levels (browser + levels.js)
   4. Objects                 10. Level editor
   5. Player (your physics)   11. Menus and start-up
   6. World + randomizer

   The physics in sections 2, 4 and 5 is a line-by-line port of the CMU
   CS Academy version: same numbers, same order of steps, same hitboxes.
   One difference in HOW (not what): in CMU every object moved left each
   step. Here objects stay still and the camera (scrollX) moves right.
   The ship is checked at x = shipCenterX + scrollX, which is the same thing.
   ========================================================================== */


// ===== 1. SETTINGS =========================================================

const GAME_TITLE = 'Ship Run';
const LEVELS_PER_RUN = 5;      // how many random levels make one run
const VIEW_WIDTH = 640;        // width of the game view in pixels (CMU was 400). Height is always 400.
const SHIP_SCREEN_X = Math.round(VIEW_WIDTH / 3);   // where the middle of the ship is drawn, in pixels from the left edge

// Your pictures. Put these files in the same folder as index.html, with exactly
// these names. A picture that is missing is drawn with simple shapes instead.
const IMAGE_FOLDER = '';       // or 'images/' if you keep them in a folder called images
const IMAGES = {
  ship:          'ship.png',
  shipFlipped:   'ship_flipped.png',
  cube:          'cube.png',
  cubeFlipped:   'cube_flipped.png',
  gridBlock:     'GridBlock.png',
  orb:           'Orb.png',
  pad:           'Pad.png',
  saw:           'RegularSawblade01.png',
  speed_half:    'slow speed.png',
  speed_normal:  'normal speed.png',
  speed_double:  'double speed.png',
  speed_triple:  'triple speed.png',
  speed_quad:    'quad speed.png',
  'gravity_1':   'NormalGravity.png',
  'gravity_-1':  'FlipGravity.png',
  size_mini:     'miniportal.png',
  size_big:      'bigportal.png',
  teleportIn:    'TeleportIn.png',
  teleportOut:   'TeleportOut.png',
  thornPit:      'ThornPit.png',
};


// ===== 2. YOUR CMU CONSTANTS (same names, same numbers) ====================

let upInput = false;
const position = 100;
const velocity = 0;
const initialSpeed = 'normal';
const stepsPerSecond = 45;
const dt = 1 / stepsPerSecond;
const gridSize = 20;
const pxPerUnit = gridSize / 30;
const shipAccel = 22.4 * 60 * pxPerUnit;
const maxVy = 8 * 60 * pxPerUnit;
const miniShipAccel = 24.1 * 60 * pxPerUnit;
const miniMaxVy = 9.41 * 60 * pxPerUnit;
const miniScale = 0.6;
const shipCenterX = 150 + gridSize / 2;
const epsilon = 0.001;
const screenHeight = 400;
let scrollX = 0;
const sawSpin = 1;
const velUnit = 60 * pxPerUnit;
// CMU used 2 squares. A 2x saw reaches 2 squares from its middle, so the game now
// looks 3 squares ahead and behind. Nothing smaller can touch the ship from 2+ away,
// so this changes nothing for every other object.
const nearRange = 3 * gridSize;
let pressed = false;
let noClip = false;
const scale = 0.3;               // icon tuning, "scale" in CMU

const speed_lookup = { half: 8.4, normal: 10.4, double: 12.9, triple: 15.6, quad: 19.2 };
let currentSpeed = speed_lookup[initialSpeed];


// ===== 3. GEOMETRY HELPERS =================================================

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

// Same formula as your rotatePoint
function rotatePoint(point, center, angle) {
  const [x, y] = point, [centerX, centerY] = center;
  const theta = angle;
  const x_prime = centerX + (x - centerX) * Math.cos(theta) + (y - centerY) * Math.sin(theta);
  const y_prime = centerY - (x - centerX) * Math.sin(theta) + (y - centerY) * Math.cos(theta);
  return [x_prime, y_prime];
}

// A CMU Rect(align='center') turned by rotateAngle (degrees, clockwise on screen)
function rotatedRect(cx, cy, w, h, angleDeg) {
  const a = rad(angleDeg), c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c]);
}
function boxPoly(l, t, r, b) { return [[l, t], [r, t], [r, b], [l, b]]; }

// hitsShape for convex shapes (separating axis test, touching edges do not count)
function projectPoly(P, nx, ny) {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of P) { const p = x * nx + y * ny; if (p < min) min = p; if (p > max) max = p; }
  return [min, max];
}
function polysOverlap(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
      const nx = y1 - y2, ny = x2 - x1;
      const [a0, a1] = projectPoly(A, nx, ny), [b0, b1] = projectPoly(B, nx, ny);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}
function pointInPoly(px, py, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx - px, qy = y1 + t * dy - py;
  return qx * qx + qy * qy;
}
function polyCircle(P, c) {
  if (pointInPoly(c.cx, c.cy, P)) return true;
  for (let i = 0; i < P.length; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
    if (segDist2(c.cx, c.cy, x1, y1, x2, y2) < c.r * c.r) return true;
  }
  return false;
}
function hitsShape(poly, shape) { return shape.circle ? polyCircle(poly, shape.circle) : polysOverlap(poly, shape.poly); }


// ===== 4. OBJECTS ==========================================================
// A level stores each object like your constructor calls:
//   ["Spike", X, Y, angle]   ["Block", X, Y]   ["Saw", X, Y, size]
//   ["SpeedPortal", X, Y, "half"]   ["TelePortal", X, Y1, Y2]   ...
// Optional settings go in {...} at the very end, like keyword arguments:
//   ["Spike", 10, 2, 0, {"color": 5}]          main color channel 5
//   ["Deco", 4, 3, 0, "d_ball_01_001", {"color": "black", "detail": 2, "groups": [1]}]
//   ["ColorTrigger", 30, 5, {"channel": "bg", "rgb": "#FF0000", "fade": 1}]

const HAZARDS = {
  Spike:      { P: [[0, 0], [0.5, 1], [1, 0]],         H: [[0.4, 0.3], [0.4, 0.7], [0.6, 0.7], [0.6, 0.3]] },
  ShortSpike: { P: [[0, 0], [0.5, 0.4], [1, 0]],       H: [[0.4, 0.2], [0.4, 0.4], [0.6, 0.4], [0.6, 0.2]] },
  SmallSpike: { P: [[1 / 6, 0], [0.5, 2 / 3], [5 / 6, 0]], H: [[5 / 12, 1 / 6], [5 / 12, 1 / 2], [7 / 12, 1 / 2], [7 / 12, 1 / 6]] },
  TinySpike:  { P: [[0, 0], [0.25, 0.5], [0.5, 0]],    H: [[3 / 16, 3 / 8], [5 / 16, 3 / 8], [5 / 16, 1 / 8], [3 / 16, 1 / 8]] },
};
const PORTALS = {
  SpeedPortal: { statusType: 'speed', variants: {
    half: [1.5, 1.5 * 175 / 140], normal: [1.5, 1.5 * 115 / 70], double: [1.75, 1.75 * 115 / 103],
    triple: [2.5, 2.5 * 115 / 132], quad: [2.5, 2.5 * 115 / 140] } },
  GravityPortal: { statusType: 'gravity', variants: { '1': [1.75, 1.75 * 377 / 234], '-1': [1.75, 1.75 * 377 / 234] } },
  SizePortal: { statusType: 'size', variants: { mini: [1.75, 1.75 * 377 / 234], big: [1.75, 1.75 * 377 / 234] } },
};
const TELE_W = 2, TELE_H = 3.5;
const PAD_BOOST = { big: 16, mini: 9.17 }, PAD_H = 0.125;
const ORB_BOOST = { big: 8, mini: 7.07 };
// Fading spikes: same shape and hitbox as the normal spikes, only drawn as an
// outline that fades out while the ship is close (like Geometry Dash).
const FADE_OF = { FadeSpike: 'Spike', FadeShortSpike: 'ShortSpike', FadeSmallSpike: 'SmallSpike', FadeTinySpike: 'TinySpike' };
const TYPES = ['Block', 'GridBlock', 'OutlineBlock', 'InvisibleBlock', 'Spike', 'ShortSpike', 'SmallSpike', 'TinySpike',
  'FadeSpike', 'FadeShortSpike', 'FadeSmallSpike', 'FadeTinySpike', 'ThornPit', 'Saw',
  'SpeedPortal', 'GravityPortal', 'SizePortal', 'TelePortal', 'Pad', 'Orb', 'Coin', 'ColorTrigger', 'AlphaTrigger', 'Deco', 'Slope'];
const isKnownType = t => TYPES.includes(t);
const isRotatable = t => !!HAZARDS[t] || !!FADE_OF[t] || t === 'ThornPit' || t === 'OutlineBlock' || t === 'Deco' || t === 'Slope';
const isFlippable = t => t === 'OutlineBlock' || t === 'Deco' || t === 'Slope';   // these keep a mirror flag in slot 5
const isTrigger = t => t === 'ColorTrigger' || t === 'AlphaTrigger';
const SAW_MIN = 0.5, SAW_MAX = 2;

// --- the {...} settings at the end of an object ---
const isOpts = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function optsOf(d) { const v = d[d.length - 1]; return isOpts(v) ? v : null; }
function argsOf(d) { return optsOf(d) ? d.slice(0, -1) : d; }      // the constructor arguments without the {...}
function getArg(d, i) { return argsOf(d)[i]; }
function setArg(d, i, v) {        // changes argument i and keeps the {...} at the end
  const op = optsOf(d); if (op) d.pop();
  while (d.length < i) d.push(0);
  d[i] = v;
  if (op) d.push(op);
}
function setOpt(d, key, v) {      // v = null removes the setting
  let op = optsOf(d);
  if (v === null || v === undefined) { if (op) { delete op[key]; if (!Object.keys(op).length) d.pop(); } return; }
  if (!op) { op = {}; d.push(op); }
  op[key] = v;
}
function toggleFlip(d) {          // the mirror flag of outline blocks, deco and slopes (slot 5)
  if (getArg(d, 5)) { const op = optsOf(d); if (op) { d.pop(); d.length = 5; d.push(op); } else d.length = 5; }
  else setArg(d, 5, 1);
}

// --- color channels (like Geometry Dash) ---
// 1 to 999 are yours (all start white). The named ones: BG, GROUND, LINE, OBJ
// (the default for most objects), and BLACK, WHITE, P1, P2, which never change.
const CH = { BG: 1000, GROUND: 1001, LINE: 1002, OBJ: 1004, P1: 1005, P2: 1006, BLACK: 1010, WHITE: 1011 };
const CH_NAME = { 1000: 'bg', 1001: 'ground', 1002: 'line', 1004: 'obj', 1005: 'p1', 1006: 'p2', 1010: 'black', 1011: 'white' };
const CH_BY_NAME = Object.fromEntries(Object.entries(CH_NAME).map(([k, v]) => [v, Number(k)]));
const CH_FIXED = new Set([CH.P1, CH.P2, CH.BLACK, CH.WHITE]);
const PLAYER_RGB = { 1: [109, 255, 82], 2: [54, 214, 255] };        // the ship's two colors
const CH_DEFAULT = { 1000: [111, 157, 242], 1001: [0, 0, 139], 1005: PLAYER_RGB[1], 1006: PLAYER_RGB[2], 1010: [0, 0, 0] };
function chId(v) {                 // a channel as written in levels.js -> its number (0 = none)
  if (typeof v === 'string') { const n = CH_BY_NAME[v.trim().toLowerCase()]; return n || chId(Number(v)); }
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const n = Math.round(v);
  return (n >= 1 && n <= 999) || CH_NAME[n] ? n : 0;
}
const chKey = id => CH_NAME[id] || id;                       // how levels.js writes a channel
const chLabel = id => CH_NAME[id] ? CH_NAME[id].toUpperCase() : String(id);
const clamp01 = v => Math.max(0, Math.min(1, v));
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
// A channel's settings: color, opacity, blending, or copy another channel / a player color
function defaultSpec(id) { return { rgb: (CH_DEFAULT[id] || [255, 255, 255]).slice(), op: 1, blend: false, copy: 0, copyOp: false, player: 0 }; }
function parseSpec(v, id) {
  const s = defaultSpec(id);
  if (typeof v === 'string') { s.rgb = hexToRgb(v) || s.rgb; return s; }
  if (!isOpts(v)) return s;
  s.rgb = hexToRgb(v.rgb) || s.rgb;
  if (typeof v.opacity === 'number') s.op = clamp01(v.opacity);
  s.blend = !!v.blending;
  s.copy = v.copy != null ? chId(v.copy) : 0;
  s.copyOp = !!v.copyOpacity;
  s.player = v.player === 1 || v.player === 2 ? v.player : 0;
  return s;
}
function specJSON(s, keepRgb) {     // the shortest levels.js form of a channel's settings
  const o = {};
  o.rgb = rgbToHex(s.rgb);
  if (s.op !== 1) o.opacity = Number(s.op.toFixed(3));
  if (s.blend) o.blending = true;
  if (s.copy) { o.copy = chKey(s.copy); if (s.copyOp) o.copyOpacity = true; }
  if (s.player) o.player = s.player;
  return Object.keys(o).length === 1 && !keepRgb ? o.rgb : o;
}

// The colors of one level while it plays: its own channel settings, what
// color triggers changed (with their fade), and alpha-trigger group opacity.
class ColorState {
  constructor(colors) {
    this.base = new Map();
    for (const [k, v] of Object.entries(isOpts(colors) ? colors : {})) {
      const id = chId(k);
      if (id && !CH_FIXED.has(id)) this.base.set(id, parseSpec(v, id));
    }
    this.reset();
  }
  reset() { this.cur = new Map(); this.tw = new Map(); this.groups = new Map(); this.memo = new Map(); this.memoT = NaN; }
  spec(id) { return this.cur.get(id) || this.base.get(id) || defaultSpec(id); }
  // A color trigger: change channel id to spec over `fade` seconds
  set(id, spec, now, fade) {
    if (!id || CH_FIXED.has(id)) return;
    const from = this.resolve(id, now);
    this.cur.set(id, spec);
    if (fade > 0) this.tw.set(id, { from: [from.r, from.g, from.b, from.a], t0: now, dur: fade }); else this.tw.delete(id);
    this.memoT = NaN;
  }
  // An alpha trigger: fade group g to opacity `to`
  setGroup(g, to, now, fade) {
    const from = this.groupAlpha(g, now);
    this.groups.set(g, { from, to: clamp01(to), t0: now, dur: fade > 0 ? fade : 0 });
  }
  groupAlpha(g, now) {
    const s = this.groups.get(g);
    if (!s) return 1;
    if (!s.dur || now >= s.t0 + s.dur) return s.to;
    return s.from + (s.to - s.from) * Math.max(0, (now - s.t0) / s.dur);
  }
  resolve(id, now, depth = 0) {
    if (this.memoT !== now) { this.memo.clear(); this.memoT = now; }
    let c = this.memo.get(id);
    if (c) return c;
    const s = this.spec(id);
    let rgb = s.rgb, a = s.op;
    if (s.player) rgb = PLAYER_RGB[s.player];
    else if (s.copy && s.copy !== id && depth < 6) { const src = this.resolve(s.copy, now, depth + 1); rgb = [src.r, src.g, src.b]; if (s.copyOp) a = src.a; }
    c = { r: rgb[0], g: rgb[1], b: rgb[2], a, blend: s.blend, fading: false };
    const t = this.tw.get(id);
    if (t) {
      const k = (now - t.t0) / t.dur;
      if (k >= 1) this.tw.delete(id);
      else {
        const q = Math.max(0, k), mix = (x, y) => x + (y - x) * q;
        c = { r: mix(t.from[0], c.r), g: mix(t.from[1], c.g), b: mix(t.from[2], c.b), a: mix(t.from[3], c.a), blend: c.blend, fading: true };
      }
    }
    this.memo.set(id, c);
    return c;
  }
}

// --- designs: other looks for spikes, thorn pits and saws, with the same hitbox ---
// Spikes: [shape it uses, has a fill layer, centre height in the square]
const SPIKE_LOOKS = {
  colorSpike_01: ['Spike', 1, 0.5], colorSpike_02: ['ShortSpike', 1, 0.225], colorSpike_03: ['SmallSpike', 1, 0.3167], colorSpike_04: ['TinySpike', 1, 0.2],
  iceSpike_01: ['Spike', 0, 0.5], iceSpike_02: ['ShortSpike', 0, 0.2583], iceSpike_03: ['SmallSpike', 0, 0.3333],
  gdh_spike_01: ['Spike', 2, 0.5], gdh_spike_02: ['SmallSpike', 2, 0.3333], gdh_spike_03: ['TinySpike', 2, 0.25], gdh_spike_04: ['TinySpike', 2, 0.1667],
};
// Thorn pits: how far the picture's middle sits above the bottom of its square (tall bushes stand up)
const PIT_LOOKS = { pit_02: 0, pit_03: 0, pit_04: 0, pit_04_02: 0, pit_04_03: 0, pit_04_low: 0, pit_05: 0, pit_05_02: 0, pit_05_03: 0,
  pit_06: 0, pit_06_2: 0, pit_07: 0, pit_b_01: 0.775, pit_b_02: 0.967, pit_b_03: 0.775, pit_b_04: 0.458 };
// Saws: r = hitbox radius at 1x (the main saw is 1), join = how the stored piece
// is put together, ch = default color, det = the color layer (and how it joins), halo = soft white edge
const SAW_LOOKS = {
  sawblade_01:      { r: 1, join: 'half', ch: CH.BLACK, halo: 1 },
  blade_01:         { r: 1.01, join: 'quad', ch: CH.OBJ },
  blade_02:         { r: 0.73, ch: CH.OBJ },
  blade_03:         { r: 0.5, ch: CH.OBJ },
  blade_b_01:       { r: 1.02, join: 'quad', ch: CH.OBJ },
  blade_b_02:       { r: 0.83, ch: CH.OBJ },
  blade_b_03:       { r: 0.48, ch: CH.OBJ },
  blackCogwheel_01: { r: 0.96, join: 'quad', ch: CH.BLACK, det: 'quad', dch: CH.BLACK, halo: 1 },
  blackCogwheel_02: { r: 0.63, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  blackCogwheel_03: { r: 0.47, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  darkblade_01:     { r: 1.02, join: 'quad', ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  darkblade_02:     { r: 0.75, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  darkblade_03:     { r: 0.51, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  lightBlade_01:    { r: 0.95, join: 'quad', ch: CH.OBJ, det: 'quad', dch: CH.BLACK, under: 1 },
  lightBlade_02:    { r: 0.65, ch: CH.OBJ, det: '', dch: CH.BLACK, under: 1 },
  lightBlade_03:    { r: 0.43, ch: CH.OBJ, det: '', dch: CH.BLACK, under: 1 },
  spinBlade01:      { r: 0.91, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  spinBlade02:      { r: 0.6, ch: CH.BLACK, det: '', dch: CH.BLACK, halo: 1 },
  bladeTrap01:      { r: 0.47, join: 'mirror', ch: CH.BLACK, det: 'mirror', dch: CH.BLACK, halo: 1 },
  bladeTrap02:      { r: 0.34, join: 'mirror', ch: CH.BLACK, det: 'mirror', dch: CH.BLACK, halo: 1 },
  bladeTrap03:      { r: 0.29, join: 'mirror', ch: CH.BLACK, det: 'mirror', dch: CH.BLACK, halo: 1 },
};
const sawLook = o => SAW_LOOKS[o.design || 'sawblade_01'];
// Outline pieces: sprite, centre height, the white parts as boxes [left, bottom, right, top]
// (0..1 inside the square), and whether it fades like an outline spike.
// Hitboxes are never thinner than LINE_T, so a fast ship cannot slip through a line.
const LINE_T = 0.15;
const OUTLINE_PIECES = {
  1:  ['blockOutline_01_001', 0.5, [[0, 0, 1, 1]]],
  2:  ['blockOutline_02_001', 1 - 1.5 / 60, [[0, 1 - LINE_T, 1, 1]]],
  3:  ['blockOutline_03_001', 0.5, [[0, 1 - LINE_T, 1, 1], [0, 0, LINE_T, 1 - LINE_T]]],
  4:  ['blockOutline_04_001', 0.5, [[0, 1 - LINE_T, 1, 1], [0, 0, LINE_T, 1 - LINE_T], [1 - LINE_T, 0, 1, 1 - LINE_T]]],
  5:  ['blockOutline_05_001', 0.5, [[0, 0, LINE_T, 1]]],
  6:  ['blockOutline_06_001', 0.5, [[0, 1 - LINE_T, LINE_T, 1]]],
  7:  ['blockOutline_07_001', 0.5, [[0, 1 - LINE_T, LINE_T, 1]]],
  8:  ['blockOutline_08_001', 0.5, [[0, 1 - LINE_T, LINE_T, 1]]],
  9:  ['blockOutline_09_001', 1 - 1.5 / 60, [[0, 1 - LINE_T, 1, 1]]],
  10: ['invisibleOutline_01_001', 1 - 1.5 / 60, [[0, 1 - LINE_T, 1, 1]], true],
  11: ['invisibleOutline_b_01_001', 1 - 3 / 60, [[0, 1 - LINE_T, 1, 1]], true],
};
const OUTLINE_MAX = 11;
// Deco that is placed off-centre in its square (slabs sit at the top, fake spikes on the floor)
const DECO_ANCHOR = (window.GD_SPRITES && window.GD_SPRITES.anchor) || {};
// Default channels: [main, detail]. Thorn pits and saws are black, like Geometry Dash.
function decoChannels(spr) { return spr.startsWith('pit_') ? [CH.BLACK, 1] : [CH.OBJ, 1]; }

function makeObject(def, colOffset = 0, idx = 0) {
  const g = gridSize;
  const a = argsOf(def), op = optsOf(def) || {};
  const t = a[0], X = a[1] + colOffset, Y = a[2];
  const o = { t, X, Y, idx, def, kind: 'none', layer: 0, ch: 0, dch: 0 };
  o.x = (X - 1) * g;                 // GameObject.__init__
  o.y = 300 - (Y - 1) * g;
  let ch0 = 0, dch0 = 0;             // default colors (0 = this object is never colored)

  if (HAZARDS[t] || FADE_OF[t]) {    // Spike, ShortSpike, SmallSpike, TinySpike (and their fading versions)
    const H = HAZARDS[t] || HAZARDS[FADE_OF[t]];
    o.kind = 'hazard'; o.layer = 3; o.fade = !!FADE_OF[t]; o.shape = FADE_OF[t] || t;
    o.angleDeg = Number(a[3]) || 0; o.angle = rad(o.angleDeg);
    const c = [o.x + 0.5 * g, o.y - 0.5 * g];
    const corners = pts => pts.map(([u, v]) => rotatePoint([o.x + u * g, o.y - v * g], c, o.angle));
    o.pts = corners(H.P);
    o.hit = { poly: corners(H.H) };
    const xs = o.pts.map(p => p[0]);
    o.cx = (Math.min(...xs) + Math.max(...xs)) / 2;      // Shape.centerX
    const look = !o.fade && SPIKE_LOOKS[a[4]];
    if (look && look[0] === t) o.design = a[4];
    ch0 = CH.OBJ;
    if (o.design && look[1]) dch0 = CH.BLACK;
  } else if (t === 'ThornPit') {
    o.kind = 'hazard'; o.layer = 3;
    o.angleDeg = Number(a[3]) || 0; o.angle = rad(o.angleDeg);
    if (PIT_LOOKS[a[4]] != null) o.design = a[4];
    const cx = o.x + 0.5 * g, cy = o.y - 0.5 * g, c = [cx, cy];
    [o.imgX, o.imgY] = rotatePoint([cx, o.y - (o.design ? PIT_LOOKS[o.design] : 0) * g], c, o.angle);
    const [hitX, hitY] = rotatePoint([cx, o.y + 0.065 * g], c, o.angle);
    o.rotDeg = -deg(o.angle);
    o.hit = { poly: rotatedRect(hitX, hitY, 0.33 * g, 0.43 * g, o.rotDeg) };
    o.cx = rotatePoint([cx, o.y], c, o.angle)[0];
    ch0 = CH.BLACK;
  } else if (t === 'Saw') {
    o.kind = 'hazard'; o.layer = 2;
    o.size = a[3] == null ? 1 : Math.min(SAW_MAX, Math.max(SAW_MIN, Number(a[3]) || 1));
    if (SAW_LOOKS[a[4]] && a[4] !== 'sawblade_01') o.design = a[4];
    const L = sawLook(o);
    o.cx = o.x + 0.5 * g; o.cy = o.y - 0.5 * g;
    o.spin = Math.random() * 360;
    o.hit = { circle: { cx: o.cx, cy: o.cy, r: g * o.size * L.r } };
    ch0 = L.ch; if (L.det != null) dch0 = L.dch || 1;
  } else if (t === 'Block' || t === 'OutlineBlock' || t === 'InvisibleBlock') {
    // Block and the invisible block fill their square. Outline pieces are solid
    // only where their white lines are (the edge line sits at the top).
    o.kind = 'solid'; o.layer = 1;
    o.box = { l: o.x, r: o.x + g, t: o.y - g, b: o.y };
    o.hit = { poly: boxPoly(o.x, o.y - g, o.x + g, o.y) };
    o.cx = o.x + g / 2;
    if (t === 'InvisibleBlock') o.fade = true;
    if (t === 'OutlineBlock') {
      o.angleDeg = Number(a[3]) || 0; o.angle = rad(o.angleDeg);
      o.piece = Math.min(OUTLINE_MAX, Math.max(1, Math.round(Number(a[4]) || 1))); o.flip = !!a[5];
      const P = OUTLINE_PIECES[o.piece], turn = rad(Math.round(o.angleDeg / 90) * 90), c = [o.x + g / 2, o.y - g / 2];
      o.fade = !!P[3];
      o.parts = P[2].map(([u0, v0, u1, v1]) => {
        if (o.flip) [u0, u1] = [1 - u1, 1 - u0];
        const pts = [[u0, v0], [u1, v1]].map(([u, v]) => turn ? rotatePoint([o.x + u * g, o.y - v * g], c, turn) : [o.x + u * g, o.y - v * g]);
        const box = { l: Math.min(pts[0][0], pts[1][0]), r: Math.max(pts[0][0], pts[1][0]), t: Math.min(pts[0][1], pts[1][1]), b: Math.max(pts[0][1], pts[1][1]) };
        return { box, poly: boxPoly(box.l, box.t, box.r, box.b) };
      });
      o.box = o.parts[0].box; o.hit = { poly: o.parts[0].poly };
    }
    ch0 = CH.OBJ;
  } else if (PORTALS[t]) {           // SpeedPortal, GravityPortal, SizePortal
    const P = PORTALS[t];
    o.kind = 'portal'; o.layer = 4; o.statusType = P.statusType;
    o.status = t === 'GravityPortal' ? Number(a[3]) : a[3];
    const v = P.variants[String(o.status)] || Object.values(P.variants)[0];
    o.w = g * v[0]; o.h = g * v[1];
    o.cx = o.x + 0.5 * g; o.cy = o.y - 0.5 * g;
    o.hit = { poly: boxPoly(o.cx - o.w / 2, o.cy - o.h / 2, o.cx + o.w / 2, o.cy + o.h / 2) };
  } else if (t === 'TelePortal') {
    o.kind = 'portal'; o.layer = 4; o.statusType = 'teleport';
    o.Y2 = a[3] == null ? Y : Number(a[3]);
    o.y1 = 300 - (Y - 1) * g;
    o.y2 = 300 - (o.Y2 - 1) * g;
    o.w = g * TELE_W; o.h = g * TELE_H;
    o.cx = o.x + 0.5 * g; o.cy1 = o.y1 - 0.5 * g; o.cy2 = o.y2 - 0.5 * g;
    o.hit = { poly: boxPoly(o.cx - o.w / 2, o.cy1 - o.h / 2, o.cx + o.w / 2, o.cy1 + o.h / 2) };
    o.exitPoly = boxPoly(o.cx - o.w / 2, o.cy2 - o.h / 2, o.cx + o.w / 2, o.cy2 + o.h / 2);
    o.used = false;
  } else if (t === 'Pad') {
    o.kind = 'transporter'; o.layer = 2;
    const h = PAD_H * g;
    o.hit = { poly: boxPoly(o.x, o.y - h, o.x + g, o.y) };
    o.cx = o.x + g / 2;
  } else if (t === 'Orb') {
    o.kind = 'transporter'; o.layer = 2;
    // The orb's hitbox is its own square (CMU had it one square lower, under the picture).
    o.hit = { poly: boxPoly(o.x, o.y - g, o.x + g, o.y) };
    o.cx = o.x + g / 2;
    o.used = false;
  } else if (t === 'Coin') {          // a user coin: touch it, then reach the end of its level
    o.kind = 'coin'; o.layer = 5;
    o.cx = o.x + g / 2; o.cy = o.y - g / 2;
    o.hit = { circle: { cx: o.cx, cy: o.cy, r: 0.55 * g } };
    o.key = a[1] + ',' + a[2];
  } else if (isTrigger(t)) {          // color and alpha triggers: only seen in the editor
    o.kind = 'trigger'; o.layer = 9;
    o.cx = o.x + g / 2; o.cy = o.y - g / 2; o.tx = o.cx;
    o.hit = { poly: boxPoly(o.x, o.y - g, o.x + g, o.y) };
    o.touch = !!op.touch; o.spawn = !!op.spawn;
    o.fadeTime = typeof op.fade === 'number' ? Math.max(0, op.fade) : 0.5;
    if (t === 'ColorTrigger') { o.target = op.channel == null ? 1 : chId(op.channel); o.spec = parseSpec(op, 0); }
    else { o.group = Math.max(0, Math.round(Number(op.group) || 0)); o.opacity = typeof op.opacity === 'number' ? clamp01(op.opacity) : 1; }
  } else if (t === 'Deco' || t === 'Slope') {   // decoration: no hitbox, drawn behind everything
    o.layer = -1;
    o.angleDeg = Number(a[3]) || 0; o.angle = rad(o.angleDeg);
    o.spr = String(a[4] || ''); o.flip = !!a[5];
    o.fade = o.spr.startsWith('invis');
    const sz = sprSize(o.spr) || [1, 1];
    o.sw = sz[0] * g; o.sh = sz[1] * g;
    // where the picture's middle is: deco from the anchor list, slopes snap to the grid
    let [u, v] = DECO_ANCHOR[o.spr] || [0.5, 0.5];
    if (t === 'Slope') {
      if (Math.round(sz[0]) % 2 === 0) u += 0.5;
      if (Math.round(sz[1]) % 2 === 0) v += 0.5;
    } else if (o.flip) u = 1 - u;
    const c = [o.x + 0.5 * g, o.y - 0.5 * g];
    [o.px, o.py] = rotatePoint([o.x + u * g, o.y - v * g], c, o.angle);
    o.cx = o.x + g / 2;
    [ch0, dch0] = decoChannels(o.spr);
  } else {                           // GridBlock (decoration, never colored) and anything unknown
    o.cx = o.x + g / 2;
  }
  if (ch0) {
    o.ch0 = ch0; o.dch0 = dch0;
    o.ch = chId(op.color) || ch0;
    if (dch0) o.dch = chId(op.detail) || dch0;
  }
  o.groups = Array.isArray(op.groups) ? op.groups.map(n => Math.round(Number(n))).filter(n => n >= 1 && n <= 9999) : [];
  return o;
}


// ===== 5. PLAYER (your Player class) =======================================

class Player {
  constructor() {
    this.y = position;
    this.vy = velocity;
    this.alive = true;
    this.theta = 0;
    this.onGround = false;
    this.gravity = 1;
    this.size = '';
    this.sizeScale = 1;
    this.hb = { bottom: screenHeight - position, size: gridSize };   // self.hitbox
    this.rot = { cy: screenHeight - position - gridSize / 2, w: gridSize, angle: 0 };  // self.rotHitbox
    this.setSize('big');
  }

  updateVelocity() {
    if (upInput) this.vy += this.accel * dt * this.gravity;
    else this.vy -= this.accel * dt * this.gravity;
  }

  updatePosition() {
    this.y += this.vy * dt;
  }

  syncHitbox() {
    this.hb.bottom = screenHeight - this.y;
  }

  hitboxAt(sx) {
    const s = this.hb.size;
    return { l: sx - s / 2, r: sx + s / 2, t: this.hb.bottom - s, b: this.hb.bottom };
  }

  hitPoly(sx) {
    const b = this.hitboxAt(sx);
    return boxPoly(b.l, b.t, b.r, b.b);
  }

  Update() {
    if (!this.alive) return;

    const h = gridSize * this.sizeScale;
    const prevTop = this.hb.bottom - this.hb.size;
    const prevBottom = this.hb.bottom;

    this.updatePosition();
    this.updateVelocity();

    if (this.y < 100) { this.y = 100; this.vy = 0; }
    if (this.y > 300 - h) { this.y = 300 - h; this.vy = 0; }
    if (this.vy > this.maxSpeed) this.vy = this.maxSpeed;
    if (this.vy < -this.maxSpeed) this.vy = -this.maxSpeed;

    this.onGround = (this.y <= 100 || this.y >= 300 - h);
    this.syncHitbox();

    const sx = shipCenterX + scrollX;   // where the ship is in the level
    const near = world.near(sx);

    for (const block of near) {
      if (block.kind !== 'solid') continue;
      const s = this.hitboxAt(sx), b = block.box;
      if (s.r > b.l && s.l < b.r && s.b > b.t && s.t < b.b) {
        if (prevBottom <= b.t + epsilon) {
          this.y += s.b - b.t; this.vy = 0; this.onGround = true;
        } else if (prevTop >= b.b - epsilon) {
          this.y -= b.b - s.t; this.vy = 0; this.onGround = true;
        }
        this.syncHitbox();
      }
    }

    // solidHitbox: 0.3 * gridSize square in the middle of the hitbox
    const half = gridSize * 0.3 / 2;
    const cy = this.hb.bottom - this.hb.size / 2;
    for (const block of near) {
      if (block.kind !== 'solid') continue;
      const b = block.box;
      if (sx + half > b.l && sx - half < b.r && cy + half > b.t && cy - half < b.b) this.Die();
    }

    const hitPoly = this.hitPoly(sx);
    const rotPoly = rotatedRect(sx, this.rot.cy, this.rot.w, this.rot.w, this.rot.angle);
    for (const obj of near) {
      if (obj.kind === 'hazard') {
        if (hitsShape(hitPoly, obj.hit) || hitsShape(rotPoly, obj.hit)) this.Die();
      }
    }
    for (const obj of near) {
      if (obj.kind === 'portal') {
        if (hitsShape(this.hitPoly(sx), obj.hit)) applyPortal(obj);
      }
    }
    for (const obj of near) {
      if (obj.kind === 'transporter') {
        if (hitsShape(this.hitPoly(sx), obj.hit)) touch(obj);
      }
    }
  }

  // The non-drawing half of your render(): turning the ship and placing the rotated hitbox
  render() {
    let target = Math.atan2(-this.vy, currentSpeed * gridSize);
    let rate = 0.15;
    if (this.onGround) { target = 0; rate = 0.05; }
    this.theta += (target - this.theta) * rate;
    this.hb.bottom = 400 - this.y;
    this.rot.cy = this.hb.bottom - this.hb.size / 2;
    this.rot.angle = deg(this.theta);
  }

  Die() {
    if (noClip) return;
    this.alive = false;
  }

  reset() {
    this.setSize('big');
    this.y = position;
    this.vy = velocity;
    this.theta = 0;
    this.onGround = false;
    this.alive = true;
    this.syncHitbox();
    this.gravity = 1;
    this.render();
  }

  setSize(size) {
    if (size === this.size) return;
    const oldH = gridSize * this.sizeScale;
    this.size = size;
    if (size === 'mini') {
      this.sizeScale = miniScale; this.accel = miniShipAccel; this.maxSpeed = miniMaxVy;
    } else {
      this.sizeScale = 1; this.accel = shipAccel; this.maxSpeed = maxVy;
    }
    const newH = gridSize * this.sizeScale;
    this.rot.angle = 0;
    this.y += (oldH - newH) / 2;
    this.hb.size = newH;
    this.rot.w = newH;
    this.syncHitbox();
  }
}

// Portal.apply / TelePortal.apply
function applyPortal(obj) {
  if (obj.t === 'TelePortal') {
    if (obj.used) return;
    obj.used = true;
    const offset = (Me.hb.bottom - Me.hb.size / 2) - obj.cy1;
    const newCenter = obj.cy2 + offset;
    Me.y = screenHeight - (newCenter + gridSize * Me.sizeScale / 2);
    game.teleported = true;
    return;
  }
  setStatus(obj.statusType, obj.status);
}

function setStatus(type, status) {
  if (type === 'speed') setSpeed(status);
  else if (type === 'gravity') Me.gravity = status;
  else if (type === 'size') Me.setSize(status);
}

function setSpeed(speed) { currentSpeed = speed_lookup[speed]; }

// Pad.touch / Orb.touch
function touch(obj) {
  if (obj.t === 'Pad') {
    Me.vy = PAD_BOOST[Me.size] * velUnit * Me.gravity;
  } else if (obj.t === 'Orb') {
    if (pressed && !obj.used) {
      Me.vy = ORB_BOOST[Me.size] * velUnit * Me.gravity;
      obj.used = true;
    }
  }
}

function Move(speed) {
  scrollX += speed * gridSize * dt;
}


// ===== 6. WORLD + RANDOMIZER ===============================================
// A world is one or more levels placed one after another.

function autoEndCol(objects) {
  let right = 0;
  for (const d of objects) {
    let r = d[1];
    if (d[0] === 'Saw') r += Math.ceil(Number(getArg(d, 3)) || 1);
    right = Math.max(right, r);
  }
  return Math.max(right + 2, 12);
}
function levelEndCol(L) { return L.end > 0 ? L.end : autoEndCol(L.objects); }

class World {
  constructor(levelList) {
    this.objects = [];
    this.parts = [];
    this.triggers = [];
    this.coins = [];
    let col = 0;
    levelList.forEach((L, pi) => {
      const start = col;
      for (const def of L.objects) {
        if (!Array.isArray(def) || !isKnownType(def[0])) continue;
        const o = makeObject(def, col, this.objects.length);
        o.part = pi;
        this.objects.push(o);
        // an outline piece with more than one white line gets one solid box per line
        if (o.parts) for (let k = 1; k < o.parts.length; k++) {
          this.objects.push({ t: '_line', kind: 'solid', sub: true, layer: -9, idx: o.idx, part: pi, cx: o.cx, def,
            box: o.parts[k].box, hit: { poly: o.parts[k].poly } });
        }
        if (o.kind === 'trigger') this.triggers.push(o);
        if (o.kind === 'coin') this.coins.push(o);
      }
      col += levelEndCol(L);
      this.parts.push({ name: L.name, id: L.id, startPx: start * gridSize, endPx: col * gridSize, level: L, colors: new ColorState(L.colors) });
    });
    this.endPx = col * gridSize;
    this.sorted = this.objects.slice().sort((a, b) => a.cx - b.cx);
    this.cxs = this.sorted.map(o => o.cx);
    this.saws = this.objects.filter(o => o.t === 'Saw');
    // triggers that fire when the ship passes them, in the order it reaches them
    this.xTriggers = this.triggers.filter(o => !o.touch && !o.spawn).sort((a, b) => a.tx - b.tx || a.idx - b.idx);
    this.nextTrigger = 0;
  }
  firstAtLeast(x) {
    let lo = 0, hi = this.cxs.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.cxs[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }
  // Objects whose Shape.centerX is within nearRange of the ship, in level order (like CMU)
  near(sx) {
    const out = [];
    for (let i = this.firstAtLeast(sx - nearRange); i < this.sorted.length && this.cxs[i] < sx + nearRange; i++) {
      const o = this.sorted[i];
      if (Math.abs(o.cx - sx) < nearRange) out.push(o);
    }
    out.sort((a, b) => a.idx - b.idx);
    return out;
  }
  visible(x0, x1, margin = 120) {
    const out = [];
    for (let i = this.firstAtLeast(x0 - margin); i < this.sorted.length && this.cxs[i] <= x1 + margin; i++) out.push(this.sorted[i]);
    return out;
  }
  partAt(x) {
    for (let i = 0; i < this.parts.length; i++) if (x < this.parts[i].endPx) return i;
    return Math.max(0, this.parts.length - 1);
  }
  reset() {
    for (const o of this.objects) {
      if ('used' in o) o.used = false;
      if (o.kind === 'trigger') o.fired = false;
      if (o.kind === 'coin') { o.got = false; o.gotAt = 0; }
    }
    for (const p of this.parts) p.colors.reset();
    this.nextTrigger = 0;
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function randomizerPool() { return levels.filter(L => L.randomizer && L.objects.length); }

let world = new World([]);
const Me = new Player();


// ===== 7. DRAWING ==========================================================

const COLORS = {
  sky: '#6495ed', ground: '#00008b',
  speed: { half: '#ffad33', normal: '#45c8ff', double: '#5dff6a', triple: '#ff63d8', quad: '#ff4a4a' },
  gravity: { '1': '#3ea8ff', '-1': '#ffe13d' },
  size: { mini: '#ff5fe0', big: '#4dff7c' },
  teleIn: '#4fb6ff', teleOut: '#ff9a3c',
  shipMain: '#6dff52', shipTrim: '#36d6ff',
};

const IMG = {};
for (const [k, src] of Object.entries(IMAGES)) {
  const im = new Image();
  im.onload = () => { IMG[k] = im; imagesChanged(); };
  im.src = IMAGE_FOLDER + encodeURIComponent(src);   // encoding keeps the + in names like slow+speed.png
}

let imgTimer = 0;
function imagesChanged() {
  clearTimeout(imgTimer);
  imgTimer = setTimeout(() => { if (typeof renderPalette === 'function' && ed) { renderPaletteTabs(); renderPalette(); edRequestDraw(); } }, 50);
}

// --- Geometry Dash sprite sheets ---------------------------------------
// sprites.js says, for each graphics quality, which sheet pictures to load and
// where each sprite sits on them. Only the sheets for the chosen quality are
// downloaded. Until they load (or if they are missing) the game falls back to
// your own pictures, then to drawn shapes, so nothing ever breaks.
const SPR = { data: window.GD_SPRITES || null, quality: '', sheets: {}, cache: new Map(), ready: false };
function useSheets() { return !!(SPR.data && SPR.ready && settings.art === 'gd'); }
function loadSprites() {
  SPR.cache.clear(); TINTS.clear(); SPR.ready = false; SPR.sheets = {};
  if (!SPR.data || settings.art !== 'gd') { imagesChanged(); return; }
  const q = SPR.data.sheets[settings.quality] ? settings.quality : 'medium';
  SPR.quality = q;
  const want = Object.entries(SPR.data.sheets[q]);
  let left = want.length;
  for (const [sid, [file, ppc]] of want) {
    const im = new Image();
    im.onload = () => {
      if (SPR.quality !== q) return;
      SPR.sheets[sid] = { im, ppc };
      if (--left === 0) { SPR.ready = true; imagesChanged(); }
    };
    im.onerror = () => { if (!SPR.warned) { SPR.warned = true; setTimeout(() => toast(`Could not load ${file}. Using your own pictures instead.`), 600); } };
    im.src = IMAGE_FOLDER + encodeURIComponent(file);
  }
}
// The frame data for a sprite at the current quality (works before the sheet loads)
function sprFrame(name) {
  if (!SPR.data) return null;
  return (SPR.data.frames[SPR.quality || 'medium'] || {})[name] || SPR.data.frames.medium[name] || null;
}
// Full-size sprite size in squares, e.g. a 60x60 hd sprite is 1 x 1
function sprSize(name) {
  const f = SPR.data && SPR.data.frames.medium[name];
  return f ? [f[6] / 60, f[7] / 60] : null;
}
// Cuts one sprite out of its sheet into its own canvas (full size, padding
// restored, un-rotated) and keeps it for next time. "name|half", "name|quad"
// and "name|mirror" are big sprites stored as a piece, put back together.
function sprCanvas(name) {
  if (!useSheets()) return null;
  const bar = name.indexOf('|');
  if (bar > 0) return sprJoined(name.slice(0, bar), name.slice(bar + 1));
  let c = SPR.cache.get(name);
  if (c !== undefined) return c;
  const f = sprFrame(name), sh = f && SPR.sheets[f[0]];
  if (!f || !sh) { SPR.cache.set(name, null); return null; }
  const [, x, y, w, h, rot, sw, sh2, ox, oy] = f;
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh2));
  const cx = c.getContext('2d');
  const px = (sw - w) / 2 + ox, py = (sh2 - h) / 2 - oy;
  if (rot) {              // stored turned a quarter clockwise: turn it back
    cx.translate(px + w / 2, py + h / 2); cx.rotate(-Math.PI / 2);
    cx.drawImage(sh.im, x, y, h, w, -h / 2, -w / 2, h, w);
  } else cx.drawImage(sh.im, x, y, w, h, px, py, w, h);
  c.ppc = sh.ppc;
  SPR.cache.set(name, c);
  return c;
}
// Geometry Dash stores big round hazards as one piece to save room:
//   half   = the left half; the right half is the same piece turned around (saw teeth all point one way)
//   quad   = the top-left quarter, turned 4 times
//   mirror = the left half and its mirror image
function sprJoined(name, mode) {
  const key = name + '|' + mode;
  let c = SPR.cache.get(key);
  if (c !== undefined) return c;
  const src = sprCanvas(name);
  if (!src) { SPR.cache.set(key, null); return null; }
  const W = src.width, H = src.height, MX = Math.round(W / 2), MY = Math.round(H / 2);
  // The piece's last column (and row) at the cut is only half there: copy the one
  // next to it, so the copies meet without a seam.
  const p = document.createElement('canvas'); p.width = W; p.height = H;
  const pc = p.getContext('2d');
  pc.drawImage(src, 0, 0);
  pc.clearRect(MX - 1, 0, 1, H); pc.drawImage(src, MX - 2, 0, 1, H, MX - 1, 0, 1, H);
  if (mode === 'quad') { pc.clearRect(0, MY - 1, W, 1); pc.drawImage(p, 0, MY - 2, W, 1, 0, MY - 1, W, 1); }
  c = document.createElement('canvas'); c.width = W; c.height = H; c.ppc = src.ppc;
  const x = c.getContext('2d');
  // Each copy is turned about a pixel corner, so its pixels land exactly on pixels,
  // and each pixel comes from exactly one copy (no overlap, so no bright line).
  const piece = (turn, mirror, l, t, r, b) => {
    x.save(); x.beginPath(); x.rect(l, t, r - l, b - t); x.clip();
    x.translate(MX, MY); if (mirror) x.scale(-1, 1); x.rotate(turn); x.translate(-MX, -MY);
    x.drawImage(p, 0, 0); x.restore();
  };
  if (mode === 'quad') {
    piece(0, false, 0, 0, MX, MY); piece(Math.PI / 2, false, MX, 0, W, MY);
    piece(Math.PI, false, MX, MY, W, H); piece(-Math.PI / 2, false, 0, MY, MX, H);
  } else {
    piece(0, false, 0, 0, MX, H);
    piece(mode === 'mirror' ? 0 : Math.PI, mode === 'mirror', MX, 0, W, H);
  }
  SPR.cache.set(key, c);
  return c;
}
// A colored copy of a sprite: white parts become the color, black stays black
// (that is how Geometry Dash colors objects). Kept for reuse; colors that are
// fading are rounded a little so a fade does not make thousands of copies.
const TINTS = new Map();
function sprTint(name, col) {
  if (!useSheets()) return null;
  let r = col.r, g = col.g, b = col.b;
  if (col.fading) { r = Math.min(255, Math.round(r / 4) * 4); g = Math.min(255, Math.round(g / 4) * 4); b = Math.min(255, Math.round(b / 4) * 4); }
  else { r = Math.round(r); g = Math.round(g); b = Math.round(b); }
  if (r === 255 && g === 255 && b === 255) return sprCanvas(name);
  const key = name + '|' + r + ',' + g + ',' + b;
  let c = TINTS.get(key);
  if (c !== undefined) return c;
  const src = sprCanvas(name);
  if (!src) return null;
  c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.ppc = src.ppc;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
  if (TINTS.size > 1500) { let n = 0; for (const k of TINTS.keys()) { TINTS.delete(k); if (++n >= 500) break; } }
  TINTS.set(key, c);
  return c;
}
// Draws a sprite centered on (cx, cy). scale 1 = its real Geometry Dash size.
// opt.color = a channel color {r, g, b, a, blend} to tint it with.
function drawSpr(ctx, name, cx, cy, opt = {}) {
  const col = opt.color;
  const c = col ? sprTint(name, col) : sprCanvas(name);
  if (!c) return false;
  const g = gridSize, k = (opt.scale || 1) * g / c.ppc;
  let w = c.width * k, h = c.height * k;
  if (opt.fitH) { const s = opt.fitH / h; w *= s; h *= s; }
  if (opt.fit) { const s = Math.min(opt.fit[0] / w, opt.fit[1] / h); w *= s; h *= s; }
  let a = opt.alpha == null ? 1 : opt.alpha;
  if (col) a *= col.a;
  if (a <= 0.004) return true;
  ctx.save();
  ctx.translate(cx, cy);
  if (opt.rot) ctx.rotate(opt.rot);
  if (opt.flipX || opt.flipY) ctx.scale(opt.flipX ? -1 : 1, opt.flipY ? -1 : 1);
  if (a !== 1) ctx.globalAlpha *= a;
  if (col && col.blend) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
// Draws a sprite that belongs to a grid square: (u, v) is the sprite's center
// in the square (0..1 from the bottom-left), turned with the object's angle.
function drawSprInCell(ctx, name, o, u, v, opt = {}) {
  const g = gridSize, c = [o.x + 0.5 * g, o.y - 0.5 * g];
  const [px, py] = rotatePoint([o.x + u * g, o.y - v * g], c, o.angle || 0);
  return drawSpr(ctx, name, px, py, { ...opt, rot: -(o.angle || 0) });
}
// A picture plus its colour layers: "_color" takes the detail color and "_color2"
// a darker shade of it. join / detJoin put stored pieces together (see sprJoined),
// under = the colour layers go below the main picture (fills inside outlines).
const WHITE_COL = { r: 255, g: 255, b: 255, a: 1, blend: false, fading: false };
const shade = (c, k) => ({ ...(c || WHITE_COL), r: (c || WHITE_COL).r * k, g: (c || WHITE_COL).g * k, b: (c || WHITE_COL).b * k });
function drawLayered(ctx, spr, cx, cy, opt, cols, join = '', detJoin = '', under = false) {
  const main = spr + (join ? '|' + join : '');
  if (!sprCanvas(main)) return false;
  const c1 = spr.replace(/_001$/, '_color_001'), c2 = spr.replace(/_001$/, '_color2_001');
  const det = cols.det || cols.main;
  const layers = () => {
    if (sprFrame(c1)) drawSpr(ctx, c1 + (detJoin ? '|' + detJoin : ''), cx, cy, { ...opt, color: det });
    if (sprFrame(c2)) drawSpr(ctx, c2, cx, cy, { ...opt, color: shade(det, 0.7) });
  };
  if (under) layers();
  drawSpr(ctx, main, cx, cy, { ...opt, color: cols.main });
  if (!under) layers();
  return true;
}

const gradCache = new WeakMap();
function vGrad(ctx, top, bottom, c1, c2) {
  let m = gradCache.get(ctx);
  if (!m) { m = new Map(); gradCache.set(ctx, m); }
  const k = top + '|' + bottom + '|' + c1 + '|' + c2;
  let gr = m.get(k);
  if (!gr) {
    if (m.size > 3000) m.clear();
    gr = ctx.createLinearGradient(0, top, 0, bottom);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    m.set(k, gr);
  }
  return gr;
}

// The background takes the BG color (a little darker at the top), the floor and
// ceiling take the GROUND color and their edge line the LINE color.
const rgbCss = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
function drawSky(ctx, w, h, bg = CH_DEFAULT[CH.BG]) {
  const d = CH_DEFAULT[CH.BG], plain = bg.every((v, i) => Math.round(v) === d[i]);
  ctx.fillStyle = plain ? vGrad(ctx, 0, h, '#5784dd', '#6f9df2') : vGrad(ctx, 0, h, rgbCss(bg, 0.86), rgbCss(bg));
  ctx.fillRect(0, 0, w, h);
}

function drawStage(ctx, x0, x1, yTop, yBot, ground = CH_DEFAULT[CH.GROUND], line = [255, 255, 255]) {
  ctx.fillStyle = rgbCss(ground);
  ctx.fillRect(x0, yTop, x1 - x0, 100 - yTop);
  ctx.fillRect(x0, 300, x1 - x0, yBot - 300);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 80) * 80; x <= x1; x += 80) {
    ctx.moveTo(x, 300); ctx.lineTo(x, yBot);
    ctx.moveTo(x, yTop); ctx.lineTo(x, 100);
  }
  ctx.stroke();
  const gr = ctx.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.5, rgbCss(line)); gr.addColorStop(1, '#000');
  ctx.strokeStyle = gr; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, 100); ctx.lineTo(x1, 100); ctx.moveTo(x0, 300); ctx.lineTo(x1, 300); ctx.stroke();
}

function tracePoly(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function ring(ctx, cx, cy, rx, ry, color) {
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx - 2.5, ry - 2.5, 0, 0, Math.PI * 2); ctx.stroke();
}

function chevron(ctx, x, y, a, b, color, dir) {
  ctx.beginPath(); ctx.moveTo(x - a * dir, y - b); ctx.lineTo(x + a * dir, y); ctx.lineTo(x - a * dir, y + b);
  ctx.lineJoin = 'miter'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
}

function imageCentered(ctx, im, cx, cy, w, h) { ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h); }

// Where the ship is, for fading spikes (null in the editor: always shown)
let fadeShipX = null;
const FADE_NEAR = 2, FADE_FAR = 6;          // in squares: gone when closer than 2, full from 6
function fadeAlpha(o) {
  if (fadeShipX == null) return 1;
  const d = Math.abs(o.cx - fadeShipX) / gridSize;
  return Math.max(0, Math.min(1, (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
}
// Sprite and its center inside the square for each spike shape
const SPIKE_SPR = {
  Spike: ['spike_01_001', 0.5, 0.5], ShortSpike: ['spike_02_001', 0.5, 0.225],
  SmallSpike: ['spike_03_001', 0.5, 0.317], TinySpike: ['spike_04_001', 0.25, 0.2],
};
const PORTAL_SPR = { gravity_1: 'portal_01', 'gravity_-1': 'portal_02', size_big: 'portal_08', size_mini: 'portal_09', teleIn: 'portal_15', teleOut: 'portal_16' };
const BOOST_SPR = { half: 'boost_01_001', normal: 'boost_02_001', double: 'boost_03_001', triple: 'boost_04_001', quad: 'boost_05_001' };
// A portal from the sheets: the back half (pass 'back'), the front half
// (pass 'front', drawn over the ship), or both.
function drawPortalSpr(ctx, key, cx, cy, h, pass) {
  const base = PORTAL_SPR[key];
  if (!base || !sprCanvas(base + '_back_001')) return false;
  if (pass !== 'front') drawSpr(ctx, base + '_back_001', cx, cy, { fitH: h });
  if (pass !== 'back') drawSpr(ctx, base + '_front_001', cx, cy, { fitH: h });
  return true;
}

// What the drawing code needs to know about colors right now: the color state
// of each level part (or one for the editor), the time for fades, and whether
// this is the game (triggers hidden, coins spin) or the editor.
const DEFAULT_COLORS = new ColorState({});
const DRAW = { parts: null, cs: DEFAULT_COLORS, now: 0, play: false, coinTime: 0 };
function colorsOf(o) { return (DRAW.parts && DRAW.parts[o.part] && DRAW.parts[o.part].colors) || DRAW.cs; }
// The colors one object is drawn with right now
function objColors(o) {
  const cs = colorsOf(o), now = DRAW.now;
  let alpha = 1;
  for (const gid of o.groups || []) alpha *= cs.groupAlpha(gid, now);
  return { main: o.ch ? cs.resolve(o.ch, now) : null, det: o.dch ? cs.resolve(o.dch, now) : null, alpha };
}
const cssOf = c => c ? `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})` : '#fff';

// Coins: saved per level in this browser once you finish their level
const COIN_KEY = 'shiprun.coins.v1';
let coinStore = (() => { try { const d = JSON.parse(localStorage.getItem(COIN_KEY) || '{}'); return isOpts(d) ? d : {}; } catch (e) { return {}; } })();
function coinSaved(levelId, key) { return !!(coinStore[levelId] && coinStore[levelId].includes(key)); }
function saveCoin(levelId, key) {
  if (coinSaved(levelId, key)) return false;
  (coinStore[levelId] = coinStore[levelId] || []).push(key);
  try { localStorage.setItem(COIN_KEY, JSON.stringify(coinStore)); } catch (e) { /* ignore */ }
  return true;
}
const COIN_FRAMES = [1, 2, 3, 4, 3, 2];      // the silver coin turning around

function drawObject(ctx, o, pass) {
  if (pass === 'front' && o.kind !== 'portal') return;
  if (o.sub) return;
  const cols = objColors(o);
  if (cols.alpha <= 0.004) return;
  if (cols.alpha < 1) { ctx.save(); ctx.globalAlpha *= cols.alpha; drawObjectArt(ctx, o, pass, cols); ctx.restore(); }
  else drawObjectArt(ctx, o, pass, cols);
}

function drawObjectArt(ctx, o, pass, cols) {
  const g = gridSize, main = cols.main;
  switch (o.t) {
    case 'Block': {
      if (drawSprInCell(ctx, 'square_01_001', o, 0.5, 0.5, { color: main })) break;
      ctx.fillStyle = vGrad(ctx, o.y - g, o.y, '#000000', COLORS.sky);
      ctx.fillRect(o.x, o.y - g, g, g);
      ctx.strokeStyle = cssOf(main); ctx.lineWidth = 1;
      ctx.strokeRect(o.x, o.y - g, g, g);
      break;
    }
    case 'GridBlock': {
      if (IMG.gridBlock) { ctx.drawImage(IMG.gridBlock, o.x, o.y - g, g, g); break; }
      if (drawSprInCell(ctx, 'square_05_001', o, 0.5, 0.5)) break;
      ctx.fillStyle = '#04061a'; ctx.fillRect(o.x, o.y - g, g, g);
      ctx.strokeStyle = 'rgba(120,150,255,0.22)'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(o.x + g / 2, o.y - g); ctx.lineTo(o.x + g / 2, o.y);
      ctx.moveTo(o.x, o.y - g / 2); ctx.lineTo(o.x + g, o.y - g / 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,150,255,0.35)'; ctx.strokeRect(o.x + 0.5, o.y - g + 0.5, g - 1, g - 1);
      break;
    }
    case 'OutlineBlock': {
      const P = OUTLINE_PIECES[o.piece], a = o.fade ? fadeAlpha(o) : 1;
      if (a <= 0.01) break;
      if (drawSprInCell(ctx, P[0], o, 0.5, P[1], { flipX: o.flip, color: main, alpha: a })) break;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = ctx.strokeStyle = cssOf(main);
      if (o.piece === 1) { ctx.lineWidth = 1.2; ctx.strokeRect(o.x + 0.6, o.y - g + 0.6, g - 1.2, g - 1.2); }
      else for (const part of o.parts) { const b = part.box; ctx.fillRect(b.l, b.t, Math.max(1, b.r - b.l), Math.max(1, b.b - b.t)); }
      ctx.restore();
      break;
    }
    case 'InvisibleBlock': {
      const a = fadeAlpha(o);
      if (a <= 0.01) break;
      if (drawSprInCell(ctx, 'invis_square_01_001', o, 0.5, 0.5, { color: main, alpha: a })) break;
      ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = cssOf(main); ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]); ctx.strokeRect(o.x + 0.6, o.y - g + 0.6, g - 1.2, g - 1.2); ctx.restore();
      break;
    }
    case 'FadeSpike': case 'FadeShortSpike': case 'FadeSmallSpike': case 'FadeTinySpike': {
      const a = fadeAlpha(o);
      if (a <= 0.01) break;
      const [spr, u, v] = SPIKE_SPR[o.shape];
      if (drawSprInCell(ctx, 'invis_' + spr, o, u, v, { alpha: a, color: main })) break;
      ctx.save(); ctx.globalAlpha *= a;
      tracePoly(ctx, o.pts); ctx.strokeStyle = cssOf(main); ctx.lineWidth = 1.2; ctx.lineJoin = 'miter'; ctx.stroke();
      ctx.restore();
      break;
    }
    case 'Spike': case 'ShortSpike': case 'SmallSpike': case 'TinySpike': {
      const look = o.design && SPIKE_LOOKS[o.design];
      const [spr0, u, v0] = SPIKE_SPR[o.t];
      if (look) {
        const ctr = rotatePoint([o.x + u * g, o.y - look[2] * g], [o.x + 0.5 * g, o.y - 0.5 * g], o.angle);
        if (drawLayered(ctx, o.design + '_001', ctr[0], ctr[1], { rot: -o.angle }, cols, '', '', true)) break;
      } else if (drawSprInCell(ctx, spr0, o, u, v0, { color: main })) break;
      const ys = o.pts.map(p => p[1]);
      ctx.fillStyle = vGrad(ctx, Math.min(...ys), Math.max(...ys), '#000000', COLORS.sky);
      tracePoly(ctx, o.pts); ctx.fill();
      ctx.strokeStyle = cssOf(main); ctx.lineWidth = 1; ctx.lineJoin = 'miter'; ctx.stroke();
      break;
    }
    case 'ThornPit': {
      const w = g, h = 105 / 120 * g;
      if (drawSpr(ctx, (o.design || 'pit_01') + '_001', o.imgX, o.imgY, { rot: rad(o.rotDeg), color: main })) break;
      ctx.save(); ctx.translate(o.imgX, o.imgY); ctx.rotate(rad(o.rotDeg));
      if (IMG.thornPit) ctx.drawImage(IMG.thornPit, -w / 2, -h / 2, w, h);
      else {
        const P = [[-0.5, 0.5], [-0.4, -0.08], [-0.27, 0.2], [-0.1, -0.5], [0.06, 0.15], [0.2, -0.28], [0.33, 0.2], [0.44, -0.04], [0.5, 0.5]];
        tracePoly(ctx, P.map(([u, v]) => [u * w, v * h]));
        ctx.fillStyle = '#05060f'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'Saw': {
      const L = sawLook(o), spr = (o.design || 'sawblade_01') + '_001', rot = rad(o.spin);
      if (sprCanvas(spr + (L.join ? '|' + L.join : ''))) {
        // a soft white edge, so black saws show up on dark backgrounds (like Geometry Dash's glow)
        if (L.halo) drawSpr(ctx, spr + (L.join ? '|' + L.join : ''), o.cx, o.cy, { scale: o.size * 1.06, rot, alpha: 0.45 * (main ? main.a : 1) });
        drawLayered(ctx, spr, o.cx, o.cy, { scale: o.size, rot }, cols, L.join || '', L.det || '', !!L.under);
        break;
      }
      ctx.save(); ctx.translate(o.cx, o.cy); ctx.rotate(rot);
      const k = o.size * L.r;
      if (IMG.saw) { const s = 3 * k * g; ctx.drawImage(IMG.saw, -s / 2, -s / 2, s, s); }
      else {
        const R = 1.4 * k * g, r = 1.12 * k * g, N = 14;
        ctx.beginPath();
        for (let i = 0; i < N * 2; i++) {
          const a = i * Math.PI / N, rr = i % 2 ? r : R;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fillStyle = '#151827'; ctx.fill();
        ctx.strokeStyle = '#e9edff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#2b3152'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fillStyle = '#e9edff'; ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'SpeedPortal': {
      if (pass === 'front') break;
      if (BOOST_SPR[o.status] && drawSpr(ctx, BOOST_SPR[o.status], o.cx, o.cy, { fit: [o.w, o.h] })) break;
      const im = IMG['speed_' + o.status];
      if (im) { imageCentered(ctx, im, o.cx, o.cy, o.w, o.h); break; }
      const n = { half: 1, normal: 1, double: 2, triple: 3, quad: 4 }[o.status] || 1;
      const dir = o.status === 'half' ? -1 : 1;
      const color = COLORS.speed[o.status] || '#fff';
      const a = Math.min(o.w / (n * 2.6), 6), b = o.h * 0.3, step = a * 2.2;
      for (let i = 0; i < n; i++) chevron(ctx, o.cx + (i - (n - 1) / 2) * step, o.cy, a, b, color, dir);
      break;
    }
    case 'GravityPortal': {
      if (drawPortalSpr(ctx, 'gravity_' + o.status, o.cx, o.cy, o.h, pass)) break;
      if (pass === 'front') break;
      const im = IMG['gravity_' + o.status];
      if (im) { imageCentered(ctx, im, o.cx, o.cy, o.w, o.h); break; }
      const color = COLORS.gravity[String(o.status)] || '#fff';
      ring(ctx, o.cx, o.cy, o.w * 0.28, o.h * 0.47, color);
      const d = o.status === -1 ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(o.cx - 4, o.cy - 3 * d); ctx.lineTo(o.cx, o.cy + 3 * d); ctx.lineTo(o.cx + 4, o.cy - 3 * d);
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      break;
    }
    case 'SizePortal': {
      if (drawPortalSpr(ctx, 'size_' + o.status, o.cx, o.cy, o.h, pass)) break;
      if (pass === 'front') break;
      const im = IMG['size_' + o.status];
      if (im) { imageCentered(ctx, im, o.cx, o.cy, o.w, o.h); break; }
      const color = COLORS.size[o.status] || '#fff';
      ring(ctx, o.cx, o.cy, o.w * 0.28, o.h * 0.47, color);
      const s = o.status === 'mini' ? 2.5 : 4.5;
      ctx.beginPath(); ctx.moveTo(o.cx, o.cy - s); ctx.lineTo(o.cx + s, o.cy); ctx.lineTo(o.cx, o.cy + s); ctx.lineTo(o.cx - s, o.cy); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      break;
    }
    case 'TelePortal': {
      if (drawPortalSpr(ctx, 'teleIn', o.cx, o.cy1, o.h, pass)) { drawPortalSpr(ctx, 'teleOut', o.cx, o.cy2, o.h, pass); break; }
      if (pass === 'front') break;
      if (IMG.teleportIn) imageCentered(ctx, IMG.teleportIn, o.cx, o.cy1, o.w, o.h);
      else ring(ctx, o.cx, o.cy1, o.w * 0.26, o.h * 0.46, COLORS.teleIn);
      if (IMG.teleportOut) imageCentered(ctx, IMG.teleportOut, o.cx, o.cy2, o.w, o.h);
      else ring(ctx, o.cx, o.cy2, o.w * 0.26, o.h * 0.46, COLORS.teleOut);
      break;
    }
    case 'Pad': {
      if (drawSpr(ctx, 'bump_01_001', o.x + g / 2, o.y - 4 / 60 * g)) break;
      if (IMG.pad) { ctx.drawImage(IMG.pad, o.x, o.y - PAD_H * g, g, PAD_H * g); break; }
      ctx.beginPath(); ctx.ellipse(o.x + g / 2, o.y, g * 0.44, g * 0.24, 0, Math.PI, 0);
      ctx.closePath(); ctx.fillStyle = '#ffe13d'; ctx.fill();
      ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1; ctx.stroke();
      break;
    }
    case 'Orb': {
      if (drawSpr(ctx, 'ring_01_001', o.x + g / 2, o.y - g / 2)) break;
      if (IMG.orb) { ctx.drawImage(IMG.orb, o.x, o.y - g, g, g); break; }
      const cx = o.x + g / 2, cy = o.y - g / 2;
      ctx.beginPath(); ctx.arc(cx, cy, g * 0.44, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,225,61,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, g * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#ffe13d'; ctx.fill();
      ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, g * 0.14, 0, Math.PI * 2); ctx.fillStyle = '#fff6c4'; ctx.fill();
      break;
    }
    case 'Coin': {
      // taken this attempt: it flies up and fades. Already saved: a see-through ghost.
      let cy = o.cy, a = 1;
      if (o.got) { const t = DRAW.now - o.gotAt; if (t > 0.6) break; cy -= t * 1.6 * g; a = 1 - t / 0.6; }
      const lvl = DRAW.parts && DRAW.parts[o.part] ? DRAW.parts[o.part].id : null;
      const ghost = !o.got && lvl && coinSaved(lvl, o.key);
      const f = ghost ? 0 : DRAW.play ? Math.floor(DRAW.coinTime * 12) % COIN_FRAMES.length : 0;
      const name = ghost ? 'secretCoin_2_b_01_001' : 'secretCoin_2_01_00' + COIN_FRAMES[f];
      if (drawSpr(ctx, name, o.cx, cy, { alpha: a * (ghost ? 0.7 : 1), flipX: f >= 4 })) break;
      ctx.save(); ctx.globalAlpha *= a * (ghost ? 0.45 : 1);
      ctx.beginPath(); ctx.arc(o.cx, cy, g * 0.55, 0, Math.PI * 2); ctx.fillStyle = '#d9dde6'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.font = 'bold ' + (g * 0.6) + 'px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#6c7280';
      ctx.fillText('C', o.cx, cy + 0.5);
      ctx.restore();
      break;
    }
    case 'ColorTrigger': case 'AlphaTrigger': {
      if (DRAW.play) break;                       // triggers are invisible while playing
      const color = o.t === 'ColorTrigger';
      const icon = color ? 'edit_eTintCol01Btn_001' : 'edit_eAlphaBtn_001';
      if (!drawSpr(ctx, icon, o.cx, o.cy - g * 0.06, { fit: [g * 0.9, g * 0.82] })) {
        ctx.fillStyle = color ? '#3b3b3b' : '#20343f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
        ctx.fillRect(o.x + 2, o.y - g + 2, g - 4, g - 4); ctx.strokeRect(o.x + 2, o.y - g + 2, g - 4, g - 4);
        ctx.font = 'bold 5px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.fillText(color ? 'COL' : 'ALPHA', o.cx, o.cy - 3);
      }
      // what it changes: its channel (with a dot of the new color) or its group
      const label = color ? chLabel(o.target) : 'G' + (o.group || '?');
      ctx.font = 'bold 6px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(label, o.cx, o.y - 3.2);
      ctx.fillStyle = o.touch ? '#9dff5c' : o.spawn ? '#ff9c5c' : '#fff'; ctx.fillText(label, o.cx, o.y - 3.2);
      if (color) {
        ctx.beginPath(); ctx.arc(o.x + g - 3.2, o.y - g + 3.2, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = rgbToHex(o.spec.player ? PLAYER_RGB[o.spec.player] : o.spec.rgb); ctx.fill();
        ctx.lineWidth = 0.7; ctx.strokeStyle = '#000'; ctx.stroke();
      }
      break;
    }
    case 'Deco': case 'Slope': {
      const a = o.fade ? fadeAlpha(o) : 1;
      if (a <= 0.01) break;
      if (drawLayered(ctx, o.spr, o.px, o.py, { rot: -o.angle, flipX: o.flip, alpha: a }, cols)) break;
      // sheets not loaded (or "My pictures" chosen): a faint placeholder the size of the art
      ctx.save(); ctx.translate(o.px, o.py); ctx.rotate(-o.angle); ctx.globalAlpha *= a;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.6;
      ctx.fillRect(-o.sw / 2, -o.sh / 2, o.sw, o.sh); ctx.strokeRect(-o.sw / 2, -o.sh / 2, o.sw, o.sh);
      ctx.restore();
      break;
    }
  }
}

function drawObjects(ctx, list, pass) {
  const sorted = list.slice().sort((a, b) => a.layer - b.layer || a.idx - b.idx);
  for (const o of sorted) drawObject(ctx, o, pass);
}
// Portal fronts go over the ship, like in Geometry Dash
function drawPortalFronts(ctx, list) {
  if (!useSheets()) return;
  for (const o of list) if (o.kind === 'portal') drawObject(ctx, o, 'front');
}

// The ship and the cube, placed exactly like your render()
function drawPlayer(ctx, worldX, y, theta, s, grav, holding) {
  const hbSize = gridSize * s;
  const hbCY = (screenHeight - y) - hbSize / 2;
  const flip = grav === -1;

  // cube (drawn first, the ship goes on top)
  const dx = 0, dy = -10 * s * grav;
  const rX = dx * Math.cos(theta) - dy * Math.sin(theta);
  const rY = -dx * Math.sin(theta) + dy * Math.cos(theta);
  ctx.save();
  ctx.translate(worldX + rX, hbCY + rY + 5 * s * grav);
  ctx.rotate(theta);
  const cubeImg = flip ? (IMG.cubeFlipped || IMG.cube) : IMG.cube;
  if (flip && !IMG.cubeFlipped) ctx.scale(1, -1);
  if (cubeImg) ctx.drawImage(cubeImg, -110 * scale * s / 2, -60 * scale * s / 2, 110 * scale * s, 60 * scale * s);
  else {
    const c = 12 * s;
    ctx.fillStyle = COLORS.shipMain; ctx.fillRect(-c / 2, -c / 2, c, c);
    ctx.fillStyle = COLORS.shipTrim; ctx.fillRect(-c / 4, -c / 4, c / 2, c / 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.strokeRect(-c / 2, -c / 2, c, c);
  }
  ctx.restore();

  // ship
  ctx.save();
  ctx.translate(worldX, hbCY + 5 * s * grav);
  ctx.rotate(theta);
  const shipImg = flip ? (IMG.shipFlipped || IMG.ship) : IMG.ship;
  if (flip && !IMG.shipFlipped) ctx.scale(1, -1);
  if (shipImg) ctx.drawImage(shipImg, -75 * 0.5 * s / 2, -40 * 0.5 * s / 2, 75 * 0.5 * s, 40 * 0.5 * s);
  else {
    ctx.scale(s, s);
    if (holding) {
      ctx.beginPath(); ctx.moveTo(-18, 1.5); ctx.lineTo(-27 - Math.random() * 3, 5); ctx.lineTo(-18, 8.5); ctx.closePath();
      ctx.fillStyle = '#ffb02e'; ctx.fill();
    }
    tracePoly(ctx, [[-18.75, 1.5], [-13, -3.5], [4, -3.5], [18.75, 3], [12, 10], [-16.5, 10]]);
    ctx.fillStyle = COLORS.shipMain; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
    tracePoly(ctx, [[-16.5, 3.8], [13.5, 3.8], [11.5, 6.6], [-16.5, 6.6]]);
    ctx.fillStyle = COLORS.shipTrim; ctx.fill();
  }
  ctx.restore();
}

function strokeShape(ctx, shape, color) {
  ctx.strokeStyle = color;
  if (shape.circle) { ctx.beginPath(); ctx.arc(shape.circle.cx, shape.circle.cy, shape.circle.r, 0, Math.PI * 2); ctx.stroke(); }
  else { tracePoly(ctx, shape.poly); ctx.stroke(); }
}

function drawHitboxes(ctx, list, player) {
  ctx.lineWidth = 1;
  for (const o of list) {
    if (!o.hit || o.sub) continue;
    const color = o.kind === 'hazard' ? '#ff2b2b' : o.kind === 'solid' ? '#1238ff' : o.kind === 'trigger' ? 'rgba(255,255,255,0.5)' : o.kind === 'coin' ? '#ffd21f' : '#14d24a';
    if (o.parts) for (const p of o.parts) strokeShape(ctx, { poly: p.poly }, color);
    else strokeShape(ctx, o.hit, color);
    if (o.exitPoly) strokeShape(ctx, { poly: o.exitPoly }, color);
  }
  if (player) {
    const { worldX, y, sizeScale, rot } = player;
    const s = gridSize * sizeScale, bottom = screenHeight - y;
    ctx.lineWidth = 2;
    strokeShape(ctx, { poly: boxPoly(worldX - s / 2, bottom - s, worldX + s / 2, bottom) }, '#ff0000');
    strokeShape(ctx, { poly: rotatedRect(worldX, rot.cy, rot.w, rot.w, rot.angle) }, '#8b0000');
    const h = gridSize * 0.3 / 2, cy = bottom - s / 2;
    strokeShape(ctx, { poly: boxPoly(worldX - h, cy - h, worldX + h, cy + h) }, '#0000ff');
  }
}

function sizeCanvas(cv, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return dpr;
}


// ===== 8. PLAYING ==========================================================
// mode 'run'      = random run of LEVELS_PER_RUN levels, crashing reshuffles
// mode 'practice' = one level, crashing restarts it
// mode 'test'     = one level from the editor, Esc goes back to the editor

const $ = id => document.getElementById(id);

// --- the Pusab font (used for text drawn on the canvas, like "Attempt 3") ---
let gdFont = false, fontWarned = false;
function loadGdFont() {
  if (!document.fonts || !document.fonts.load) { afterFont(); return; }
  document.fonts.load('40px "Pusab"')
    .then(faces => { gdFont = faces.some(f => f.status === 'loaded'); })
    .catch(() => { gdFont = false; })
    .finally(afterFont);
}
function canvasFont(px) { return gdFont ? px + 'px "Pusab"' : 'bold ' + px + 'px Arial, sans-serif'; }
function outlinedText(ctx, text, x, y, px, lineW, fill = '#fff') {
  ctx.font = canvasFont(px);
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineW;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

const game = {
  mode: null, level: null, pool: null, startScroll: 0, returnTo: 'menu',
  acc: 0, dead: false, deathTimer: 0, finished: false, paused: false, attempts: 0,
  showHitboxes: false, deathHitboxes: false, teleported: false,
  prevScroll: 0, prevY: position, prevTheta: 0, trail: [], lastTrail: null,
  cssScale: 1, dpr: 1, hudKey: '', attemptX: 0,
  time: 0, coinPart: 0, usedNoclip: false, runCoins: 0, stage: null,
};
const gameCanvas = $('game'), gameCtx = gameCanvas.getContext('2d');

function startPlay(mode, opts = {}) {
  game.mode = mode;
  game.pool = opts.pool || null;
  game.level = opts.level || null;
  game.startScroll = opts.startScroll || 0;
  game.returnTo = opts.returnTo || 'menu';
  game.attempts = 0;
  game.lastTrail = null;
  game.paused = false;
  if (mode === 'run') noClip = false;
  upInput = false; pressed = false;
  if (mode !== 'run') world = new World([game.level]);
  showScreen('play');
  restart();
}

function restart() {
  if (game.mode === 'run') world = new World(shuffle(game.pool.slice()).slice(0, LEVELS_PER_RUN));
  else world.reset();
  scrollX = game.startScroll;
  setSpeed(initialSpeed);
  game.deathHitboxes = false;
  Me.reset();
  game.dead = false; game.finished = false; game.paused = false; game.acc = 0;
  game.attempts++;
  game.attemptX = scrollX + shipCenterX + 150;
  game.trail = [];
  game.prevScroll = scrollX; game.prevY = Me.y; game.prevTheta = Me.theta;
  game.time = 0; game.coinPart = world.partAt(shipCenterX + scrollX); game.usedNoclip = noClip; game.runCoins = 0; game.stage = null;
  // Testing from the middle: triggers behind the ship have already happened (no fade)
  const sx0 = shipCenterX + scrollX, xt = world.xTriggers;
  while (world.nextTrigger < xt.length && xt[world.nextTrigger].tx < sx0) fireTrigger(xt[world.nextTrigger++], 0, true);
  hideOverlay();
  updateHud(true);
}

// --- color triggers, alpha triggers and coins (they never change how the ship moves) ---
function fireTrigger(o, now, instant) {
  o.fired = true;
  const cs = world.parts[o.part].colors, fade = instant ? 0 : o.fadeTime;
  if (o.t === 'ColorTrigger') cs.set(o.target, o.spec, now, fade);
  else if (o.group) cs.setGroup(o.group, o.opacity, now, fade);
}
function playSpecials() {
  const sx = shipCenterX + scrollX, now = game.time, xt = world.xTriggers;
  while (world.nextTrigger < xt.length && xt[world.nextTrigger].tx <= sx) fireTrigger(xt[world.nextTrigger++], now);
  if (noClip) game.usedNoclip = true;
  if (Me.alive) {
    const poly = Me.hitPoly(sx);
    for (const o of world.near(sx)) {
      if (o.kind === 'trigger' && o.touch && !o.spawn && !o.fired && hitsShape(poly, o.hit)) fireTrigger(o, now);
      else if (o.kind === 'coin' && !o.got && hitsShape(poly, o.hit)) { o.got = true; o.gotAt = now; game.runCoins++; }
    }
  }
  // a coin counts once the ship gets past the end of its level alive
  const pi = world.partAt(sx);
  while (game.coinPart < pi) keepCoins(game.coinPart++);
}
function keepCoins(pi) {
  if (game.mode === 'test' || game.usedNoclip) return;
  const part = world.parts[pi];
  if (!part) return;
  for (const o of world.coins) if (o.part === pi && o.got) saveCoin(part.id, o.key);
}

// One CMU onStep
function step() {
  game.prevScroll = scrollX; game.prevY = Me.y; game.prevTheta = Me.theta;
  game.teleported = false;
  if (!Me.alive) return;
  Me.Update();
  pressed = false;
  Me.render();
  for (const saw of world.saws) saw.spin += sawSpin * 360 * dt;
  if (game.mode === 'test' && game.trail.length < 30000) game.trail.push([shipCenterX + scrollX, Me.hb.bottom - Me.hb.size / 2]);
  playSpecials();
  Move(currentSpeed);
  game.time += dt;
  if (!Me.alive) onDeath();
  else if (shipCenterX + scrollX >= world.endPx) onFinish();
}

function onDeath() {
  game.dead = true;
  game.deathHitboxes = true;          // setHitboxes(True)
  game.deathTimer = 0.5 + dt;         // sleep(0.5) on the next step, then restart()
  if (game.mode === 'test') game.lastTrail = { pts: game.trail, died: true };
}

function onFinish() {
  game.finished = true;
  upInput = false;
  while (game.coinPart < world.parts.length) keepCoins(game.coinPart++);
  if (game.mode === 'test') {
    game.lastTrail = { pts: game.trail, died: false };
    leavePlay('Reached the end of the level.');
    return;
  }
  showComplete();
}

function leavePlay(message) {
  upInput = false;
  game.paused = false;
  hideOverlay();
  if (game.mode === 'test') {
    if (!game.dead && game.trail.length > 5) game.lastTrail = { pts: game.trail, died: false };
    ed.trail = game.lastTrail;
    showScreen('editor');
    if (message) toast(message);
  } else showScreen(game.returnTo || 'menu');
}

function startRun() {
  const pool = randomizerPool();
  if (!pool.length) { toast('No levels are in random runs yet. Turn it on in the level editor.'); return; }
  startPlay('run', { pool, returnTo: 'menu' });
}

function pauseGame() {
  if (game.mode === 'test') { leavePlay(); return; }
  if (game.finished || game.dead || game.paused) return;
  game.paused = true;
  upInput = false;
  showPauseMenu();
}
function resumeGame() {
  game.paused = false;
  game.acc = 0;
  hideOverlay();
}

// --- pause menu and end screen ---
function roundBtn(act, color, icon, label) {
  return `<div class="round-wrap"><button class="round ${color}" data-act="${act}" aria-label="${label}"><svg aria-hidden="true"><use href="#${icon}"/></svg></button><span class="round-cap">${label}</span></div>`;
}
function showOverlay(html) {
  const ov = $('overlay');
  ov.innerHTML = html;
  ov.hidden = false;
  fitText(ov);
}
function hideOverlay() {
  const ov = $('overlay');
  ov.hidden = true;
  ov.innerHTML = '';
}
function showPauseMenu() {
  const pct = currentPct();
  const title = game.mode === 'run' ? runLabel() : game.level.name;
  showOverlay(`<div class="pause-card gd-dark">
      <span class="pause-title o" data-fit>${esc(title)}</span>
      <div class="pause-bar"><div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div><span class="o">${pct}%</span></div>
      <div class="round-row">
        ${roundBtn('resume', 'green', 'i-tri', 'RESUME')}
        ${roundBtn('restart', 'green', 'i-restart', game.mode === 'run' ? 'NEW RUN' : 'RESTART')}
        ${roundBtn('quit', 'green', 'i-menu', game.mode === 'run' ? 'MENU' : 'BACK')}
      </div>
    </div>`);
}
// The coins you got this time: one dot per coin in the level (a run just counts them)
function coinLine() {
  if (!world.coins.length) return '';
  if (game.mode === 'run') return `<span class="done-line o">COINS: ${game.runCoins} OF ${world.coins.length}</span>`;
  const dots = world.coins.slice().sort((a, b) => a.X - b.X).map(o => `<i class="coin-dot${o.got ? ' got' : ''}"></i>`).join('');
  return `<span class="done-line o coin-line">COINS: ${dots}</span>${game.usedNoclip ? '<span class="done-line o small">NOCLIP WAS ON, SO COINS WERE NOT SAVED</span>' : ''}`;
}
function showComplete() {
  const run = game.mode === 'run';
  showOverlay(`<span class="done-title gold" data-fit>${run ? 'RUN COMPLETE!' : 'LEVEL COMPLETE!'}</span>
    <div class="done-card gd-dark">
      <span class="done-line o">${run ? world.parts.length + ' RANDOM LEVELS' : esc(game.level.name)}</span>
      <span class="done-line o">ATTEMPTS: ${game.attempts}</span>
      ${coinLine()}
      <div class="round-row">
        ${roundBtn('again', 'green', 'i-restart', run ? 'NEW RUN' : 'AGAIN')}
        ${roundBtn('quit', 'green', 'i-menu', run ? 'MENU' : 'BACK')}
      </div>
    </div>`);
}
$('overlay').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'resume') resumeGame();
  else if (act === 'restart') restart();
  else if (act === 'again') { if (game.mode === 'run') startRun(); else { game.attempts = 0; restart(); } }
  else if (act === 'quit') leavePlay();
});

function fitGameCanvas() {
  const stage = $('stage');
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const s = Math.min(W / VIEW_WIDTH, H / 400);
  const cw = Math.floor(VIEW_WIDTH * s), ch = Math.floor(400 * s);
  game.cssScale = s;
  game.dpr = sizeCanvas(gameCanvas, cw, ch);
  const fr = $('frame');
  fr.style.width = cw + 'px';
  fr.style.height = ch + 'px';
  fr.style.setProperty('--u', s + 'px');
  fitText(fr);
}

function drawGame() {
  const ctx = gameCtx, k = game.cssScale * game.dpr;
  const frozen = game.dead || game.finished || game.paused;
  const a = frozen ? 1 : Math.min(1, game.acc / dt);
  const sI = game.prevScroll + (scrollX - game.prevScroll) * a;
  const jump = game.teleported || Math.abs(Me.y - game.prevY) > 2 * gridSize;
  const yI = jump ? Me.y : game.prevY + (Me.y - game.prevY) * a;
  const thI = game.prevTheta + (Me.theta - game.prevTheta) * a;
  const now = game.time + (frozen ? 0 : Math.min(game.acc, dt));
  DRAW.parts = world.parts; DRAW.now = now; DRAW.play = true; DRAW.coinTime = performance.now() / 1000;
  const st = stageColors(sI, now);

  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawSky(ctx, VIEW_WIDTH, 400, st.bg);
  // The camera only changes where things are drawn. The ship is still at
  // shipCenterX + scrollX in the level, exactly like CMU.
  const camL = sI + shipCenterX - SHIP_SCREEN_X;
  ctx.setTransform(k, 0, 0, k, -camL * k, 0);
  drawStage(ctx, camL, camL + VIEW_WIDTH, 0, 400, st.ground, st.line);
  if (gdFont && settings.showAttempts && game.attemptX > camL - 200) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlinedText(ctx, 'Attempt ' + game.attempts, game.attemptX, 172, 22, 5);
  }
  const vis = world.visible(camL, camL + VIEW_WIDTH);
  const wx = shipCenterX + sI;
  fadeShipX = wx;
  drawObjects(ctx, vis, 'back');
  drawPlayer(ctx, wx, yI, thI, Me.sizeScale, Me.gravity, upInput && Me.alive);
  drawPortalFronts(ctx, vis);
  fadeShipX = null;
  if (game.deathHitboxes || game.showHitboxes) {
    drawHitboxes(ctx, vis, { worldX: wx, y: yI, sizeScale: Me.sizeScale, rot: Me.rot });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  DRAW.parts = null; DRAW.play = false; DRAW.now = 0;
  updateHud(false);
}
// BG, GROUND and LINE come from the level the ship is in. When a run moves on
// to the next level they blend over half a second.
function stageColors(sI, now) {
  const pi = world.partAt(shipCenterX + sI), part = world.parts[pi];
  const cs = part ? part.colors : DEFAULT_COLORS;
  const get = id => { const c = cs.resolve(id, now); return [c.r, c.g, c.b]; };
  const cur = { bg: get(CH.BG), ground: get(CH.GROUND), line: get(CH.LINE) };
  if (!game.stage || game.stage.part !== pi) game.stage = { part: pi, from: game.stage ? game.stage.last : null, t0: now };
  const s = game.stage;
  let out = cur;
  if (s.from && now - s.t0 < 0.5) {
    const k = Math.max(0, (now - s.t0) / 0.5);
    out = {};
    for (const key in cur) out[key] = cur[key].map((v, i) => s.from[key][i] + (v - s.from[key][i]) * k);
  }
  s.last = out;
  return out;
}

function currentPct() {
  const span = Math.max(1, world.endPx - shipCenterX - game.startScroll);
  return Math.max(0, Math.min(100, Math.floor((scrollX - game.startScroll) / span * 100)));
}
function runLabel() {
  const x = shipCenterX + scrollX;
  let i = world.parts.findIndex(p => x < p.endPx);
  if (i < 0) i = world.parts.length - 1;
  return `LEVEL ${i + 1} OF ${world.parts.length}`;
}
function updateHud(force) {
  const pct = currentPct();
  const label = game.mode === 'run' ? runLabel() : game.mode === 'test' ? 'TESTING: ' + (game.level ? game.level.name : '') : (game.level ? game.level.name : '');
  const key = pct + '|' + label + '|' + noClip + '|' + game.mode;
  if (!force && key === game.hudKey) return;
  game.hudKey = key;
  $('progFill').style.width = pct + '%';
  $('hudPct').textContent = pct + '%';
  $('badgeLevel').textContent = label;
  $('badgeNoclip').hidden = !noClip;
  $('btnPause').setAttribute('aria-label', game.mode === 'test' ? 'Back to the editor' : 'Pause');
  applyHudSettings();
}
function applyHudSettings() {
  document.querySelector('.hud-progress').hidden = !settings.showProgress && !settings.showPercent;
  document.querySelector('.hud-progress .progress').style.visibility = settings.showProgress ? '' : 'hidden';
  $('hudPct').style.visibility = settings.showPercent ? '' : 'hidden';
  $('badgeLevel').hidden = !settings.showLevelName;
}


// ===== 9. SAVING LEVELS ====================================================
// The website's levels come from levels.js. Changes you make in the editor are
// kept in this browser until you download a new levels.js and upload it.

const STORE_KEY = 'shiprun.levels.v1';
const SITE_LEVELS = Array.isArray(window.LEVELS) ? window.LEVELS : [];
const clone = x => JSON.parse(JSON.stringify(x));
let usingLocal = false;
let levels = loadLevels();

function canon(list) {
  return list.map(L => ({ id: L.id, name: L.name, randomizer: !!L.randomizer, end: L.end > 0 ? L.end : null,
    colors: (c => Object.keys(c).length ? c : null)(cleanColors(L.colors)), objects: L.objects }));
}
// A level's own colors: {"bg": "#287DFF", "obj": "#FFFFFF", "1": {"rgb": "#FF0000", "opacity": 0.5}}
function cleanColors(c) {
  const out = {};
  if (!isOpts(c)) return out;
  for (const [k, v] of Object.entries(c)) {
    const id = chId(k);
    if (id && !CH_FIXED.has(id)) out[chKey(id)] = specJSON(parseSpec(v, id));
  }
  return out;
}
function sameLevels(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }

function cleanLevel(L, i) {
  const objects = (Array.isArray(L.objects) ? L.objects : [])
    .filter(d => Array.isArray(d) && isKnownType(d[0]) && typeof d[1] === 'number' && typeof d[2] === 'number');
  return {
    id: typeof L.id === 'string' && L.id ? L.id : newId(),
    name: typeof L.name === 'string' && L.name.trim() ? L.name.trim() : 'Level ' + (i + 1),
    randomizer: !!L.randomizer,
    end: L.end > 0 ? Math.round(L.end) : null,
    colors: cleanColors(L.colors),
    objects,
  };
}
function newId() { return 'lvl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadLevels() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.levels)) {
        const local = d.levels.map(cleanLevel);
        if (!sameLevels(local, SITE_LEVELS)) { usingLocal = true; return local; }
        localStorage.removeItem(STORE_KEY);
      }
    }
  } catch (e) { /* storage blocked: just use the website's levels */ }
  return clone(SITE_LEVELS).map(cleanLevel);
}

function saveLevels() {
  usingLocal = !sameLevels(levels, SITE_LEVELS);
  try {
    if (usingLocal) localStorage.setItem(STORE_KEY, JSON.stringify({ levels }));
    else localStorage.removeItem(STORE_KEY);
  } catch (e) { /* ignore */ }
}
let saveTimer = 0;
function saveLevelsSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveLevels, 250); }

// --- settings (the Settings button on the menu, plus the editor's own options) ---
// Kept in this browser only. Dev mode (editorMode) starts off, so visitors to your
// website only see Play and Practice until they turn it on themselves.
const SETTINGS_KEY = 'shiprun.settings.v1';
const SETTING_DEFAULTS = {
  editorMode: false, showProgress: true, showPercent: true, showAttempts: true, showLevelName: true,
  edHitboxes: false, edGrid: true, edInfo: true, edTrail: true, edCoords: true, edWarnings: true,
  swipe: true, freeMove: true, snap: true,
  art: 'gd', quality: 'medium',
};
const settings = loadSettings();
function loadSettings() {
  const s = { ...SETTING_DEFAULTS };
  try {
    const d = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const k in SETTING_DEFAULTS) if (typeof d[k] === typeof SETTING_DEFAULTS[k]) s[k] = d[k];
  } catch (e) { /* storage blocked: defaults */ }
  return s;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

function levelsFileText(list) {
  const out = [
    '// Ship Run levels.',
    '// This file is made by the level editor (Level editor > Download levels.js).',
    '// To publish new levels, replace this file on your website with a new one from the editor.',
    '// Each object reads like your CMU code: ["Spike", 10, 2, 180] is Spike(10, 2, 180).',
    '// Settings in {...} at the end are optional, like keyword arguments: {"color": 5} uses color channel 5.',
    'window.LEVELS = [',
  ];
  list.forEach((L, i) => {
    out.push('  {');
    out.push('    "id": ' + JSON.stringify(L.id) + ',');
    out.push('    "name": ' + JSON.stringify(L.name) + ',');
    out.push('    "randomizer": ' + JSON.stringify(!!L.randomizer) + ',');
    out.push('    "end": ' + JSON.stringify(L.end > 0 ? L.end : null) + ',');
    if (L.colors && Object.keys(L.colors).length) out.push('    "colors": ' + JSON.stringify(L.colors).replace(/,/g, ', ').replace(/":/g, '": ') + ',');
    out.push('    "objects": [');
    L.objects.forEach((o, j) => out.push('      ' + JSON.stringify(o).replace(/,/g, ', ').replace(/":/g, '": ') + (j < L.objects.length - 1 ? ',' : '')));
    out.push('    ]');
    out.push('  }' + (i < list.length - 1 ? ',' : ''));
  });
  out.push('];');
  return out.join('\n') + '\n';
}

function levelCodeText(L) {
  const c = L.colors && Object.keys(L.colors).length ? { colors: L.colors } : {};
  return JSON.stringify({ id: L.id, name: L.name, randomizer: !!L.randomizer, end: L.end > 0 ? L.end : null, ...c, objects: L.objects });
}

// Reads a levels.js file, a list of levels, or one level's code
function parseLevelsText(text) {
  text = String(text || '').trim();
  let data;
  try { data = JSON.parse(text); }
  catch (e) {
    const at = text.indexOf('window.LEVELS');
    const i = text.indexOf('[', at < 0 ? 0 : at), j = text.lastIndexOf(']');
    if (i < 0 || j < i) throw new Error('That text does not contain any levels.');
    data = JSON.parse(text.slice(i, j + 1));
  }
  if (!Array.isArray(data)) data = [data];
  const list = data.filter(L => L && typeof L === 'object' && Array.isArray(L.objects)).map(cleanLevel);
  if (!list.length) throw new Error('That text does not contain any levels.');
  return list;
}

function addLevels(list) {
  let added = 0, replaced = 0;
  for (const L of list) {
    const i = levels.findIndex(x => x.id === L.id);
    if (i >= 0) { levels[i] = L; replaced++; } else { levels.push(L); added++; }
  }
  saveLevels();
  return { added, replaced };
}

function downloadText(filename, text) {
  try {
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  } catch (e) { toast('Your browser blocked the download. Use "Copy text" instead.'); }
}

async function copyText(text, area) {
  try { await navigator.clipboard.writeText(text); toast('Copied.'); }
  catch (e) {
    if (area) { area.focus(); area.select(); }
    toast('Press Ctrl+C (or Cmd+C on a Mac) to copy the selected text.');
  }
}


// ===== 10. LEVEL EDITOR ====================================================

// Only objects that have game logic are here. Everything else from the sheets
// is listed in catalog.js for later.
const DECO_LISTS = { blocks: [], details: [], slopes: [], fakeSpikes: [], ...((window.GD_SPRITES && window.GD_SPRITES.deco) || {}) };
const PALETTE = [
  { name: 'BLOCKS', items: [['Block'], ['GridBlock'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['OutlineBlock', n]),
    ['InvisibleBlock'], ['OutlineBlock', 10], ['OutlineBlock', 11]] },
  { name: 'SPIKES', items: [['Spike'], ['ShortSpike'], ['SmallSpike'], ['TinySpike'], ['ThornPit'],
    ['FadeSpike'], ['FadeShortSpike'], ['FadeSmallSpike'], ['FadeTinySpike'],
    ...Object.entries(SPIKE_LOOKS).map(([d, L]) => [L[0], d]),
    ...Object.keys(PIT_LOOKS).map(d => ['ThornPit', d]),
    ...DECO_LISTS.fakeSpikes.map(n => ['Deco', n])] },
  { name: 'SAWS', items: [['Saw'], ...Object.keys(SAW_LOOKS).filter(d => d !== 'sawblade_01').map(d => ['Saw', d])] },
  { name: 'PORTALS', items: [['SpeedPortal', 'half'], ['SpeedPortal', 'normal'], ['SpeedPortal', 'double'], ['SpeedPortal', 'triple'],
    ['SpeedPortal', 'quad'], ['GravityPortal', -1], ['GravityPortal', 1], ['SizePortal', 'mini'], ['SizePortal', 'big'], ['TelePortal']] },
  { name: 'SPECIAL', items: [['Pad'], ['Orb'], ['Coin']] },
  { name: 'TRIGGERS', items: [['ColorTrigger'], ['AlphaTrigger']] },
  { name: 'DECO BLOCKS', deco: true, items: DECO_LISTS.blocks.map(n => ['Deco', n]) },
  { name: 'SLOPES', deco: true, items: DECO_LISTS.slopes.map(n => ['Slope', n]) },
  { name: 'DECO', deco: true, items: DECO_LISTS.details.map(n => ['Deco', n]) },
].filter(g => g.items.length);
const prettySprite = n => String(n).replace(/_001$/, '').replace(/^d_/, '').replace(/_/g, ' ');
// Names for the designs in the object bar and the selection box
const DESIGN_NAMES = {
  colorSpike: 'Color', iceSpike: 'Ice', gdh_spike: 'Shaded', pit: 'Pit', pit_b: 'Thorn bush',
  blade: 'Blade', blade_b: 'Star blade', blackCogwheel: 'Cogwheel', darkblade: 'Dark blade', lightBlade: 'Light blade',
  spinBlade: 'Scythe', bladeTrap: 'Blade trap',
};
function designName(d) {
  const m = /^(.*?)_?(\d+)((?:_\w+)?)$/.exec(d);
  if (!m) return prettySprite(d);
  const base = DESIGN_NAMES[m[1]] || prettySprite(m[1]);
  const rest = m[3] ? ' ' + m[3].slice(1).split('_').map(x => /^\d+$/.test(x) ? String(Number(x)) : x).join(' ') : '';
  return base + ' ' + Number(m[2]) + rest;
}

function itemLabel(tpl) {
  const [t, v] = tpl;
  switch (t) {
    case 'GridBlock': return 'Grid block';
    case 'Spike': case 'ShortSpike': case 'SmallSpike': case 'TinySpike': {
      const shape = { Spike: 'spike', ShortSpike: 'short spike', SmallSpike: 'small spike', TinySpike: 'tiny spike' }[t];
      if (!v) return shape[0].toUpperCase() + shape.slice(1);
      return designName(v).replace(/ \d+$/, '') + ' ' + (v === 'gdh_spike_04' ? 'mini spike' : shape);
    }
    case 'ThornPit': return v ? designName(v) : 'Thorn pit';
    case 'OutlineBlock': return v === 10 || v === 11 ? 'Invisible line ' + (v - 9) : 'Outline block ' + v;
    case 'InvisibleBlock': return 'Invisible block';
    case 'Coin': return 'User coin';
    case 'ColorTrigger': return 'Color trigger';
    case 'AlphaTrigger': return 'Alpha trigger';
    case 'Slope': return 'Slope: ' + prettySprite(v);
    case 'FadeSpike': return 'Fading spike';
    case 'FadeShortSpike': return 'Fading short spike';
    case 'FadeSmallSpike': return 'Fading small spike';
    case 'FadeTinySpike': return 'Fading tiny spike';
    case 'Deco': return String(v).startsWith('fakeSpike') ? 'Fake spike ' + Number(String(v).slice(10, 12)) + ' (no hitbox)' : 'Deco: ' + prettySprite(v);
    case 'Saw': return v ? designName(v) : 'Saw';
    case 'SpeedPortal': return { half: 'Half', normal: 'Normal', double: 'Double', triple: 'Triple', quad: 'Quad' }[v] + ' speed';
    case 'GravityPortal': return Number(v) === -1 ? 'Gravity flip' : 'Gravity normal';
    case 'SizePortal': return v === 'mini' ? 'Mini size' : 'Big size';
    case 'TelePortal': return 'Teleport';
    default: return t;
  }
}
function typeLabel(d) {
  const t = d[0];
  if (t === 'Saw' || HAZARDS[t] || t === 'ThornPit' || isFlippable(t)) return itemLabel([t, getArg(d, 4)]);
  return PORTALS[t] ? itemLabel([t, getArg(d, 3)]) + ' portal' : itemLabel([t, getArg(d, 3)]);
}

const ed = {
  level: null, objs: [], built: [], byDef: new Map(),
  mode: 'build', group: 0, page: 0, brush: ['Block'], rot: 0, flip: false, sawSize: 1,
  sel: new Set(), undo: [], redo: [], pending: null,
  cam: { x: 0, y: 60, scale: 2 }, css: { w: 0, h: 0 }, dpr: 1,
  hover: null, drag: null, spaceDown: false,
  trail: null, clip: null, needsDraw: true, warnings: [], camSet: false,
  saved: '', paused: false, cs: DEFAULT_COLORS, live: false,
};
const edCanvas = $('edCanvas'), edCtx = edCanvas.getContext('2d');
function edRequestDraw() { ed.needsDraw = true; }

function edOpen(level) {
  if (ed.level !== level) {
    ed.level = level; ed.sel.clear(); ed.undo = []; ed.redo = []; ed.trail = null; ed.camSet = false;
    ed.saved = levelState(level);
  }
  edClosePause();
  ed.objs = level.objects;
  showScreen('editor');
  edChanged();
}

// what SAVE remembers, so EXIT can throw away changes made after it
function levelState(L) { return JSON.stringify({ name: L.name, randomizer: L.randomizer, end: L.end, colors: L.colors || {}, objects: L.objects }); }
function edDirty() { return !!ed.level && levelState(ed.level) !== ed.saved; }

function edRebuild() {
  if (!ed.level.colors || !isOpts(ed.level.colors)) ed.level.colors = {};
  ed.cs = new ColorState(ed.level.colors);
  ed.built = ed.objs.map((d, i) => makeObject(d, 0, i));
  ed.byDef = new Map(ed.built.map(o => [o.def, o]));
  ed.warnings = levelWarnings(ed.level);
}

function edChanged() {
  ed.objs = ed.level.objects;
  edRebuild();
  saveLevelsSoon();
  edUpdateScroll();
  edRequestDraw();
  if (!ed.drag) edRenderUISoon();
}

// undo remembers the objects and the level's colors
function snapshot() { return JSON.stringify({ o: ed.level.objects, c: ed.level.colors || {} }); }
function restoreSnap(text) { const d = JSON.parse(text); ed.level.objects = d.o; ed.level.colors = d.c; }
function beginChange() { ed.pending = snapshot(); }
function commitChange() {
  if (ed.pending !== null) {
    ed.undo.push(ed.pending);
    if (ed.undo.length > 200) ed.undo.shift();
    ed.redo = [];
    ed.pending = null;
  }
  edChanged();
}
function edChange(fn) { beginChange(); if (fn() !== false) commitChange(); else ed.pending = null; }
function edUndo() {
  if (!ed.undo.length) return toast('Nothing to undo.');
  ed.redo.push(snapshot());
  restoreSnap(ed.undo.pop());
  ed.sel.clear(); edChanged(); edRenderUI();
}
function edRedo() {
  if (!ed.redo.length) return toast('Nothing to redo.');
  ed.undo.push(snapshot());
  restoreSnap(ed.redo.pop());
  ed.sel.clear(); edChanged(); edRenderUI();
}

function levelWarnings(L) {
  const w = [];
  if (!L.objects.length) w.push('This level is empty. Pick an object at the bottom and click the grid to place it.');
  const st = { speed: 'normal', size: 'big', gravity: 1 };
  L.objects.filter(d => PORTALS[d[0]]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).forEach(d => {
    const type = PORTALS[d[0]].statusType;
    st[type] = type === 'gravity' ? Number(getArg(d, 3)) : getArg(d, 3);
  });
  if (st.speed !== 'normal') w.push(`Ends at ${st.speed} speed. Add a normal speed portal before the end.`);
  if (st.size !== 'big') w.push('Ends at mini size. Add a big size portal before the end.');
  if (st.gravity !== 1) w.push('Ends with gravity flipped. Add a normal gravity portal before the end.');
  if (L.objects.some(d => d[1] <= 8 && d[0] !== 'Deco' && d[0] !== 'Slope' && d[0] !== 'GridBlock' && !isTrigger(d[0]))) w.push('Something is in columns 1 to 8. When this level comes first in a run, the ship starts on top of those columns.');
  if (L.end > 0 && L.objects.some(d => d[1] > L.end)) w.push('Some objects are past the END line, so they would overlap the next level.');
  const opt = d => optsOf(d) || {};
  if (L.objects.some(d => isTrigger(d[0]) && opt(d).spawn)) w.push('A trigger is set to SPAWN TRIGGER. There is no spawn trigger yet, so it never fires.');
  if (L.objects.some(d => d[0] === 'ColorTrigger' && CH_FIXED.has(chId(opt(d).channel == null ? 1 : opt(d).channel)))) w.push('A color trigger changes BLACK, WHITE, P1 or P2. Those channels never change.');
  if (L.objects.some(d => d[0] === 'AlphaTrigger' && !(Number(opt(d).group) > 0))) w.push('An alpha trigger has no group. Give it a group ID, and give that group to the objects it should fade.');
  if (L.objects.filter(d => d[0] === 'Coin').length > 3) w.push('More than 3 coins. Geometry Dash levels have at most 3.');
  return w;
}

// --- placing, picking, deleting ---
function brushDef(X, Y) {
  const [t, v] = ed.brush;
  if (isFlippable(t)) return ed.flip ? [t, X, Y, ed.rot, v, 1] : [t, X, Y, ed.rot, v];
  if (isRotatable(t)) return v ? [t, X, Y, ed.rot, v] : [t, X, Y, ed.rot];     // spikes and pits: v = their design
  if (t === 'Saw') return v ? [t, X, Y, ed.sawSize, v] : [t, X, Y, ed.sawSize];
  if (PORTALS[t]) return [t, X, Y, v];
  if (t === 'TelePortal') return [t, X, Y, Y <= 5 ? Y + 4 : Y - 4];
  return [t, X, Y];
}
function edPlace(X, Y) {
  if (Y < 1 || Y > 10 || X < 1) return false;
  const d = brushDef(X, Y);
  const key = JSON.stringify(d);
  const solidLike = d[0] === 'Block' || d[0] === 'GridBlock';
  if (ed.level.objects.some(o => JSON.stringify(o) === key || (solidLike && o[0] === d[0] && o[1] === X && o[2] === Y))) return null;
  ed.level.objects.push(d);
  // like Geometry Dash: the object you just placed is selected, so the
  // arrow keys / WASD and the action buttons work on it straight away
  ed.sel = new Set([d]);
  return d;
}

function sawRadius(o) {          // how far the saw's picture reaches
  const f = SPR.data && SPR.data.frames.medium[(o.design || 'sawblade_01') + '_001'];
  return (f ? Math.max(f[6], f[7]) / 120 : 1.4 * sawLook(o).r) * o.size * gridSize;
}
function objBounds(o) {
  const g = gridSize;
  if (o.t === 'Saw') { const r = sawRadius(o); return { x0: o.cx - r, y0: o.cy - r, x1: o.cx + r, y1: o.cy + r }; }
  if (o.t === 'TelePortal') {
    const hw = o.w * 0.3;
    return { x0: o.cx - hw, y0: Math.min(o.cy1, o.cy2) - o.h / 2, x1: o.cx + hw, y1: Math.max(o.cy1, o.cy2) + o.h / 2 };
  }
  if (o.t === 'Deco' || o.t === 'Slope') {
    const turned = Math.round(o.angleDeg / 90) % 2 !== 0;
    const hw = (turned ? o.sh : o.sw) / 2, hh = (turned ? o.sw : o.sh) / 2, cx = o.px, cy = o.py;
    return { x0: cx - Math.max(hw, 3), y0: cy - Math.max(hh, 3), x1: cx + Math.max(hw, 3), y1: cy + Math.max(hh, 3) };
  }
  if (o.t === 'ThornPit' && o.design && PIT_LOOKS[o.design] > 0) {     // tall thorn bushes
    const f = SPR.data && SPR.data.frames.medium[o.design + '_001'];
    if (f) { const hw = f[6] / 120 * g, hh = f[7] / 120 * g; return { x0: o.imgX - hw, y0: o.imgY - hh, x1: o.imgX + hw, y1: o.imgY + hh }; }
  }
  if (o.kind === 'portal') { const hw = Math.max(o.w * 0.32, g / 2); return { x0: o.cx - hw, y0: o.cy - o.h / 2, x1: o.cx + hw, y1: o.cy + o.h / 2 }; }
  return { x0: o.x, y0: o.y - g, x1: o.x + g, y1: o.y };
}
function objBoxes(o) {
  if (o.t !== 'TelePortal') return [objBounds(o)];
  const hw = o.w * 0.3;
  return [o.cy1, o.cy2].map(cy => ({ x0: o.cx - hw, y0: cy - o.h / 2, x1: o.cx + hw, y1: cy + o.h / 2 }));
}
function objContains(o, wx, wy) {
  if (o.t === 'Saw') return Math.hypot(wx - o.cx, wy - o.cy) <= Math.max(o.hit.circle.r, gridSize * 0.5);
  return objBoxes(o).some(b => wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1);
}
function edPick(wx, wy) {
  let best = null;
  for (const o of ed.built) {
    if (!objContains(o, wx, wy)) continue;
    if (!best || o.layer > best.layer || (o.layer === best.layer && o.idx > best.idx)) best = o;
  }
  return best ? best.def : null;
}
function removeDefs(set) {
  ed.level.objects = ed.level.objects.filter(d => !set.has(d));
  for (const d of set) ed.sel.delete(d);
}

// --- selection actions ---
function edSelChanged() { edRequestDraw(); edRenderUISoon(); }
function selectedList() { return ed.level.objects.filter(d => ed.sel.has(d)); }
// Positions can be fractions of a square (half, 1/15, one pixel = 1/20, 1/30).
// They are kept on a 1/60 grid and stored with 4 decimals so levels.js stays tidy.
const tidy = v => Number((Math.round(v * 60) / 60).toFixed(4));
function moveDef(d, dX, dY) {
  d[1] = tidy(d[1] + dX);
  d[2] = tidy(d[2] + dY);
  if (d[0] === 'TelePortal') setArg(d, 3, tidy(Number(getArg(d, 3) ?? d[2] - dY) + dY));
}
function edMoveSel(dX, dY) {
  if (!ed.sel.size) return toast('Select something first: click an object in Edit mode.');
  edChange(() => { for (const d of ed.sel) moveDef(d, dX, dY); });
  edRenderUI();
}
// Turns the selected spikes and thorn pits. In Create mode it also turns the
// next object you place, so a row of ceiling spikes stays easy to build.
function edRotate(delta) {
  const targets = selectedList().filter(d => isRotatable(d[0]));
  if (targets.length) edChange(() => { for (const d of targets) setArg(d, 3, ((Number(getArg(d, 3)) || 0) + delta + 360) % 360); });
  if (ed.mode === 'build' || !targets.length) {
    ed.rot = (ed.rot + delta + 360) % 360;
    renderPalette();
  }
  edRenderUI();
  edRequestDraw();
}
// Mirrors the selection like Geometry Dash's flip buttons: positions flip
// inside the selection's box and spikes point the other way.
function edFlip(axis) {
  const list = selectedList();
  if (!list.length) {   // nothing selected: flip the next object you place
    ed.rot = axis === 'x' ? (360 - ed.rot) % 360 : (540 - ed.rot) % 360;
    if (isFlippable(ed.brush[0])) ed.flip = !ed.flip;
    renderPalette(); edRenderUI(); edRequestDraw();
    return;
  }
  const i = axis === 'x' ? 1 : 2;
  const tele = d => Number(getArg(d, 3) ?? d[2]);
  const vals = list.flatMap(d => (axis === 'y' && d[0] === 'TelePortal') ? [d[2], tele(d)] : [d[i]]);
  const sum = Math.min(...vals) + Math.max(...vals);
  edChange(() => {
    for (const d of list) {
      if (axis === 'y' && d[0] === 'TelePortal') setArg(d, 3, tidy(sum - tele(d)));
      d[i] = tidy(sum - d[i]);
      if (isRotatable(d[0])) {
        const a = Number(getArg(d, 3)) || 0;
        setArg(d, 3, axis === 'x' ? (360 - a) % 360 : (540 - a) % 360);
      }
      if (isFlippable(d[0])) toggleFlip(d);   // mirror the picture too
    }
  });
  edRenderUI();
}
function edDeleteSel() {
  if (!ed.sel.size) return toast('Nothing is selected.');
  const set = new Set(ed.sel);
  edChange(() => removeDefs(set));
  edRenderUI();
}
function edDeselect() { ed.sel.clear(); edSelChanged(); }
function edSelectWhere(test) {
  if (ed.mode === 'delete' || ed.mode === 'view') setMode('edit');
  ed.sel = new Set(ed.level.objects.filter(test));
  edSelChanged();
  toast(ed.sel.size ? `Selected ${ed.sel.size} object${ed.sel.size > 1 ? 's' : ''}.` : 'Nothing there to select.');
}
function edAlign(axis) {
  const list = selectedList();
  if (list.length < 2) return toast('Select two or more objects first.');
  const i = axis === 'x' ? 1 : 2, target = Math.min(...list.map(d => d[i]));
  edChange(() => { for (const d of list) { if (axis === 'y') moveDef(d, 0, target - d[2]); else d[1] = target; } });
  edRenderUI();
}
function edCopy() {
  const list = selectedList();
  if (!list.length) return toast('Select something first: click an object in Edit mode.');
  ed.clip = clone(list);
  edRenderUI();
  toast(`Copied ${list.length} object${list.length > 1 ? 's' : ''}.`);
}
// Like Geometry Dash: paste puts the copy in the middle of the screen,
// moved by whole squares so the objects keep their exact offsets.
function edPaste() {
  if (!ed.clip) return toast('Nothing copied yet.');
  const xs = ed.clip.map(d => d[1]), ys = ed.clip.map(d => d[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const viewX = ed.cam.x + ed.css.w / ed.cam.scale / 2, viewY = ed.cam.y + ed.css.h / ed.cam.scale / 2;
  const centerCol = viewX / gridSize + 0.5, centerRow = (300 - viewY) / gridSize + 0.5;
  let dX = Math.round(centerCol - (minX + maxX) / 2), dY = Math.round(centerRow - (minY + maxY) / 2);
  if (minY + dY < 1) dY += Math.ceil(1 - (minY + dY));
  else if (maxY + dY > 10) dY -= Math.ceil(maxY + dY - 10);
  if (minX + dX < 1) dX += Math.ceil(1 - (minX + dX));
  const fresh = ed.clip.map(d => { const c = d.slice(); moveDef(c, dX, dY); return c; });
  edChange(() => { ed.level.objects.push(...fresh); });
  ed.sel = new Set(fresh); edRenderUI();
}
function edDuplicate() {
  const list = selectedList();
  if (!list.length) return toast('Select something first: click an object in Edit mode.');
  const fresh = clone(list);
  edChange(() => { ed.level.objects.push(...fresh); });
  ed.sel = new Set(fresh); edRenderUI();
  toast('Copied in place. Move the copies with WASD, the arrow keys or the move buttons.');
}

function setMode(m) {
  ed.mode = m;
  document.querySelectorAll('#edModes [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  edCanvas.dataset.mode = m;
  showModeTab();
  if (m === 'delete') ed.sel.clear();
  edRenderUISoon();
  edRequestDraw();
}

// --- camera ---
const ED_TOP = 128, ED_BOTTOM = 124;    // screen room kept free for the buttons over the canvas
function edResize() {
  const wrap = $('edWrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  ed.css = { w: W, h: H };
  ed.dpr = sizeCanvas(edCanvas, W, H);
  if (!ed.camSet) {
    ed.cam.scale = Math.max(0.6, Math.min(5, (H - ED_TOP - ED_BOTTOM) / 200));
    ed.cam.x = 0;
    ed.cam.y = 100 - ED_TOP / ed.cam.scale;
    ed.camSet = true;
  }
  edRequestDraw();
}
function edZoom(f, sx = ed.css.w / 2, sy = ed.css.h / 2) {
  const c = ed.cam, wx = c.x + sx / c.scale, wy = c.y + sy / c.scale;
  c.scale = Math.max(0.4, Math.min(8, c.scale * f));
  c.x = wx - sx / c.scale; c.y = wy - sy / c.scale;
  edClampCam(); edRequestDraw();
}
function edClampCam() {
  const c = ed.cam;
  c.x = Math.max(-200, Math.min(c.x, (levelEndCol(ed.level) + 40) * gridSize));
  c.y = Math.max(-200, Math.min(c.y, 400));
  edUpdateScroll(true);
}
function edUpdateScroll(valueOnly) {
  const r = $('edScroll');
  if (!valueOnly && ed.level) r.max = String((levelEndCol(ed.level) + 30) * gridSize);
  r.value = String(Math.max(0, ed.cam.x));
}
function edPoint(e) {
  const r = edCanvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const wx = ed.cam.x + sx / ed.cam.scale, wy = ed.cam.y + sy / ed.cam.scale;
  return { sx, sy, wx, wy, X: Math.floor(wx / gridSize) + 1, Y: Math.floor((300 - wy) / gridSize) + 1 };
}

// --- mouse ---
edCanvas.addEventListener('contextmenu', e => e.preventDefault());
edCanvas.addEventListener('pointerdown', e => {
  edCanvas.setPointerCapture(e.pointerId);
  const p = edPoint(e);
  ed.hover = p;
  const pan = () => { ed.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, x: ed.cam.x, y: ed.cam.y }; };
  if (e.button === 1 || e.button === 2 || ed.spaceDown || ed.mode === 'view') { pan(); return; }
  if (e.button !== 0) return;
  if (ed.mode === 'build') {
    beginChange();                       // one undo step for the whole stroke
    if (edPlace(p.X, p.Y)) commitChange();
    if (settings.swipe) ed.drag = { type: 'paint', last: p.X + ',' + p.Y }; else { ed.pending = null; pan(); }
    edRenderUISoon();
  } else if (ed.mode === 'delete') {
    beginChange();
    const d = edPick(p.wx, p.wy);
    if (d) { removeDefs(new Set([d])); commitChange(); }
    if (settings.swipe) ed.drag = { type: 'erase' }; else { ed.pending = null; pan(); }
  } else {
    const d = edPick(p.wx, p.wy);
    if (d) {
      if (e.shiftKey) { ed.sel.has(d) ? ed.sel.delete(d) : ed.sel.add(d); edSelChanged(); return; }
      if (!ed.sel.has(d)) { ed.sel.clear(); ed.sel.add(d); edSelChanged(); }
      if (settings.freeMove) ed.drag = { type: 'move', X: p.X, Y: p.Y, wx: p.wx, wy: p.wy, dX: 0, dY: 0, moved: false, orig: new Map([...ed.sel].map(s => [s, s.slice()])) };
    } else {
      if (!e.shiftKey) { ed.sel.clear(); edSelChanged(); }
      if (settings.swipe) ed.drag = { type: 'box', x0: p.wx, y0: p.wy, x1: p.wx, y1: p.wy, base: new Set(ed.sel) };
      else pan();
    }
  }
  edRequestDraw();
});
edCanvas.addEventListener('pointermove', e => {
  const p = edPoint(e);
  ed.hover = p;
  $('edCoords').textContent = `COLUMN ${p.X}  ·  ROW ${p.Y}`;
  const dr = ed.drag;
  if (dr) {
    if (dr.type === 'pan') {
      ed.cam.x = dr.x - (e.clientX - dr.sx) / ed.cam.scale;
      ed.cam.y = dr.y - (e.clientY - dr.sy) / ed.cam.scale;
      edClampCam();
    } else if (dr.type === 'paint') {
      const key = p.X + ',' + p.Y;
      if (key !== dr.last) {
        dr.last = key;
        if (edPlace(p.X, p.Y)) { if (ed.pending !== null) commitChange(); else edChanged(); }
      }
    } else if (dr.type === 'erase') {
      const d = edPick(p.wx, p.wy);
      if (d) { removeDefs(new Set([d])); if (ed.pending !== null) commitChange(); else edChanged(); }
    } else if (dr.type === 'move') {
      // Snap on: jump by whole squares. Snap off: follow the mouse (1/60 of a square).
      const dX = settings.snap ? p.X - dr.X : tidy((p.wx - dr.wx) / gridSize);
      const dY = settings.snap ? p.Y - dr.Y : tidy((dr.wy - p.wy) / gridSize);
      if (dX !== dr.dX || dY !== dr.dY) {
        if (!dr.moved) beginChange();
        dr.dX = dX; dr.dY = dY;
        for (const [d, o] of dr.orig) { d[1] = o[1]; d[2] = o[2]; if (d[0] === 'TelePortal' && getArg(o, 3) != null) setArg(d, 3, getArg(o, 3)); moveDef(d, dX, dY); }
        if (!dr.moved) { dr.moved = true; commitChange(); } else edChanged();
      }
    } else if (dr.type === 'box') {
      dr.x1 = p.wx; dr.y1 = p.wy;
    }
  }
  edRequestDraw();
});
function edPointerUp() {
  const dr = ed.drag;
  if (dr && dr.type === 'box') {
    const x0 = Math.min(dr.x0, dr.x1), x1 = Math.max(dr.x0, dr.x1), y0 = Math.min(dr.y0, dr.y1), y1 = Math.max(dr.y0, dr.y1);
    ed.sel = new Set(dr.base);
    if (x1 - x0 > 2 || y1 - y0 > 2) {
      for (const o of ed.built) {
        const ax = o.t === 'Saw' || o.kind === 'portal' ? o.cx : o.x + gridSize / 2;
        const ay = o.t === 'Saw' ? o.cy : o.t === 'TelePortal' ? o.cy1 : o.kind === 'portal' ? o.cy : o.y - gridSize / 2;
        if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) ed.sel.add(o.def);
      }
    }
  }
  ed.drag = null;
  ed.pending = null;
  edRenderUI();
  edRequestDraw();
}
edCanvas.addEventListener('pointerup', edPointerUp);
edCanvas.addEventListener('pointercancel', edPointerUp);
edCanvas.addEventListener('pointerleave', () => { if (!ed.drag) { ed.hover = null; edRequestDraw(); } });
edCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const p = edPoint(e);
    edZoom(Math.exp(-e.deltaY * 0.0018), p.sx, p.sy);
  } else {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    ed.cam.x += d / ed.cam.scale;
    edClampCam(); edRequestDraw();
  }
}, { passive: false });

// --- keyboard ---
function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
// Arrow keys and WASD: move the selection one square (Shift: 1/15), like
// Geometry Dash. With nothing selected they scroll the view instead.
const MOVE_KEYS = {
  arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1],
  a: [-1, 0], d: [1, 0], w: [0, 1], s: [0, -1],
};
function edKey(e) {
  if (isTyping(e)) return;
  if (ed.paused) { if (e.key === 'Escape') edClosePause(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, lower = k.toLowerCase();
  if (ctrl && lower === 'z') { e.preventDefault(); e.shiftKey ? edRedo() : edUndo(); }
  else if (ctrl && lower === 'y') { e.preventDefault(); edRedo(); }
  else if (ctrl && lower === 'c') { e.preventDefault(); edCopy(); }
  else if (ctrl && lower === 'v') { e.preventDefault(); edPaste(); }
  else if (ctrl && lower === 'd') { e.preventDefault(); edDuplicate(); }
  else if (ctrl && lower === 'a') { e.preventDefault(); edSelectWhere(() => true); }
  else if (ctrl && lower === 's') { e.preventDefault(); edSave(); }
  else if (ctrl || e.altKey) return;
  else if (MOVE_KEYS[lower]) {
    e.preventDefault();
    const [sx, sy] = MOVE_KEYS[lower];
    const step = e.shiftKey ? 1 / 15 : 1;
    if (ed.sel.size && ed.mode !== 'view') edMoveSel(sx * step, sy * step);
    else if (sx) { ed.cam.x += sx * 5 * gridSize; edClampCam(); edRequestDraw(); }
  }
  else if (k === '1') setMode('build');
  else if (k === '2') setMode('edit');
  else if (k === '3') setMode('delete');
  else if (k === '4') setMode('view');
  else if (lower === 'q') edRotate(90);
  else if (lower === 'e') edRotate(-90);
  else if (lower === 'f') edRotate(180);
  else if (lower === 'h') toggleEdHitboxes();
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); edDeleteSel(); }
  else if (k === 'Escape') { if (ed.sel.size) edDeselect(); else edOpenPause(); }
  else if (k === 'Enter') { e.preventDefault(); edTest(e.shiftKey); }
  else if (k === ' ') { e.preventDefault(); ed.spaceDown = true; edCanvas.dataset.pan = '1'; }
}
function toggleEdHitboxes() {
  settings.edHitboxes = !settings.edHitboxes; saveSettings();
  edRenderUI(); edRequestDraw();
}

function edTest(fromHere) {
  const start = fromHere ? Math.max(0, Math.floor(ed.cam.x / gridSize) * gridSize) : 0;
  saveLevels();
  startPlay('test', { level: clone(ed.level), startScroll: start, returnTo: 'editor' });
}

// --- drawing the editor ---
function drawEditor() {
  const ctx = edCtx, { w: W, h: H } = ed.css, dpr = ed.dpr, c = ed.cam;
  if (!W || !ed.level) return;
  const k = c.scale * dpr, g = gridSize;
  const x0 = c.x, x1 = c.x + W / c.scale, y0 = c.y, y1 = c.y + H / c.scale;
  DRAW.parts = null; DRAW.cs = ed.cs; DRAW.now = 0; DRAW.play = false;
  const sc = id => { const v = ed.cs.resolve(id, 0); return [v.r, v.g, v.b]; };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(ctx, W, H, sc(CH.BG));
  ctx.setTransform(k, 0, 0, k, -c.x * k, -c.y * k);
  drawStage(ctx, x0, x1, y0, y1, sc(CH.GROUND), sc(CH.LINE));

  // grid
  const cs = Math.max(1, Math.floor(x0 / g)), ce = Math.ceil(x1 / g);
  if (settings.edGrid) {
  ctx.lineWidth = 1 / c.scale;
  ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,40,0.28)';
  for (let col = cs; col <= ce; col++) { if (col % 5) { ctx.moveTo(col * g, 100); ctx.lineTo(col * g, 300); } }
  for (let y = 120; y < 300; y += g) { ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,40,0.55)';
  for (let col = Math.ceil(cs / 5) * 5; col <= ce; col += 5) { ctx.moveTo(col * g, 100); ctx.lineTo(col * g, 300); }
  ctx.moveTo(0, 100); ctx.lineTo(0, 300);
  ctx.stroke();
  }

  // where the ship starts (columns 1-8 are behind it when this level is first)
  ctx.fillStyle = 'rgba(0,0,30,0.25)'; ctx.fillRect(0, 100, 150, 200);
  ctx.globalAlpha = 0.55; drawPlayer(ctx, shipCenterX, position, 0, 1, 1, false); ctx.globalAlpha = 1;

  // END line
  const endX = levelEndCol(ed.level) * g;
  ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 2.5 / c.scale; ctx.setLineDash([6 / c.scale, 4 / c.scale]);
  ctx.beginPath(); ctx.moveTo(endX, 100); ctx.lineTo(endX, 300); ctx.stroke(); ctx.setLineDash([]);

  // objects
  const vis = ed.built.filter(o => o.cx > x0 - 140 && o.cx < x1 + 140);
  drawObjects(ctx, vis);

  // teleport links
  ctx.setLineDash([3 / c.scale, 3 / c.scale]); ctx.lineWidth = 1.2 / c.scale; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  for (const o of vis) if (o.t === 'TelePortal') { ctx.beginPath(); ctx.moveTo(o.cx, o.cy1); ctx.lineTo(o.cx, o.cy2); ctx.stroke(); }
  ctx.setLineDash([]);

  if (settings.edHitboxes) drawHitboxes(ctx, vis, null);

  // last test flight
  if (settings.edTrail && ed.trail && ed.trail.pts.length > 1) {
    const pts = ed.trail.pts;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3.6 / c.scale; ctx.stroke();
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.8 / c.scale; ctx.stroke();
    if (ed.trail.died) {
      const [lx, ly] = pts[pts.length - 1], r = 5;
      ctx.beginPath(); ctx.moveTo(lx - r, ly - r); ctx.lineTo(lx + r, ly + r); ctx.moveTo(lx + r, ly - r); ctx.lineTo(lx - r, ly + r);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 5 / c.scale; ctx.stroke();
      ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 2.6 / c.scale; ctx.stroke();
    }
  }

  // selection
  for (const d of ed.sel) {
    const o = ed.byDef.get(d); if (!o) continue;
    for (const b of objBoxes(o)) {
      ctx.lineWidth = 4 / c.scale; ctx.strokeStyle = '#000'; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.lineWidth = 2 / c.scale; ctx.strokeStyle = '#6dff3a'; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    }
  }

  // hover
  const hv = ed.hover;
  if (hv && ed.mode !== 'view' && (!ed.drag || ed.drag.type === 'paint')) {
    if (ed.mode === 'build' && hv.Y >= 1 && hv.Y <= 10 && hv.X >= 1) {
      ctx.globalAlpha = 0.5; drawObject(ctx, makeObject(brushDef(hv.X, hv.Y))); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2 / c.scale;
      ctx.strokeRect((hv.X - 1) * g, 300 - hv.Y * g, g, g);
    } else if (ed.mode !== 'build') {
      const d = edPick(hv.wx, hv.wy), o = d && ed.byDef.get(d);
      if (o) {
        ctx.strokeStyle = ed.mode === 'delete' ? '#ff3b2f' : 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2 / c.scale;
        for (const b of objBoxes(o)) ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
    }
  }

  // box select
  if (ed.drag && ed.drag.type === 'box') {
    const b = ed.drag;
    ctx.fillStyle = 'rgba(109,255,58,0.14)'; ctx.strokeStyle = '#6dff3a'; ctx.lineWidth = 1.5 / c.scale;
    ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
  }

  // column numbers, END and START labels (screen pixels so they stay sharp)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toSX = wx => (wx - c.x) * c.scale, toSY = wy => (wy - c.y) * c.scale;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const every = c.scale * g >= 26 ? 1 : 5;
  for (let col = Math.ceil(cs / every) * every; col <= ce; col += every) {
    if (col < 1) continue;
    outlinedText(ctx, String(col), toSX((col - 0.5) * g), toSY(100) - 5, 11, 3);
  }
  ctx.textBaseline = 'top';
  outlinedText(ctx, 'END', toSX(endX), toSY(300) + 7, 12, 3.5, '#ffd21f');
  outlinedText(ctx, 'START', toSX(shipCenterX), toSY(300) + 7, 12, 3.5);
  DRAW.cs = DEFAULT_COLORS;
}

// --- the panels over the canvas ---
let uiTimer = 0;
function edRenderUISoon() { cancelAnimationFrame(uiTimer); uiTimer = requestAnimationFrame(edRenderUI); }
function esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function field(label, input, wide) { return `<label class="field${wide ? ' wide' : ''}"><span class="field-label">${label}</span>${input}</label>`; }

function edRenderUI() {
  if (!ed.level) return;
  $('edName').textContent = ed.level.name;
  const w = ed.warnings;
  const warn = $('edWarn');
  warn.hidden = !w.length || !settings.edWarnings;
  warn.textContent = w.length ? w[0] + (w.length > 1 ? `  (+${w.length - 1} more: click for level settings)` : '') : '';
  const badge = $('edBadge');
  badge.hidden = !w.length;
  badge.textContent = String(w.length);
  showModeTab();
  $('rotVal').textContent = ed.rot + '°';
  const n = ed.sel.size;
  $('selCount').textContent = n ? `· ${n} SELECTED` : '';
  $('edTrash').disabled = !n;
  $('edUndo').disabled = !ed.undo.length;
  $('edRedo').disabled = !ed.redo.length;
  $('edHitboxes').setAttribute('aria-pressed', String(settings.edHitboxes));
  $('edHitboxes').classList.toggle('green', settings.edHitboxes);
  $('edHitboxes').classList.toggle('lime', !settings.edHitboxes);
  for (const b of document.querySelectorAll('#edActions [data-act]')) {
    const a = b.dataset.act;
    b.disabled = a === 'paste' ? !ed.clip : a === 'selall' ? !ed.level.objects.length : !n;
  }
  for (const b of document.querySelectorAll('#edToggles [data-tog]')) b.setAttribute('aria-pressed', String(settings[b.dataset.tog]));
  $('edCoords').hidden = !settings.edCoords;
  renderProps();
}

// The COLOR / DETAIL buttons: a swatch and the channel's name ("MIXED" when the selection differs)
const isColorable = d => { const o = ed.byDef.get(d); return !!(o && o.ch); };
const hasDetail = d => { const o = ed.byDef.get(d); return !!(o && o.dch); };
function chipHTML(kind, list) {
  const ids = [...new Set(list.map(d => { const o = ed.byDef.get(d); return kind === 'detail' ? o.dch : o.ch; }))];
  const id = ids.length === 1 ? ids[0] : 0, c = id ? ed.cs.resolve(id, 0) : null;
  return `<button class="ch-chip" type="button" data-chip="${kind}" title="Pick the ${kind === 'detail' ? 'detail' : 'main'} color channel">
    <span class="ch-sw" style="background:${c ? cssOf(c) : 'linear-gradient(135deg,#fff 50%,#000 50%)'}"></span><span class="ch-name">${id ? chLabel(id) : 'MIXED'}</span></button>`;
}
function renderProps() {
  if (ed.live) return;                       // a slider is being dragged: leave it alone
  const box = $('edSel'), list = selectedList();
  if (!list.length || !settings.edInfo) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  let html = '';
  if (list.length > 1) html += `<span class="sel-name o">${list.length} OBJECTS SELECTED</span>`;
  else {
    const d = list[0], t = d[0];
    html += `<span class="sel-name o">${esc(typeLabel(d).toUpperCase())}</span>`;
    html += field('X', `<input class="gd-input" type="number" data-i="1" step="any" value="${d[1]}" aria-label="Column">`);
    html += field(t === 'TelePortal' ? 'ENTRY Y' : 'Y', `<input class="gd-input" type="number" data-i="2" step="any" value="${d[2]}" aria-label="Row">`);
    if (isRotatable(t)) {
      const a = Number(getArg(d, 3)) || 0, opts = [0, 90, 180, 270];
      if (!opts.includes(a)) opts.push(a);
      const names = isFlippable(t) ? {} : { 0: 'UP', 90: 'LEFT', 180: 'DOWN', 270: 'RIGHT' };
      html += field(isFlippable(t) ? 'TURN' : 'POINTS', `<select class="gd-input" data-i="3" aria-label="Direction">${opts.map(v => `<option value="${v}"${v === a ? ' selected' : ''}>${names[v] || v + '°'}</option>`).join('')}</select>`, true);
    } else if (PORTALS[t]) {
      const vals = Object.keys(PORTALS[t].variants);
      html += field('TYPE', `<select class="gd-input" data-i="3" aria-label="Portal type">${vals.map(v => `<option value="${v}"${String(getArg(d, 3)) === v ? ' selected' : ''}>${esc(itemLabel([t, v]).toUpperCase())}</option>`).join('')}</select>`, true);
    } else if (t === 'TelePortal') {
      html += field('EXIT Y', `<input class="gd-input" type="number" data-i="3" step="any" value="${getArg(d, 3) ?? d[2]}" aria-label="Exit row">`);
    }
    if (isTrigger(t)) html += `<button class="gd-btn small" type="button" data-edit-trigger>EDIT TRIGGER</button>`;
  }
  // saw size: one saw or many, changes live while the slider moves
  const saws = list.filter(d => d[0] === 'Saw');
  if (saws.length && saws.length === list.length) {
    const sz = Math.min(SAW_MAX, Math.max(SAW_MIN, Number(getArg(saws[0], 3)) || 1));
    html += `<label class="field wide saw-field"><span class="field-label">SIZE <span class="saw-val">${sz.toFixed(2)}×</span></span>
      <input class="gd-range" type="range" data-saw min="${SAW_MIN}" max="${SAW_MAX}" step="0.05" value="${sz}" aria-label="Saw size"></label>`;
  }
  const col = list.filter(isColorable), det = list.filter(hasDetail);
  const chipField = (label, kind, l) => `<div class="field ch-field"><span class="field-label">${label}</span>${chipHTML(kind, l)}</div>`;
  if (col.length) html += chipField('COLOR', 'main', col);
  if (det.length) html += chipField('DETAIL', 'detail', det);
  const gs = list.map(d => ((optsOf(d) || {}).groups || []).join(', '));
  const same = gs.every(x => x === gs[0]);
  html += field('GROUPS', `<input class="gd-input" type="text" data-groups value="${same ? esc(gs[0]) : ''}" placeholder="${same ? 'NONE' : 'MIXED'}" aria-label="Group IDs, separated by commas" title="Group IDs for alpha triggers, like 1, 4">`);
  ed.renderingProps = true;          // replacing a focused box fires its change event again: ignore that one
  try { box.innerHTML = html; } finally { ed.renderingProps = false; }
}
// Saw size from a slider: the selected saws change while it moves, and the whole drag is one undo step
function sawLive(v) {
  const saws = selectedList().filter(d => d[0] === 'Saw');
  if (!saws.length) return;
  if (!ed.live) { beginChange(); ed.live = true; }
  for (const d of saws) setArg(d, 3, Number(v.toFixed(2)));
  edRebuild(); edRequestDraw();
}
function sawLiveEnd() {
  if (!ed.live) return;
  ed.live = false;
  commitChange(); edRenderUI();
}
$('edSel').addEventListener('input', e => {
  const t = e.target;
  if (!t.matches('[data-saw]')) return;
  const v = Math.min(SAW_MAX, Math.max(SAW_MIN, Number(t.value) || 1));
  t.closest('.saw-field').querySelector('.saw-val').textContent = v.toFixed(2) + '×';
  sawLive(v);
});
$('edSel').addEventListener('change', e => {
  const t = e.target;
  if (ed.renderingProps || !t.isConnected) return;
  if (t.matches('[data-saw]')) { t.blur(); sawLiveEnd(); return; }
  if (t.matches('[data-groups]')) {
    const ids = [...new Set(String(t.value).split(/[^0-9]+/).map(Number).filter(n => n >= 1 && n <= 9999))];
    const list = selectedList();
    edChange(() => { for (const d of list) setOpt(d, 'groups', ids.length ? ids : null); });
    edRenderUI();
    return;
  }
  if (!t.dataset.i) return;
  const list = selectedList(); if (list.length !== 1) return;
  const d = list[0], i = Number(t.dataset.i);
  let v = t.tagName === 'SELECT' && !(d[0] === 'GravityPortal' || isRotatable(d[0])) ? t.value : Number(t.value);
  if (t.tagName !== 'SELECT' && !Number.isFinite(v)) return renderProps();
  if (t.tagName !== 'SELECT' && (i === 1 || i === 2 || (i === 3 && d[0] === 'TelePortal'))) v = tidy(v);
  edChange(() => setArg(d, i, v));
  edRenderUI();
});
$('edSel').addEventListener('click', e => {
  const chip = e.target.closest('[data-chip]');
  if (chip) { openChannelPicker('object', chip.dataset.chip); return; }
  if (e.target.closest('[data-edit-trigger]')) openTriggerEditor(selectedList()[0]);
});

// --- picking a color channel (for the selection, or to edit the level's colors) ---
const chp = { mode: 'object', kind: 'main', page: 0 };
const CHP_PER = 24;
function usedChannels() {        // channels this level already uses
  const used = new Set();
  for (const k of Object.keys(ed.level.colors || {})) used.add(chId(k));
  for (const d of ed.level.objects) {
    const op = optsOf(d); if (!op) continue;
    for (const k of ['color', 'detail', 'copy']) if (op[k] != null) used.add(chId(op[k]));
    if (d[0] === 'ColorTrigger') used.add(chId(op.channel == null ? 1 : op.channel));
  }
  if (ed.level.objects.some(d => d[0] === 'ColorTrigger' && (optsOf(d) || {}).channel == null)) used.add(1);
  used.delete(0);
  return used;
}
function nextFreeChannel() { const u = usedChannels(); for (let i = 1; i <= 999; i++) if (!u.has(i)) return i; return 1; }
function chpCurrent() {          // the channel the selection uses now (0 when mixed)
  if (chp.mode !== 'object') return 0;
  const list = selectedList().filter(chp.kind === 'detail' ? hasDetail : isColorable);
  const ids = [...new Set(list.map(d => { const o = ed.byDef.get(d); return chp.kind === 'detail' ? o.dch : o.ch; }))];
  return ids.length === 1 ? ids[0] : 0;
}
function chBtnHTML(id, cur, used) {
  const c = ed.cs.resolve(id, 0);
  return `<button type="button" class="chp-btn${used && used.has(id) ? ' used' : ''}" data-ch="${id}" aria-pressed="${id === cur}" title="${CH_FIXED.has(id) ? 'This channel never changes' : 'Channel ' + chLabel(id)}">
    <span class="ch-sw" style="background:${cssOf(c)}"></span><span class="ch-name">${chLabel(id)}</span></button>`;
}
function channelPickerHTML() {
  const cur = chpCurrent(), used = usedChannels();
  const named = chp.mode === 'object' ? [CH.OBJ, CH.BLACK, CH.WHITE, CH.P1, CH.P2, CH.BG, CH.GROUND, CH.LINE] : [CH.BG, CH.GROUND, CH.LINE, CH.OBJ];
  const first = chp.page * CHP_PER + 1, ids = [];
  for (let i = first; i < first + CHP_PER && i <= 999; i++) ids.push(i);
  return `<p class="chp-note">${chp.mode === 'object'
      ? 'Pick the channel this object takes its ' + (chp.kind === 'detail' ? 'detail ' : '') + 'color from. Color triggers change a channel, and every object on it changes too.'
      : 'Pick a channel to set its starting color for this level. Channels 1 to 999 start white.'}</p>
    <div class="chp-named">${named.map(id => chBtnHTML(id, cur, used)).join('')}</div>
    <div class="chp-pager">
      <button type="button" class="page-arrow" data-chp-page="-1" aria-label="Previous channels"><svg aria-hidden="true"><use href="#i-page"/></svg></button>
      <div class="chp-grid">${ids.map(id => chBtnHTML(id, cur, used)).join('')}</div>
      <button type="button" class="page-arrow right" data-chp-page="1" aria-label="Next channels"><svg aria-hidden="true"><use href="#i-page"/></svg></button>
    </div>
    <div class="chp-row">
      ${field('CHANNEL', `<input class="gd-input" type="number" min="1" max="999" id="chpGo" value="${cur && cur < 1000 ? cur : ''}" placeholder="1-999">`)}
      <button type="button" class="gd-btn small blue" data-chp-free>NEXT FREE</button>
      ${chp.mode === 'object' ? `<button type="button" class="gd-btn small gray" data-chp-edit${cur && !CH_FIXED.has(cur) ? '' : ' disabled'}>EDIT THIS COLOR</button>` : ''}
    </div>
    <p class="chp-page o">CHANNELS ${first}-${Math.min(999, first + CHP_PER - 1)}</p>`;
}
function openChannelPicker(mode, kind = 'main') {
  chp.mode = mode; chp.kind = kind;
  const cur = chpCurrent();
  chp.page = cur && cur < 1000 ? Math.floor((cur - 1) / CHP_PER) : 0;
  const buttons = mode === 'object'
    ? [{ label: 'DEFAULT', fn: () => chpApply(-1) }, { label: 'OK', primary: true, fn: hideModal }]
    : [{ label: 'OK', primary: true, fn: () => edOpenSettings() }];
  showModal(mode === 'object' ? (kind === 'detail' ? 'DETAIL COLOR' : 'MAIN COLOR') : 'LEVEL COLORS', channelPickerHTML(), buttons, 'chpick', true);
}
function chpRefresh() { if (modalKind === 'chpick' && !$('modal').hidden) { $('modalBody').innerHTML = channelPickerHTML(); fitText($('modal')); } }
// Gives the selection channel id (-1 = back to each object's own default)
function chpApply(id) {
  const key = chp.kind === 'detail' ? 'detail' : 'color';
  const list = selectedList().filter(chp.kind === 'detail' ? hasDetail : isColorable);
  if (!list.length) return;
  edChange(() => {
    for (const d of list) {
      const o = ed.byDef.get(d), def0 = chp.kind === 'detail' ? o.dch0 : o.ch0;
      setOpt(d, key, id === -1 || id === def0 ? null : chKey(id));
    }
  });
  chpRefresh(); edRenderUI();
}
$('modalBody').addEventListener('click', e => {
  if (modalKind !== 'chpick') return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.chpPage) { chp.page = (chp.page + Number(b.dataset.chpPage) + 42) % 42; chpRefresh(); return; }
  if (b.dataset.ch) {
    const id = Number(b.dataset.ch);
    if (chp.mode === 'object') chpApply(id);
    else if (CH_FIXED.has(id)) toast('Black, white and the player colors never change.');
    else openColorPop({ mode: 'channel', id, back: 'picker' });
    return;
  }
  if (b.hasAttribute('data-chp-free')) {
    const id = nextFreeChannel();
    chp.page = Math.floor((id - 1) / CHP_PER);
    if (chp.mode === 'object') chpApply(id); else openColorPop({ mode: 'channel', id, back: 'picker' });
    return;
  }
  if (b.hasAttribute('data-chp-edit')) { const id = chpCurrent(); if (id && !CH_FIXED.has(id)) openColorPop({ mode: 'channel', id, back: 'picker' }); }
});
$('modalBody').addEventListener('change', e => {
  if (modalKind !== 'chpick' || e.target.id !== 'chpGo') return;
  const id = chId(Number(e.target.value));
  if (!id) return;
  chp.page = Math.floor((id - 1) / CHP_PER);
  if (chp.mode === 'object') chpApply(id); else openColorPop({ mode: 'channel', id, back: 'picker' });
});

// --- the SELECT COLOR window: color triggers, and the colors a level starts with ---
const cp = { mode: 'channel', id: 1, def: null, spec: null, fade: 0.5, touch: false, spawn: false, hue: 0, back: '', snap: '' };
let cpClip = null;                   // what COPY remembered, for PASTE
const cloneSpec = sp => ({ ...sp, rgb: sp.rgb.slice() });
const round3 = v => Number(Number(v).toFixed(3));
function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx ? d / mx : 0, mx];
}
function hsvToRgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255].map(Math.round);
}
function openTriggerEditor(d) {
  if (!d) return;
  if (d[0] === 'ColorTrigger') openColorPop({ mode: 'trigger', def: d });
  else if (d[0] === 'AlphaTrigger') openAlphaEditor(d);
}
function openColorPop(opt) {
  cp.mode = opt.mode; cp.back = opt.back || ''; cp.def = opt.def || null;
  if (cp.mode === 'trigger') {
    const o = makeObject(cp.def);
    cp.id = o.target || 1; cp.spec = cloneSpec(o.spec); cp.fade = o.fadeTime; cp.touch = o.touch; cp.spawn = o.spawn;
  } else { cp.id = opt.id; cp.spec = cloneSpec(ed.cs.spec(cp.id)); }
  cp.hue = rgbToHsv(cp.spec.rgb)[0];
  cp.snap = snapshot();             // the whole visit to this window is one undo step
  $('colorPop').hidden = false;
  cpRender();
  fitText($('colorPop'));
}
function closeColorPop() {
  if ($('colorPop').hidden) return;
  $('colorPop').hidden = true;
  if (snapshot() !== cp.snap) { ed.undo.push(cp.snap); if (ed.undo.length > 200) ed.undo.shift(); ed.redo = []; }
  edChanged(); edRenderUI();
  if (cp.back === 'picker') chpRefresh();
  else if (cp.back === 'settings') refreshSettings();
}
// Writes the window's settings into the trigger or the level, so the editor shows them straight away
function cpWrite() {
  const s = cp.spec;
  if (cp.mode === 'trigger') {
    const d = cp.def, old = optsOf(d) || {}, op = { channel: chKey(cp.id) };
    if (s.player) op.player = s.player;
    else if (s.copy) { op.copy = chKey(s.copy); if (s.copyOp) op.copyOpacity = true; }
    else op.rgb = rgbToHex(s.rgb);
    if (s.op !== 1) op.opacity = round3(s.op);
    if (cp.fade !== 0.5) op.fade = round3(cp.fade);
    if (s.blend) op.blending = true;
    if (cp.touch) op.touch = true;
    if (cp.spawn) op.spawn = true;
    if (old.groups) op.groups = old.groups;
    if (optsOf(d)) d.pop();
    d.push(op);
  } else {
    const key = chKey(cp.id), json = specJSON(s), plain = specJSON(defaultSpec(cp.id));
    if (JSON.stringify(json) === JSON.stringify(plain)) delete ed.level.colors[key]; else ed.level.colors[key] = json;
  }
  edRebuild(); edRequestDraw();
}
function cpSetChannel(id) {
  id = chId(id);
  if (!id) { cpRender(); return; }
  if (cp.mode === 'channel') {
    if (CH_FIXED.has(id)) { toast('Black, white and the player colors never change.'); cpRender(); return; }
    cp.id = id; cp.spec = cloneSpec(ed.cs.spec(id)); cp.hue = rgbToHsv(cp.spec.rgb)[0];
  } else { cp.id = id; cpWrite(); }
  cpRender();
}
function cpSetRgb(rgb, keepHue) {
  cp.spec.rgb = rgb.map(v => Math.max(0, Math.min(255, Math.round(v))));
  const [h, sat] = rgbToHsv(cp.spec.rgb);
  if (!keepHue && sat > 0.001) cp.hue = h;
  cpWrite(); cpRender();
}
function cpRender() {
  const s = cp.spec, trig = cp.mode === 'trigger';
  const shown = s.player ? PLAYER_RGB[s.player] : s.copy ? (() => { const c = ed.cs.resolve(s.copy, 0); return [c.r, c.g, c.b]; })() : s.rgb;
  $('cpSwatch').style.background = rgbToHex(shown);
  $('cpSwatch').style.opacity = String(0.25 + 0.75 * s.op);
  $('cpSub').textContent = trig ? 'COLOR TRIGGER' : 'LEVEL COLOR: ' + chLabel(cp.id);
  for (const [k, i] of [['cpR', 0], ['cpG', 1], ['cpB', 2]]) if (document.activeElement !== $(k)) $(k).value = s.rgb[i];
  if (document.activeElement !== $('cpHex')) $('cpHex').value = rgbToHex(s.rgb).slice(1);
  $('cpOp').value = s.op; $('cpOpLabel').textContent = 'OPACITY: ' + s.op.toFixed(2);
  $('cpCopy').checked = !!s.copy; $('cpBlend').checked = s.blend;
  $('cpP1').checked = s.player === 1; $('cpP2').checked = s.player === 2;
  $('cpCopyBox').hidden = !s.copy; $('cpWheelBox').hidden = !!s.copy;
  $('cpWheelBox').classList.toggle('off', !!s.player);
  if (s.copy) { if (document.activeElement !== $('cpCopyId')) $('cpCopyId').value = chLabel(s.copy); $('cpCopyOp').checked = s.copyOp; }
  $('cpFadeBox').hidden = !trig; $('cpTrig').hidden = !trig;
  if (trig) { $('cpFade').value = Math.min(10, cp.fade); if (document.activeElement !== $('cpFadeNum')) $('cpFadeNum').value = cp.fade; $('cpTouch').checked = cp.touch; $('cpSpawn').checked = cp.spawn; }
  if (document.activeElement !== $('cpId')) $('cpId').value = chLabel(cp.id);
  const c = ed.cs.resolve(cp.id, 0);
  $('cpIdName').innerHTML = `<span class="ch-sw" style="background:${cssOf(c)}"></span>${trig ? 'CHANGES' : 'EDITING'} ${CH_NAME[cp.id] ? chLabel(cp.id) : 'CHANNEL ' + cp.id}`;
  $('cpPaste').disabled = !cpClip;
  drawWheel();
}
// The wheel: hue around the ring; inside, the picked hue (left), white (top right) and black (bottom)
const WHEEL = { size: 0, bary: null, hueKey: '', disc: null, ring: null };
const TRI = [[-1, 0], [Math.cos(rad(50)), Math.sin(rad(50))], [Math.cos(rad(-80)), Math.sin(rad(-80))]];   // hue, white, black (y up)
function baryOf(px, py) {           // weights of hue, white, black for a point, kept inside the triangle
  const [[x1, y1], [x2, y2], [x3, y3]] = TRI;
  const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  let a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / det;
  let b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / det;
  let c = 1 - a - b;
  if (a >= 0 && b >= 0 && c >= 0) return [a, b, c];
  let best = null;                  // outside: the nearest point on an edge
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
    const [ax, ay] = TRI[i], [bx, by] = TRI[j], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const qx = ax + t * dx, qy = ay + t * dy, d2 = (qx - px) ** 2 + (qy - py) ** 2;
    if (!best || d2 < best[0]) { const w = [0, 0, 0]; w[i] = 1 - t; w[j] = t; best = [d2, w]; }
  }
  return best[1];
}
function drawWheel() {
  const cv = $('cpWheel'), css = cv.clientWidth || 240, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const N = Math.round(css * dpr);
  if (cv.width !== N) { cv.width = N; cv.height = N; }
  const R = N / 2 - 2 * dpr, rIn = R * 0.8, rDisc = R * 0.7, C = N / 2;
  if (WHEEL.size !== N) {
    WHEEL.size = N; WHEEL.hueKey = '';
    WHEEL.ring = document.createElement('canvas'); WHEEL.ring.width = N; WHEEL.ring.height = N;
    const rc = WHEEL.ring.getContext('2d');
    for (let i = 0; i < 360; i++) {          // screen angle phi shows hue 180 - phi (red on the left, like Geometry Dash)
      const a0 = rad(i - 0.6), a1 = rad(i + 0.6);
      rc.beginPath(); rc.arc(C, C, R, a0, a1); rc.arc(C, C, rIn, a1, a0, true); rc.closePath();
      rc.fillStyle = `hsl(${(180 - i + 360) % 360},100%,50%)`; rc.fill();
    }
    rc.lineWidth = 3 * dpr; rc.strokeStyle = '#fff';
    rc.beginPath(); rc.arc(C, C, R, 0, Math.PI * 2); rc.stroke();
    rc.beginPath(); rc.arc(C, C, rIn, 0, Math.PI * 2); rc.stroke();
    const D = Math.ceil(rDisc * 2);
    WHEEL.bary = new Float32Array(D * D * 3); WHEEL.D = D;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const ux = (x + 0.5 - D / 2) / rDisc, uy = -(y + 0.5 - D / 2) / rDisc, k = (y * D + x) * 3;
      if (ux * ux + uy * uy > 1.02) { WHEEL.bary[k] = -1; continue; }
      const w = baryOf(ux, uy); WHEEL.bary[k] = w[0]; WHEEL.bary[k + 1] = w[1]; WHEEL.bary[k + 2] = w[2];
    }
  }
  const hueKey = String(Math.round(cp.hue));
  if (WHEEL.hueKey !== hueKey) {
    WHEEL.hueKey = hueKey;
    const D = WHEEL.D, img = new ImageData(D, D), hc = hsvToRgb(cp.hue, 1, 1);
    for (let i = 0; i < D * D; i++) {
      const k = i * 3, a = WHEEL.bary[k];
      if (a < 0) continue;
      const b = WHEEL.bary[k + 1], o = i * 4;
      img.data[o] = a * hc[0] + b * 255; img.data[o + 1] = a * hc[1] + b * 255; img.data[o + 2] = a * hc[2] + b * 255; img.data[o + 3] = 255;
    }
    WHEEL.disc = document.createElement('canvas'); WHEEL.disc.width = D; WHEEL.disc.height = D;
    WHEEL.disc.getContext('2d').putImageData(img, 0, 0);
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, N, N);
  ctx.drawImage(WHEEL.ring, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.arc(C, C, rDisc, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(WHEEL.disc, C - WHEEL.D / 2, C - WHEEL.D / 2); ctx.restore();
  ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(C, C, rDisc, 0, Math.PI * 2); ctx.stroke();
  // the two knobs
  const knob = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff'; ctx.stroke(); };
  const phi = rad(180 - cp.hue), rm = (R + rIn) / 2;
  knob(C + Math.cos(phi) * rm, C + Math.sin(phi) * rm, (R - rIn) * 0.42);
  const [, sat, val] = rgbToHsv(cp.spec.rgb), wa = val * sat, wb = val * (1 - sat), wc = 1 - val;
  const kx = wa * TRI[0][0] + wb * TRI[1][0] + wc * TRI[2][0], ky = wa * TRI[0][1] + wb * TRI[1][1] + wc * TRI[2][1];
  knob(C + kx * rDisc, C - ky * rDisc, 7 * dpr);
}
let wheelDrag = '';
function wheelPick(e, start) {
  const cv = $('cpWheel'), r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 2 - 1, y = -((e.clientY - r.top) / r.height * 2 - 1);
  const d = Math.hypot(x, y), R = 1 - 4 / r.width;
  if (start) wheelDrag = d > R * 0.74 ? 'hue' : 'sv';
  if (cp.spec.player || cp.spec.copy) return;
  if (wheelDrag === 'hue') {
    const phi = deg(Math.atan2(-y, x));
    cp.hue = ((180 - phi) % 360 + 360) % 360;
    const [, sat, val] = rgbToHsv(cp.spec.rgb);
    cpSetRgb(hsvToRgb(cp.hue, sat || 1, val || 1), true);
  } else {
    const w = baryOf(x / (R * 0.7), y / (R * 0.7)), val = w[0] + w[1], sat = val > 0 ? w[0] / val : 0;
    cpSetRgb(hsvToRgb(cp.hue, sat, val), true);
  }
}
$('cpWheel').addEventListener('pointerdown', e => { $('cpWheel').setPointerCapture(e.pointerId); wheelPick(e, true); });
$('cpWheel').addEventListener('pointermove', e => { if (wheelDrag && e.buttons) wheelPick(e, false); });
$('cpWheel').addEventListener('pointerup', () => { wheelDrag = ''; });
$('colorPop').addEventListener('input', e => {
  const t = e.target, s = cp.spec;
  if (t.id === 'cpR' || t.id === 'cpG' || t.id === 'cpB') {
    const v = Math.round(Number(t.value));
    if (!Number.isFinite(v)) return;
    const rgb = s.rgb.slice(); rgb[{ cpR: 0, cpG: 1, cpB: 2 }[t.id]] = Math.max(0, Math.min(255, v));
    cpSetRgb(rgb);
  } else if (t.id === 'cpHex') { const rgb = hexToRgb(t.value); if (rgb) cpSetRgb(rgb); }
  else if (t.id === 'cpOp') { s.op = clamp01(Number(t.value)); cpWrite(); cpRender(); }
  else if (t.id === 'cpFade') { cp.fade = Number(t.value); cpWrite(); cpRender(); }
  else if (t.id === 'cpFadeNum') { const v = Number(t.value); if (Number.isFinite(v) && v >= 0) { cp.fade = Math.min(60, v); cpWrite(); $('cpFade').value = Math.min(10, cp.fade); } }
});
$('colorPop').addEventListener('change', e => {
  const t = e.target, s = cp.spec;
  if (t.id === 'cpCopy') { s.copy = t.checked ? (s.copy || (cp.id === 1 ? 2 : 1)) : 0; if (t.checked) s.player = 0; }
  else if (t.id === 'cpBlend') s.blend = t.checked;
  else if (t.id === 'cpP1' || t.id === 'cpP2') { s.player = t.checked ? (t.id === 'cpP1' ? 1 : 2) : 0; if (t.checked) s.copy = 0; }
  else if (t.id === 'cpCopyOp') s.copyOp = t.checked;
  else if (t.id === 'cpCopyId') { const id = chId(t.value); if (id && id !== cp.id) s.copy = id; }
  else if (t.id === 'cpTouch') { cp.touch = t.checked; if (t.checked) cp.spawn = false; }
  else if (t.id === 'cpSpawn') { cp.spawn = t.checked; if (t.checked) cp.touch = false; }
  else if (t.id === 'cpId') { cpSetChannel(t.value); return; }
  else if (t.id === 'cpR' || t.id === 'cpG' || t.id === 'cpB' || t.id === 'cpHex' || t.id === 'cpFadeNum') { cpRender(); return; }
  else return;
  cpWrite(); cpRender();
});
$('colorPop').addEventListener('click', e => {
  if (e.target.id === 'colorPop') { closeColorPop(); return; }
  const b = e.target.closest('button'); if (!b) return;
  const step = (id, dir) => { let n = id >= 1 && id <= 999 ? id + dir : dir > 0 ? 1 : 999; return n < 1 ? 999 : n > 999 ? 1 : n; };
  if (b.dataset.cpid) cpSetChannel(step(cp.id, Number(b.dataset.cpid)));
  else if (b.dataset.cpcopy) { cp.spec.copy = step(cp.spec.copy, Number(b.dataset.cpcopy)); if (cp.spec.copy === cp.id) cp.spec.copy = step(cp.spec.copy, Number(b.dataset.cpcopy)); cpWrite(); cpRender(); }
  else if (b.id === 'cpPlus') cpSetChannel(nextFreeChannel());
  else if (b.id === 'cpOk') closeColorPop();
  else if (b.id === 'cpCopyBtn') { cpClip = { spec: cloneSpec(cp.spec), fade: cp.fade }; toast('Color copied.'); cpRender(); }
  else if (b.id === 'cpPaste' && cpClip) { cp.spec = cloneSpec(cpClip.spec); if (cp.mode === 'trigger') cp.fade = cpClip.fade; cp.hue = rgbToHsv(cp.spec.rgb)[0]; cpWrite(); cpRender(); }
  else if (b.id === 'cpDefault') { cp.spec = defaultSpec(cp.mode === 'trigger' ? 0 : cp.id); if (cp.mode === 'trigger') cp.fade = 0.5; cp.hue = rgbToHsv(cp.spec.rgb)[0]; cpWrite(); cpRender(); }
  else if (b.id === 'cpInfo') toast(cp.mode === 'trigger'
    ? 'When the ship passes this trigger (or touches it, with TOUCH TRIGGER), channel ' + chLabel(cp.id) + ' fades to this color over FADE TIME seconds. Every object using that channel changes with it.'
    : 'The color channel ' + chLabel(cp.id) + ' starts with in this level. Objects using it are drawn in this color until a color trigger changes it.');
});

// --- the alpha trigger window: group, fade time, opacity ---
const ap = { def: null, snap: '' };
function nextFreeGroup() {
  const used = new Set();
  for (const d of ed.level.objects) for (const g of ((optsOf(d) || {}).groups || [])) used.add(Number(g));
  for (let i = 1; i < 10000; i++) if (!used.has(i)) return i;
  return 1;
}
function alphaHTML() {
  const o = makeObject(ap.def);
  const n = ed.level.objects.filter(d => ((optsOf(d) || {}).groups || []).includes(o.group)).length;
  return `<div class="al-grid">
    <div class="al-row"><span class="gold">GROUP ID</span>
      <div class="cp-id"><button type="button" class="cp-arrow left" data-alg="-1" aria-label="Previous group"><svg aria-hidden="true"><use href="#i-tri"/></svg></button>
      <input class="gd-input" id="alGroup" type="number" min="0" max="9999" value="${o.group || ''}" placeholder="0" aria-label="Group ID">
      <button type="button" class="cp-arrow" data-alg="1" aria-label="Next group"><svg aria-hidden="true"><use href="#i-tri"/></svg></button></div>
      <button type="button" class="gd-btn small blue" id="alFree">NEXT FREE</button>
      <span class="al-note">${o.group ? n + ' OBJECT' + (n === 1 ? '' : 'S') + ' IN GROUP ' + o.group : 'NO GROUP YET'}</span></div>
    <div class="al-row"><span class="gold">FADE TIME:</span><input class="gd-input al-num" id="alFadeNum" type="number" min="0" step="0.05" value="${o.fadeTime}" aria-label="Fade time in seconds">
      <input type="range" class="gd-range al-range" id="alFade" min="0" max="10" step="0.05" value="${Math.min(10, o.fadeTime)}" aria-label="Fade time"></div>
    <div class="al-row"><span class="gold">OPACITY:</span><input class="gd-input al-num" id="alOpNum" type="number" min="0" max="1" step="0.01" value="${o.opacity}" aria-label="Opacity">
      <input type="range" class="gd-range al-range" id="alOp" min="0" max="1" step="0.01" value="${o.opacity}" aria-label="Opacity"></div>
    <div class="al-row"><label class="gd-toggle"><input type="checkbox" class="gd-check" id="alTouch"${o.touch ? ' checked' : ''}> TOUCH TRIGGER</label>
      <label class="gd-toggle"><input type="checkbox" class="gd-check" id="alSpawn"${o.spawn ? ' checked' : ''}> SPAWN TRIGGER</label></div>
    <p>When the ship passes this trigger, every object in the group fades to this opacity. To put objects in a group, select them and type the number in GROUPS.</p>
  </div>`;
}
function openAlphaEditor(d) {
  ap.def = d; ap.snap = snapshot();
  showModal('ALPHA TRIGGER', alphaHTML(), [{ label: 'OK', primary: true, fn: hideModal }], 'alpha');
  modalOnClose = () => {
    if (snapshot() !== ap.snap) { ed.undo.push(ap.snap); if (ed.undo.length > 200) ed.undo.shift(); ed.redo = []; }
    edChanged(); edRenderUI();
  };
}
function alWrite(fromRange) {
  const d = ap.def, old = optsOf(d) || {}, op = {};
  const g = Math.max(0, Math.min(9999, Math.round(Number($('alGroup').value) || 0)));
  const fade = Math.max(0, Number(fromRange ? $('alFade').value : $('alFadeNum').value) || 0);
  const opac = clamp01(Number(fromRange ? $('alOp').value : $('alOpNum').value));
  if (g) op.group = g;
  op.opacity = round3(Number.isFinite(opac) ? opac : 1);
  if (fade !== 0.5) op.fade = round3(fade);
  if ($('alTouch').checked) op.touch = true;
  if ($('alSpawn').checked) op.spawn = true;
  if (old.groups) op.groups = old.groups;
  if (optsOf(d)) d.pop();
  d.push(op);
  edRebuild(); edRequestDraw();
}
$('modalBody').addEventListener('input', e => {
  if (modalKind !== 'alpha') return;
  const t = e.target;
  if (t.id === 'alFade') $('alFadeNum').value = t.value;
  else if (t.id === 'alOp') $('alOpNum').value = t.value;
  else if (t.id === 'alFadeNum') $('alFade').value = Math.min(10, Number(t.value) || 0);
  else if (t.id === 'alOpNum') $('alOp').value = clamp01(Number(t.value) || 0);
  else return;
  alWrite(t.type === 'range');
});
function alNote() {
  const g = Math.round(Number($('alGroup').value) || 0);
  const n = ed.level.objects.filter(d => ((optsOf(d) || {}).groups || []).includes(g)).length;
  $('modalBody').querySelector('.al-note').textContent = g ? n + ' OBJECT' + (n === 1 ? '' : 'S') + ' IN GROUP ' + g : 'NO GROUP YET';
}
$('modalBody').addEventListener('change', e => {
  if (modalKind !== 'alpha' || !e.target.isConnected) return;
  if (e.target.id === 'alSpawn' && e.target.checked) $('alTouch').checked = false;
  if (e.target.id === 'alTouch' && e.target.checked) $('alSpawn').checked = false;
  alWrite(false);
  alNote();
});
$('modalBody').addEventListener('click', e => {
  if (modalKind !== 'alpha') return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.alg) $('alGroup').value = Math.max(0, (Number($('alGroup').value) || 0) + Number(b.dataset.alg));
  else if (b.id === 'alFree') $('alGroup').value = nextFreeGroup();
  else return;
  alWrite(false);
  alNote();
});
// double-click a trigger in Edit mode to open it
edCanvas.addEventListener('dblclick', e => {
  if (ed.mode !== 'edit') return;
  const p = edPoint(e), d = edPick(p.wx, p.wy);
  if (d && isTrigger(d[0])) { ed.sel = new Set([d]); edSelChanged(); openTriggerEditor(d); }
});

// level settings popup
// one of your pictures if it loaded, otherwise a drawn stand-in
function picHTML(key, fallback, alt) {
  return IMG[key] ? `<img src="${esc(IMG[key].src)}" alt="${esc(alt)}">` : `<svg aria-hidden="true"><use href="#${fallback}"/></svg>`;
}
function settingsHTML() {
  const L = ed.level, auto = !(L.end > 0), cols = levelEndCol(L);
  return `<div class="lv-grid">
    <div class="lv-side">
      <span class="gold">SPEED:</span>${picHTML('speed_normal', 'i-play', 'Normal speed')}<span class="o">NORMAL</span>
      <span class="gold">MODE:</span>${picHTML('ship', 'i-play', 'Ship')}<span class="o">SHIP</span>
    </div>
    <div class="lv-main">
      ${field('NAME', `<input class="gd-input" type="text" id="lvName" value="${esc(L.name)}" maxlength="40">`)}
      <label class="gd-toggle"><input type="checkbox" class="gd-check" id="lvRand"${L.randomizer ? ' checked' : ''}> USE IN RANDOM RUNS</label>
      <label class="gd-toggle"><input type="checkbox" class="gd-check" id="lvAuto"${auto ? ' checked' : ''}> END LINE AFTER THE LAST OBJECT</label>
      ${auto ? '' : field('END COLUMN', `<input class="gd-input" type="number" id="lvEnd" min="10" step="1" value="${L.end}">`)}
      <div class="field wide"><span class="field-label">COLORS (CLICK ONE TO CHANGE IT)</span>
        <div class="ch-row">${[CH.BG, CH.GROUND, CH.LINE, CH.OBJ].map(id => { const c = ed.cs.resolve(id, 0);
          return `<button type="button" class="chp-btn" data-lvch="${id}"><span class="ch-sw" style="background:${cssOf(c)}"></span><span class="ch-name">${chLabel(id)}</span></button>`; }).join('')}
          <button class="gd-btn small gray" type="button" id="lvChannels">CHANNELS 1-999</button></div></div>
      <p class="stats-line">${L.objects.length} OBJECTS · ${cols} COLUMNS · ${(cols / speed_lookup.normal).toFixed(1)} S</p>
      ${ed.warnings.length ? `<ul class="warn-list">${ed.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="ok-line">READY FOR RANDOM RUNS</p>'}
      <button class="gd-btn red small center" id="lvClear" type="button">CLEAR ALL OBJECTS</button>
    </div>
  </div>`;
}
function edOpenSettings() {
  showModal('LEVEL SETTINGS', settingsHTML(), [{ label: 'OK', primary: true, fn: hideModal }], 'settings', true);
}
function refreshSettings() {
  if (modalKind === 'settings' && !$('modal').hidden) $('modalBody').innerHTML = settingsHTML();
}
$('modalBody').addEventListener('change', e => {
  if (modalKind !== 'settings' || !ed.level) return;
  const t = e.target;
  if (t.id === 'lvRand') { ed.level.randomizer = t.checked; saveLevels(); }
  else if (t.id === 'lvAuto') { ed.level.end = t.checked ? null : autoEndCol(ed.level.objects); edChanged(); refreshSettings(); }
  else if (t.id === 'lvEnd') { const v = Math.round(Number(t.value)); if (v >= 10) { ed.level.end = v; edChanged(); } refreshSettings(); }
});
$('modalBody').addEventListener('input', e => {
  if (modalKind !== 'settings' || !ed.level || e.target.id !== 'lvName') return;
  ed.level.name = e.target.value.trim() || 'Untitled';
  $('edName').textContent = ed.level.name;
  saveLevelsSoon();
});
$('modalBody').addEventListener('click', e => {
  if (modalKind !== 'settings') return;
  const ch = e.target.closest('[data-lvch]');
  if (ch) { openColorPop({ mode: 'channel', id: Number(ch.dataset.lvch), back: 'settings' }); return; }
  if (e.target.closest('#lvChannels')) { openChannelPicker('level'); return; }
  const b = e.target.closest('#lvClear');
  if (!b) return;
  armConfirm(b, 'CLICK AGAIN TO CLEAR', () => { edChange(() => { ed.level.objects = []; ed.sel.clear(); }); refreshSettings(); edRenderUI(); });
});

function edOpenHelp() {
  showModal('EDITOR KEYS', `<dl class="keys-list">
      <dt>CLICK / DRAG</dt><dd>Place objects (Create), select (Edit), erase (Delete), look around (View)</dd>
      <dt>1 / 2 / 3 / 4</dt><dd>Create, Edit, Delete or View mode</dd>
      <dt>WASD / ARROWS</dt><dd>Move the selection one square. Hold Shift for 1/15 of a square. With nothing selected they scroll.</dd>
      <dt>Q / E / F</dt><dd>Turn left, turn right, turn around</dd>
      <dt>EDIT BUTTONS</dt><dd>In Edit mode the bottom bar moves by 1 block, half, 1/15, one pixel or 1/30, and flips the selection</dd>
      <dt>SHIFT + CLICK</dt><dd>Add to the selection</dd>
      <dt>DOUBLE-CLICK</dt><dd>Open a color or alpha trigger (Edit mode). Or select it and press EDIT TRIGGER.</dd>
      <dt>CTRL + C / V / D</dt><dd>Copy, paste in the middle of the screen, copy + paste in place</dd>
      <dt>CTRL + A</dt><dd>Select everything</dd>
      <dt>CTRL + Z / Y</dt><dd>Undo, redo</dd>
      <dt>CTRL + S</dt><dd>Save</dd>
      <dt>DELETE</dt><dd>Delete the selection</dd>
      <dt>MOUSE WHEEL</dt><dd>Scroll left and right (Ctrl: zoom)</dd>
      <dt>RIGHT-DRAG</dt><dd>Move the view (or hold Space and drag)</dd>
      <dt>ENTER</dt><dd>Test from the start (Shift: from here)</dd>
      <dt>H</dt><dd>Show hitboxes</dd>
      <dt>ESC</dt><dd>Deselect, then the pause menu</dd>
    </dl>
    <p>Placing an object selects it, so you can nudge it right away. On a Mac, use Cmd instead of Ctrl.</p>`, [{ label: 'OK', primary: true, fn: hideModal }]);
}

// --- object bar ---
// Tabs show a picture of one of their objects, like the Geometry Dash editor
function renderPaletteTabs() {
  const box = $('palTabs');
  box.innerHTML = PALETTE.map((g, i) => `<button class="tab" data-g="${i}" aria-pressed="${i === ed.group}" title="${g.name}" aria-label="${g.name}"><canvas></canvas></button>`).join('');
  box.querySelectorAll('canvas').forEach((cv, i) => {
    const g = PALETTE[i];
    drawIcon(cv, g.items[g.name === 'PORTALS' || g.name === 'SPECIAL' ? 2 : g.name === 'DECO' ? Math.min(30, g.items.length - 1) : g.name === 'SLOPES' ? Math.min(14, g.items.length - 1) : 0], 30);
  });
}
// How many objects fit on one page of the object bar (2 rows, as many columns as fit)
function palPerPage() {
  const small = innerWidth <= 700, cell = small ? 55 : 69;
  const avail = ($('edBuildTab').parentElement.clientWidth || 700) - (small ? 76 : 110);
  const cols = Math.max(3, Math.floor(avail / cell));
  return { cols, per: cols * 2 };
}
function edGroup(i, page = 0) {
  ed.group = (i + PALETTE.length) % PALETTE.length;
  ed.page = page;
  renderPaletteTabs(); renderPalette();
  if (ed.mode !== 'build') setMode('build');
}
// The blue arrows flip through the pages of a tab, then on to the next tab
function edPage(dir) {
  const { per } = palPerPage(), pages = Math.ceil(PALETTE[ed.group].items.length / per);
  const p = ed.page + dir;
  if (p >= 0 && p < pages) { ed.page = p; renderPalette(); return; }
  const gi = (ed.group + dir + PALETTE.length) % PALETTE.length;
  edGroup(gi, dir < 0 ? Math.ceil(PALETTE[gi].items.length / per) - 1 : 0);
}
function renderPalette() {
  const grp = PALETTE[ed.group];
  const box = $('palItems');
  const { cols, per } = palPerPage();
  const pages = Math.max(1, Math.ceil(grp.items.length / per));
  ed.page = Math.min(Math.max(0, ed.page), pages - 1);
  const items = grp.items.slice(ed.page * per, ed.page * per + per);
  box.innerHTML = '';
  box.style.setProperty('--cols', Math.min(cols, items.length));
  const brushKey = JSON.stringify(ed.brush);
  for (const tpl of items) {
    const btn = document.createElement('button');
    btn.className = 'pal-item';
    btn.setAttribute('aria-pressed', String(JSON.stringify(tpl) === brushKey));
    btn.title = itemLabel(tpl);
    btn.setAttribute('aria-label', itemLabel(tpl));
    const cv = document.createElement('canvas');
    btn.appendChild(cv);
    btn.addEventListener('click', () => { ed.brush = tpl; if (ed.mode !== 'build') setMode('build'); renderPalette(); });
    box.appendChild(btn);
    drawIcon(cv, tpl);
  }
  $('palName').textContent = grp.name + (pages > 1 ? ` ${ed.page + 1}/${pages}` : '') + ' · ' + itemLabel(ed.brush).toUpperCase();
  $('sawSizeWrap').hidden = ed.brush[0] !== 'Saw';
  $('sawSize').value = String(ed.sawSize);
  $('sawSizeVal').textContent = ed.sawSize.toFixed(2) + '×';
}
function drawIcon(cv, tpl, size = 46) {
  const dpr = sizeCanvas(cv, size, size), ctx = cv.getContext('2d');
  const [t, v] = tpl;
  let def;
  if (isFlippable(t)) def = [t, 1, 1, ed.rot, v];
  else if (isRotatable(t)) def = v ? [t, 1, 1, ed.rot, v] : [t, 1, 1, ed.rot];
  else if (t === 'TelePortal') def = [t, 1, 1, 3.5];
  else if (t === 'Saw') def = v ? [t, 1, 1, 1, v] : [t, 1, 1, 1];
  else if (PORTALS[t]) def = [t, 1, 1, v];
  else def = [t, 1, 1];
  const o = makeObject(def);
  if (t === 'Saw') o.spin = 10;
  let b = objBounds(o);
  if (t === 'Saw') { const r = sawRadius(o); b = { x0: o.cx - r, x1: o.cx + r, y0: o.cy - r, y1: o.cy + r }; }
  if (t === 'ThornPit') b = { x0: o.x, x1: o.x + gridSize, y0: o.imgY - gridSize / 2, y1: o.imgY + gridSize / 2 };
  const fit = size * 0.83, bw = b.x1 - b.x0, bh = b.y1 - b.y0, s = Math.min(fit / bw, fit / bh, size / 25);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (size / 2 - (b.x0 + bw / 2) * s), dpr * (size / 2 - (b.y0 + bh / 2) * s));
  drawObject(ctx, o);
}
$('palTabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if (!b) return;
  edGroup(Number(b.dataset.g));
});
$('palPrev').addEventListener('click', () => edPage(-1));
$('palNext').addEventListener('click', () => edPage(1));
// Saw size for the next saw you place (0.5x to 2x, the old middle saw is 1x).
// Selected saws (like the one you just placed) change size with it as it moves.
$('sawSize').addEventListener('input', e => {
  ed.sawSize = Math.min(SAW_MAX, Math.max(SAW_MIN, Number(e.target.value) || 1));
  $('sawSizeVal').textContent = ed.sawSize.toFixed(2) + '×';
  sawLive(ed.sawSize);
  edRequestDraw();
});
$('sawSize').addEventListener('change', e => { e.target.blur(); sawLiveEnd(); });
$('sawSize').addEventListener('pointerup', e => e.target.blur());
// --- the Edit tab (bottom bar in Edit mode) ---
const MOVE_STEPS = [
  { step: 1, label: '1 BLOCK', size: 1 },
  { step: 1 / 2, label: 'HALF', size: 0.86 },
  { step: 1 / 15, label: '1/15', size: 0.74 },
  { step: 1 / 20, label: 'PIXEL', size: 0.64 },
  { step: 1 / 30, label: '1/30', size: 0.54 },
];
function renderMoveButtons() {
  $('edMoves').innerHTML = MOVE_STEPS.map((m, i) => `<div class="move-group" style="--as:${m.size}">
      <span class="move-label">${m.label}</span>
      <div class="move-pad">${['up', 'left', 'right', 'down'].map(dir =>
        `<button class="gd-btn mv ${dir}" data-step="${i}" data-dir="${dir}" aria-label="Move ${dir}, ${m.label.toLowerCase()}"><svg aria-hidden="true"><use href="#i-arrow"/></svg></button>`).join('')}</div>
    </div>`).join('');
}
function showModeTab() {
  $('edBuildTab').hidden = ed.mode !== 'build';
  $('edEditTab').hidden = ed.mode !== 'edit';
  $('edDeleteTab').hidden = ed.mode !== 'delete';
  $('edViewTab').hidden = ed.mode !== 'view';
  $('palTabs').style.visibility = ed.mode === 'build' ? '' : 'hidden';
  $('palName').hidden = $('rotVal').hidden = ed.mode !== 'build';
}
$('edEditTab').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.dir) {
    const s = MOVE_STEPS[Number(b.dataset.step)].step;
    const v = { up: [0, s], down: [0, -s], left: [-s, 0], right: [s, 0] }[b.dataset.dir];
    edMoveSel(v[0], v[1]);
    return;
  }
  edAction(b.dataset.act);
});
function edAction(act) {
  if (act === 'rotL') edRotate(90);
  else if (act === 'rotR') edRotate(-90);
  else if (act === 'flip') edRotate(180);
  else if (act === 'flipX') edFlip('x');
  else if (act === 'flipY') edFlip('y');
  else if (act === 'copy') edCopy();
  else if (act === 'paste') edPaste();
  else if (act === 'dup') edDuplicate();
  else if (act === 'selall') edSelectWhere(() => true);
  else if (act === 'deselect') edDeselect();
  else if (act === 'del') edDeleteSel();
}
$('edActions').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) edAction(b.dataset.act); });
$('edToggles').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act) { edAction(b.dataset.act); return; }
  const k = b.dataset.tog;
  settings[k] = !settings[k]; saveSettings(); edRenderUI();
  const names = { swipe: 'Swipe', freeMove: 'Free move', snap: 'Snap' };
  toast(`${names[k]} ${settings[k] ? 'on' : 'off'}.`);
});

// --- the editor's pause menu (Esc, or the pause button) ---
function lengthName(sec) { return sec < 10 ? 'TINY' : sec < 30 ? 'SHORT' : sec < 60 ? 'MEDIUM' : sec < 120 ? 'LONG' : 'XL'; }
function edOpenPause() {
  if (!ed.level) return;
  ed.paused = true;
  ed.drag = null; ed.spaceDown = false; delete edCanvas.dataset.pan;
  const cols = levelEndCol(ed.level), sec = cols / speed_lookup.normal;
  $('pzStats').innerHTML = `<span>OBJECTS: ${ed.level.objects.length}${ed.sel.size ? ' | SELECTED: ' + ed.sel.size : ''}</span>
    <span>LENGTH: ${Math.round(sec)} SECONDS (${lengthName(sec)})</span>
    <span>${edDirty() ? 'NOT SAVED YET' : 'SAVED'}</span>`;
  document.querySelectorAll('#edPause [data-pref]').forEach(c => { c.checked = !!settings[c.dataset.pref]; });
  $('edPause').hidden = false;
  fitText($('edPause'));
}
function edClosePause() { ed.paused = false; $('edPause').hidden = true; }
function edSave() {
  saveLevels();
  ed.saved = levelState(ed.level);
  toast('Saved.');
}
function edLeave() { edClosePause(); showScreen('levels'); }
$('edPause').addEventListener('change', e => {
  const c = e.target.closest('[data-pref]'); if (!c) return;
  settings[c.dataset.pref] = c.checked; saveSettings();
  edRenderUI(); edRequestDraw();
});
$('edPause').addEventListener('click', e => {
  const b = e.target.closest('[data-pz]'); if (!b) return;
  const a = b.dataset.pz;
  const view = () => { const x0 = ed.cam.x, x1 = ed.cam.x + ed.css.w / ed.cam.scale; return (x0 + x1) / 2 / gridSize + 0.5; };
  if (a === 'resume') edClosePause();
  else if (a === 'save') { edSave(); edOpenPause(); }
  else if (a === 'saveexit') { edSave(); edLeave(); }
  else if (a === 'saveplay') { edSave(); edClosePause(); startPlay('practice', { level: ed.level, returnTo: 'levels' }); }
  else if (a === 'exit') {
    if (!edDirty()) { edLeave(); return; }
    armConfirm(b.querySelector('.gold'), 'EXIT WITHOUT SAVING?', () => {
      const st = JSON.parse(ed.saved);
      Object.assign(ed.level, st);
      saveLevels(); ed.level = null; edLeave();
      toast('Left without saving. Changes since the last save were thrown away.');
    });
  }
  else if (a === 'resetscroll') { ed.camSet = false; edResize(); edClampCam(); edClosePause(); }
  else if (a === 'keys') edOpenHelp();
  else if (a === 'settings') edOpenSettings();
  else if (a === 'selall') { edSelectWhere(() => true); edClosePause(); }
  else if (a === 'selleft') { const c = view(); edSelectWhere(d => d[1] < c); edClosePause(); }
  else if (a === 'selright') { const c = view(); edSelectWhere(d => d[1] >= c); edClosePause(); }
  else if (a === 'alignx') { edAlign('x'); edOpenPause(); }
  else if (a === 'aligny') { edAlign('y'); edOpenPause(); }
  else if (a === 'cleartrail') { ed.trail = null; edRequestDraw(); toast('Test path cleared.'); }
  else if (a === 'code') showTextModal('LEVEL CODE', `Anyone can add "${ed.level.name}" to their editor with Paste level code.`, levelCodeText(ed.level), false);
});


// ===== 11. MENUS AND START-UP ==============================================

let screen = 'menu';
function showScreen(name) {
  if ((name === 'levels' || name === 'editor') && !settings.editorMode) name = 'menu';   // editor is locked
  screen = name;
  document.body.dataset.screen = name;
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.id !== 'scr-' + name; });
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  upInput = false;
  if (name === 'menu') { renderMenuNote(); $('btnEditor').hidden = !settings.editorMode; }
  if (name === 'play') requestAnimationFrame(fitGameCanvas);
  if (name === 'practice') renderPractice();
  if (name === 'levels') renderLevelList();
  if (name === 'editor') requestAnimationFrame(() => { edResize(); renderPalette(); edRenderUI(); });
  requestAnimationFrame(() => { fitTitle(); fitText(); });
}

// Shrinks text marked data-fit until it fits its box (Pusab is a wide font)
function fitText(root = document) {
  root.querySelectorAll('[data-fit]').forEach(el => {
    if (!el.getClientRects().length) return;
    el.style.fontSize = '';
    const parent = el.parentElement, cs = getComputedStyle(parent);
    const avail = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let size = parseFloat(getComputedStyle(el).fontSize), n = 0;
    while (el.offsetWidth > avail && size > 9 && n++ < 40) { size *= 0.93; el.style.fontSize = size + 'px'; }
  });
}
// Fits the title's viewBox around the real width of the text
function fitTitle() {
  const svg = $('titleSvg');
  if (!svg || !svg.getClientRects().length) return;
  try {
    const b = svg.querySelector('.title-main').getBBox();
    if (!b.width) return;
    const pad = 26;
    svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2 + 10} ${b.height + pad * 2 + 14}`);
  } catch (e) { /* not drawn yet */ }
}
function afterFont() {
  fitTitle();
  fitText();
  renderPalette();
  edRequestDraw();
  if (!gdFont && !fontWarned) {
    fontWarned = true;
    toast('The Pusab font did not load. Put PUSAB_____.ttf in the same folder as index.html.');
  }
}

function renderMenuNote() {
  const n = randomizerPool().length;
  let note = n
    ? `${n} level${n === 1 ? '' : 's'} in the random pool. Each run plays ${Math.min(n, LEVELS_PER_RUN)} of them in a random order.`
    : 'No levels in the random pool yet. Make some in the editor.';
  if (usingLocal) note += ' You are playing the levels you edited in this browser.';
  $('menuNote').textContent = note;
}

function levelMeta(L) {
  const cols = levelEndCol(L);
  const coins = L.objects.filter(d => d[0] === 'Coin');
  const got = coins.filter(d => coinSaved(L.id, getArg(d, 1) + ',' + getArg(d, 2))).length;
  const dots = coins.length ? ` · COINS ${coins.map((d, i) => `<i class="coin-dot${i < got ? ' got' : ''}"></i>`).join('')}` : '';
  return `${L.objects.length} OBJECTS · ${cols} COLUMNS · ${(cols / speed_lookup.normal).toFixed(1)} S${dots}`;
}

function renderPractice() {
  const box = $('practiceList');
  if (!levels.length) { box.innerHTML = '<p class="gd-empty">There are no levels yet.</p>'; return; }
  box.innerHTML = levels.map((L, i) => `<div class="gd-row">
      <div class="gd-row-main"><span class="gd-row-name">${esc(L.name)}</span><span class="gd-row-meta">${levelMeta(L)}</span></div>
      <div class="gd-row-actions"><button class="gd-btn" data-play="${i}">PLAY</button></div>
    </div>`).join('');
}
$('practiceList').addEventListener('click', e => {
  const b = e.target.closest('[data-play]'); if (!b) return;
  startPlay('practice', { level: levels[Number(b.dataset.play)], returnTo: 'practice' });
});

function renderLevelList() {
  const st = $('publishStatus');
  st.textContent = usingLocal ? 'SOME LEVELS ARE NOT ON YOUR WEBSITE YET' : 'EVERYTHING MATCHES YOUR WEBSITE';
  st.dataset.state = usingLocal ? 'changed' : 'same';
  $('btnResetSite').hidden = !usingLocal;
  const box = $('levelList');
  if (!levels.length) { box.innerHTML = '<p class="gd-empty">No levels yet. Click + NEW to make one.</p>'; return; }
  box.innerHTML = levels.map((L, i) => `<div class="gd-row" data-i="${i}">
      <div class="gd-row-main">
        <span class="gd-row-name">${esc(L.name)}</span>
        <span class="gd-row-meta">${levelMeta(L)}</span>
        <label class="gd-toggle"><input type="checkbox" class="gd-check" data-rand="${i}"${L.randomizer ? ' checked' : ''}> RANDOM RUNS</label>
      </div>
      <div class="gd-row-actions">
        <button class="gd-btn" data-act="edit">EDIT</button>
        <button class="gd-btn blue" data-act="play">PLAY</button>
        <button class="gd-btn gray small" data-act="code">CODE</button>
        <button class="gd-btn gray small" data-act="dup">COPY</button>
        <button class="gd-btn red small" data-act="del">DELETE</button>
      </div>
    </div>`).join('');
}
$('levelList').addEventListener('change', e => {
  const t = e.target; if (!t.dataset.rand) return;
  levels[Number(t.dataset.rand)].randomizer = t.checked; saveLevels(); renderLevelList();
});
$('levelList').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const i = Number(b.closest('.gd-row').dataset.i), L = levels[i];
  const act = b.dataset.act;
  if (act === 'edit') edOpen(L);
  else if (act === 'play') startPlay('practice', { level: L, returnTo: 'levels' });
  else if (act === 'code') showTextModal('LEVEL CODE', `Anyone can add "${L.name}" to their editor with Paste level code.`, levelCodeText(L), false);
  else if (act === 'dup') { const c = clone(L); c.id = newId(); c.name = L.name + ' copy'; levels.splice(i + 1, 0, c); saveLevels(); renderLevelList(); }
  else if (act === 'del') armConfirm(b, 'SURE?', () => { levels.splice(i, 1); saveLevels(); renderLevelList(); toast('Deleted ' + L.name + '.'); });
});

$('btnNewLevel').addEventListener('click', () => {
  const L = { id: newId(), name: 'New level ' + (levels.length + 1), randomizer: true, end: null, objects: [] };
  levels.push(L); saveLevels(); edOpen(L);
});
$('btnExport').addEventListener('click', () => {
  saveLevels();
  showTextModal('LEVELS.JS', 'This file holds every level. Upload it to your website and replace the old levels.js.', levelsFileText(levels), true);
});
$('btnImportFile').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { const res = addLevels(parseLevelsText(r.result)); toast(`Imported: ${res.added} new, ${res.replaced} updated.`); renderLevelList(); }
    catch (err) { toast(err.message); }
  };
  r.readAsText(f);
  e.target.value = '';
});
$('btnPasteCode').addEventListener('click', () => {
  showModal('PASTE LEVEL CODE', `<p>Paste one level's code, or a whole levels.js file.</p><textarea id="pasteArea" rows="8" spellcheck="false" aria-label="Level code"></textarea>`, [
    { label: 'ADD LEVELS', primary: true, fn: () => {
      try { const res = addLevels(parseLevelsText($('pasteArea').value)); hideModal(); renderLevelList(); toast(`Added ${res.added}, updated ${res.replaced}.`); }
      catch (err) { toast(err.message || 'That is not level code.'); }
    } },
    { label: 'CANCEL', fn: hideModal },
  ]);
  setTimeout(() => $('pasteArea').focus(), 30);
});
$('btnResetSite').addEventListener('click', e => armConfirm(e.currentTarget, 'CLICK AGAIN: EDITS WILL BE LOST', () => {
  levels = clone(SITE_LEVELS).map(cleanLevel); ed.level = null; saveLevels(); renderLevelList(); toast('Back to the website’s levels.');
}));

function showTextModal(title, text, body, isFile) {
  const btns = [];
  if (isFile) btns.push({ label: 'DOWNLOAD', primary: true, fn: () => downloadText('levels.js', body) });
  btns.push({ label: 'COPY TEXT', primary: !isFile, fn: () => copyText(body, $('modalText')) });
  btns.push({ label: 'CLOSE', fn: hideModal });
  showModal(title, `<p>${esc(text)}</p><textarea id="modalText" rows="9" readonly spellcheck="false" aria-label="${esc(title)}">${esc(body)}</textarea>`, btns);
}

let modalKind = '', modalOnClose = null;      // modalOnClose runs once when the popup closes
function showModal(title, html, buttons, kind = '', wide = false) {
  if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
  modalKind = kind;
  document.querySelector('.gd-pop').classList.toggle('wide', wide);
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  const row = $('modalButtons'); row.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'gd-btn' + (b.primary ? '' : ' gray');
    el.textContent = b.label; el.addEventListener('click', b.fn);
    row.appendChild(el);
  }
  $('modal').hidden = false;
  fitText($('modal'));
}
function hideModal() {
  $('modal').hidden = true; modalKind = '';
  if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
}
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') hideModal(); });

function armConfirm(btn, label, fn) {
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; fn(); return; }
  const old = btn.textContent;
  btn.dataset.armed = '1'; btn.textContent = label;
  setTimeout(() => { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = old; } }, 3000);
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}

// --- the Settings menu ---
const GAME_SETTINGS = [
  ['editorMode', 'DEV MODE', 'Unlocks the level editor, noclip and hitboxes. Until it is on, they are hidden and cannot be used.'],
  ['showProgress', 'PROGRESS BAR', 'The bar at the top while you play.'],
  ['showPercent', 'PERCENTAGE', 'The number next to the progress bar.'],
  ['showAttempts', 'ATTEMPT COUNTER', 'The "Attempt 3" text at the start of each try.'],
  ['showLevelName', 'LEVEL NAME', 'The level name in the top-left corner while you play.'],
];
// Graphics: which art to use, and how sharp (bigger sheets look sharper but take longer to load)
const CHOICES = [
  ['art', 'ART', [['gd', 'GEOMETRY DASH'], ['mine', 'MY PICTURES']], 'Geometry Dash uses the official sprite sheets. My pictures uses your own picture files.'],
  ['quality', 'GRAPHICS', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], 'Low loads fastest. High is sharpest but downloads the biggest pictures.'],
];
function choicesHTML() {
  return CHOICES.map(([k, name, opts, desc]) => `<div class="set-row choice-row">
      <span class="set-name">${name}</span>
      <div class="seg" role="group" aria-label="${name}">${opts.map(([v, label]) =>
        `<button type="button" class="gd-btn small${settings[k] === v ? '' : ' gray'}" data-choice="${k}" data-v="${v}" aria-pressed="${settings[k] === v}">${label}</button>`).join('')}</div>
      <span class="set-desc">${esc(desc)}${k === 'quality' && settings.art !== 'gd' ? ' (Only used with Geometry Dash art.)' : ''}</span>
    </div>`).join('');
}
$('modalBody').addEventListener('click', e => {
  const b = e.target.closest('[data-choice]');
  if (!b || modalKind !== 'game') return;
  settings[b.dataset.choice] = b.dataset.v; saveSettings();
  loadSprites();
  $('modalBody').querySelector('.set-list.choices').innerHTML = choicesHTML();
  toast(settings.art === 'gd' ? `Geometry Dash art, ${settings.quality} graphics.` : 'Using your own pictures.');
});
function showGameSettings() {
  showModal('SETTINGS', `<div class="set-list choices">${choicesHTML()}</div><div class="set-list">${GAME_SETTINGS.map(([k, name, desc]) => `<label class="set-row">
      <input type="checkbox" class="gd-check" data-set="${k}"${settings[k] ? ' checked' : ''}>
      <span class="set-name">${name}</span><span class="set-desc">${esc(desc)}</span>
    </label>`).join('')}</div>
    <p>These settings are saved in this browser only.</p>`, [{ label: 'OK', primary: true, fn: hideModal }], 'game');
}
$('modalBody').addEventListener('change', e => {
  const c = e.target.closest('[data-set]');
  if (!c || modalKind !== 'game') return;
  settings[c.dataset.set] = c.checked; saveSettings();
  if (c.dataset.set === 'editorMode') {
    $('btnEditor').hidden = !settings.editorMode;
    if (!settings.editorMode) { noClip = false; game.showHitboxes = false; }
    toast(settings.editorMode ? 'Dev mode on. The EDITOR button is on the main menu.' : 'Dev mode off. The editor, noclip and hitboxes are hidden.');
    requestAnimationFrame(() => fitText());
  }
});

function showHowToPlay() {
  showModal('HOW TO PLAY', `<dl class="keys-list">
      <dt>SPACE / UP / CLICK</dt><dd>Hold to fly up. Let go to fall.</dd>
      <dt>ESC</dt><dd>Pause.</dd>
${settings.editorMode ? `      <dt>I</dt><dd>Noclip (Practice and editor tests only).</dd>
      <dt>H</dt><dd>Show hitboxes (Practice and editor tests only).</dd>
` : ''}    </dl>
    <p>A run is ${LEVELS_PER_RUN} random levels back to back. Crash once and a new run starts with new levels.</p>`,
    [{ label: 'OK', primary: true, fn: hideModal }]);
}

// buttons
$('btnPlay').addEventListener('click', startRun);
$('btnPractice').addEventListener('click', () => showScreen('practice'));
$('btnEditor').addEventListener('click', () => showScreen('levels'));
$('btnHelp').addEventListener('click', showHowToPlay);
$('btnSettings').addEventListener('click', showGameSettings);
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.go)));
$('btnPause').addEventListener('click', pauseGame);
$('edPauseBtn').addEventListener('click', edOpenPause);
$('edTrash').addEventListener('click', edDeleteSel);
$('edModes').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });
$('edUndo').addEventListener('click', edUndo);
$('edRedo').addEventListener('click', edRedo);
$('edZoomIn').addEventListener('click', () => edZoom(1.25));
$('edZoomOut').addEventListener('click', () => edZoom(0.8));
$('edHitboxes').addEventListener('click', toggleEdHitboxes);
$('edTest').addEventListener('click', () => edTest(false));
$('edTestHere').addEventListener('click', () => edTest(true));
$('edSettings').addEventListener('click', edOpenSettings);
$('edWarn').addEventListener('click', edOpenSettings);
$('edScroll').addEventListener('input', e => { ed.cam.x = Number(e.target.value); edRequestDraw(); });
// the slider must not keep the keyboard, or WASD / arrows would stop moving objects
$('edScroll').addEventListener('pointerup', e => e.target.blur());
$('edScroll').addEventListener('change', e => e.target.blur());

// input for flying (your onKeyPress / onKeyRelease / onMousePress / onMouseRelease)
window.addEventListener('keydown', e => {
  if (!$('colorPop').hidden) { if (e.key === 'Escape') closeColorPop(); return; }
  if (!$('modal').hidden) { if (e.key === 'Escape') hideModal(); return; }
  if (screen === 'play') {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat && !game.paused && !game.finished) { upInput = true; pressed = true; }
    } else if (e.code === 'Escape') {
      if (game.mode === 'test' || game.finished) leavePlay();
      else if (game.paused) resumeGame();
      else pauseGame();
    }
    else if (e.code === 'KeyI' && game.mode !== 'run' && settings.editorMode) { noClip = !noClip; updateHud(true); }
    else if (e.code === 'KeyH' && game.mode !== 'run' && settings.editorMode) game.showHitboxes = !game.showHitboxes;
    return;
  }
  if (screen === 'editor') { edKey(e); return; }
  if (e.key === 'Escape' && screen !== 'menu') showScreen('menu');
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') upInput = false;
  if (e.key === ' ') { ed.spaceDown = false; delete edCanvas.dataset.pan; }
});
$('stage').addEventListener('pointerdown', e => {
  if (e.target.closest('.overlay, .pause-btn')) return;
  if (game.paused || game.finished) return;
  e.preventDefault(); upInput = true; pressed = true;
});
window.addEventListener('pointerup', () => { if (screen === 'play') upInput = false; });
window.addEventListener('pointercancel', () => { upInput = false; });
window.addEventListener('blur', () => { upInput = false; ed.spaceDown = false; });

window.addEventListener('resize', () => {
  if (screen === 'play') fitGameCanvas();
  else if (screen === 'editor') { edResize(); renderPalette(); }
  fitTitle();
  fitText();
});

// main loop: fixed 45 steps per second, drawn every animation frame
let lastFrame = performance.now();
function frame(now) {
  const elapsed = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (screen === 'play') {
    if (!game.finished && !game.paused) {
      if (game.dead) {
        game.deathTimer -= elapsed;
        if (game.deathTimer <= 0) restart();
      } else {
        game.acc += elapsed;
        while (game.acc >= dt) {
          step();
          game.acc -= dt;
          if (game.dead || game.finished) { game.acc = 0; break; }
        }
      }
    }
    if (screen === 'play') drawGame();
  } else if (screen === 'editor' && ed.needsDraw) { ed.needsDraw = false; drawEditor(); }
  requestAnimationFrame(frame);
}

document.title = GAME_TITLE;
renderMoveButtons();
renderPaletteTabs();
renderPalette();
showScreen('menu');
loadGdFont();
loadSprites();
requestAnimationFrame(frame);
