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
  speed_half:    'speed-half.png',
  speed_normal:  'speed-normal.png',
  speed_double:  'speed-double.png',
  speed_triple:  'speed-triple.png',
  speed_quad:    'speed-quad.png',
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
const landSnap = 0.2 * gridSize;    // landing help: how close (above or just inside) a block top counts as landing on it
const screenHeight = 400;
let scrollX = 0;
const sawSpin = 1;
const velUnit = 60 * pxPerUnit;
// CMU used 2 squares. A 2x saw reaches 2 squares from its middle, so the game now
// looks 3 squares ahead and behind. Nothing smaller can touch the ship from 2+ away,
// so this changes nothing for every other object.
const nearRange = 3 * gridSize;
let pressed = false;
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
  pit_06: 0, pit_06_2: 0, pit_07: 0, pit_b_01: -0.225, pit_b_02: -0.033, pit_b_03: -0.225, pit_b_04: -0.542 };
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
// (0..1 inside the square, measured from the sprites: a line is 3 of 60 pixels, LW), and
// whether it fades like an outline spike. A box narrower than LINE_T from side to side is
// widened evenly around its middle: at quad speed the ship moves 8.5 pixels a step, and its
// 6 pixel inner hitbox could jump right over a thinner wall.
const LINE_T = 0.15, LW = 3 / 60;
const OUTLINE_PIECES = {
  1:  ['blockOutline_01_001', 0.5, [[0, 0, 1, 1]]],
  2:  ['blockOutline_02_001', 1 - 1.5 / 60, [[0, 1 - LW, 1, 1]]],
  3:  ['blockOutline_03_001', 0.5, [[0, 1 - LW, 1, 1], [0, 0, LW, 1 - LW]]],
  4:  ['blockOutline_04_001', 0.5, [[0, 1 - LW, 1, 1], [0, 0, LW, 1 - LW], [1 - LW, 0, 1, 1 - LW]]],
  5:  ['blockOutline_05_001', 0.5, [[0, 0, LW, 1]]],
  6:  ['blockOutline_06_001', 0.5, [[0, 1 - LW, LW, 1]]],
  7:  ['blockOutline_07_001', 0.5, [[0, 1 - 4 / 60, 4 / 60, 1]]],
  8:  ['blockOutline_08_001', 0.5, [[0, 1 - LW, 6 / 60, 1]]],
  9:  ['blockOutline_09_001', 1 - 1.5 / 60, [[0, 1 - LW, 1, 1]]],
  10: ['invisibleOutline_01_001', 1 - 1.5 / 60, [[0, 1 - LW, 1, 1]], true],
  11: ['invisibleOutline_b_01_001', 1 - 3 / 60, [[0, 1 - 2 * LW, 1, 1]], true],
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
        const line = { l: Math.min(pts[0][0], pts[1][0]), r: Math.max(pts[0][0], pts[1][0]), t: Math.min(pts[0][1], pts[1][1]), b: Math.max(pts[0][1], pts[1][1]) };
        const box = { ...line }, short = LINE_T * g - (box.r - box.l);
        if (short > 0) { box.l -= short / 2; box.r += short / 2; }
        return { box, line, poly: boxPoly(box.l, box.t, box.r, box.b) };     // line = the drawn line, box = its hitbox
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
  editGroupFields(o, op);
  return o;
}

// --- Edit Group settings: editor layers, drawing order, and the Extra tab ---
//   ["Block", 5, 3, {"editorL": 2, "zLayer": "T1", "zOrder": 3, "hide": true}]
// Objects with no hitbox (deco, slopes, grid blocks) start on editor layer 1,
// everything else on layer 0. A setting at its default is left out of levels.js.
const Z_LAYERS = ['B5', 'B4', 'B3', 'B2', 'B1', 'T1', 'T2', 'T3', 'T4'];
const Z_DEFAULT = 4, Z_FRONT = 5;      // no Z layer draws like B1; T1 and up are drawn over the ship
const EDITOR_LAYER_MAX = 999, Z_ORDER_MAX = 999, MAX_GROUPS = 10;
const layerDefault = t => t === 'Deco' || t === 'Slope' || t === 'GridBlock' ? 1 : 0;
const isGameplay = t => !!PORTALS[t] || t === 'TelePortal' || t === 'Pad' || t === 'Orb' || t === 'Coin' || isTrigger(t);
function intIn(v, lo, hi, def) { const n = Math.round(Number(v)); return v != null && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; }
// HSV from Edit Object: hue shift in degrees, saturation and brightness as
// multipliers (0 to 2), or added (-1 to 1) when sAdd / vAdd are on. null = no change.
function parseHsv(v) {
  if (!isOpts(v)) return null;
  const num = (x, lo, hi, d) => typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
  const sAdd = !!v.sAdd, vAdd = !!v.vAdd;
  const h = num(v.h, -180, 180, 0), s = sAdd ? num(v.s, -1, 1, 0) : num(v.s, 0, 2, 1), val = vAdd ? num(v.v, -1, 1, 0) : num(v.v, 0, 2, 1);
  if (!h && s === (sAdd ? 0 : 1) && val === (vAdd ? 0 : 1)) return null;
  return { h, s, v: val, sAdd, vAdd };
}
function editGroupFields(o, op) {
  o.edL = intIn(op.editorL, 0, EDITOR_LAYER_MAX, layerDefault(o.t));
  o.edL2 = intIn(op.editorL2, 0, EDITOR_LAYER_MAX, 0);          // 0 = no second layer
  o.zRank = Z_LAYERS.includes(op.zLayer) ? Z_LAYERS.indexOf(op.zLayer) : Z_DEFAULT;
  o.zOrder = intIn(op.zOrder, -Z_ORDER_MAX, Z_ORDER_MAX, 0);
  o.hide = !!op.hide;               // not drawn while playing
  o.noTouch = !!op.noTouch;         // the ship goes straight through it
  o.highDetail = !!op.highDetail;   // hidden with LOW DETAIL MODE
  o.noGlow = !!op.noGlow;           // no soft white edge
  o.hsv = parseHsv(op.hsv); o.detailHsv = parseHsv(op.detailHsv);
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

    // Landing help: when not flying up, a ship whose bottom is within landSnap of a block's top
    // (a little above it, or clipping its corner a little) lands on it. Upside down, the same
    // for a block's underside. Makes platforms easier to land on.
    if (!upInput && !this.onGround) {
      const s = this.hitboxAt(sx);
      let best = null, bestGap = Infinity;
      for (const block of near) {
        if (block.kind !== 'solid') continue;
        const b = block.box;
        if (s.r <= b.l || s.l >= b.r) continue;
        const gap = this.gravity === 1 ? b.t - s.b : s.t - b.b;   // > 0: just above it, < 0: a little inside it
        if (Math.abs(gap) <= landSnap && Math.abs(gap) < Math.abs(bestGap)) { best = block; bestGap = gap; }
      }
      if (best) {
        const oldY = this.y;
        this.y += this.gravity === 1 ? -bestGap : bestGap;
        this.syncHitbox();
        const t = this.hitboxAt(sx);   // never snap into another block (tight corridors)
        if (near.some(o => o.kind === 'solid' && t.r > o.box.l && t.l < o.box.r && t.b > o.box.t + epsilon && t.t < o.box.b - epsilon)) {
          this.y = oldY; this.syncHitbox();
        } else { this.vy = 0; this.onGround = true; }
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
    if (hk('noclip')) { this.clipped = true; return; }   // noclip: remember it for Noclip Accuracy / Deaths
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
            box: o.parts[k].box, hit: { poly: o.parts[k].poly }, zRank: o.zRank, zOrder: o.zOrder, noTouch: o.noTouch });
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
  // Objects whose Shape.centerX is within nearRange of the ship, in level order (like CMU).
  // NoTouch objects (Edit Group > Extra) are left out, so the ship never meets them.
  near(sx) {
    const out = [];
    for (let i = this.firstAtLeast(sx - nearRange); i < this.sorted.length && this.cxs[i] < sx + nearRange; i++) {
      const o = this.sorted[i];
      if (Math.abs(o.cx - sx) < nearRange && !o.noTouch) out.push(o);
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
  imgTimer = setTimeout(() => {
    if (typeof renderPalette === 'function' && ed) { renderPaletteTabs(); renderPalette(); edRequestDraw(); }
    if (typeof renderKitTile === 'function') renderKitTile();
  }, 50);
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
  loadBackground();
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
  c = cutFrame(sh.im, f.slice(1));
  c.ppc = sh.ppc;
  SPR.cache.set(name, c);
  return c;
}
// One frame of a sheet as its own canvas: f = [x, y, w, h, rotated, full w, full h, offset x, offset y]
function cutFrame(im, f) {
  const [x, y, w, h, rot, sw, sh, ox, oy] = f;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
  const cx = c.getContext('2d');
  const px = (sw - w) / 2 + ox, py = (sh - h) / 2 - oy;
  if (rot) {              // stored turned a quarter clockwise: turn it back
    cx.translate(px + w / 2, py + h / 2); cx.rotate(-Math.PI / 2);
    cx.drawImage(im, x, y, h, w, -h / 2, -w / 2, h, w);
  } else cx.drawImage(im, x, y, w, h, px, py, w, h);
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
  c = tintCanvas(src, `rgb(${r},${g},${b})`); c.ppc = src.ppc;
  if (TINTS.size > 1500) { let n = 0; for (const k of TINTS.keys()) { TINTS.delete(k); if (++n >= 500) break; } }
  TINTS.set(key, c);
  return c;
}
function tintCanvas(src, css) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = css; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
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

// The Geometry Dash background and ground pictures (one size per graphics
// quality). The background is a square that repeats sideways, fills the view's
// height and is tinted by BG. The ground square repeats along the floor (and
// flipped along the ceiling) and is tinted by GROUND.
const BG_FILES = { low: 'game_bg_01_001.png', medium: 'game_bg_01_001-hd.png', high: 'game_bg_01_001-uhd.png' };
const GROUND_FILES = { low: 'groundSquare_01_001.png', medium: 'groundSquare_01_001-hd.png', high: 'groundSquare_01_001-uhd.png' };
const BG_SPEED = 0.1;            // the background moves at 1/10 of the level's speed
const GROUND_SIZE = 100;         // one square fills the floor (and ceiling) exactly
const BG_IMG = { im: null }, GROUND_IMG = { im: null };
function loadStageImage(slot, files) {
  slot.im = null;
  if (settings.art !== 'gd') return;
  const file = files[settings.quality] || files.medium;
  const im = new Image();
  im.onload = () => { if (slot.want === file) slot.im = im; if (typeof edRequestDraw === 'function') edRequestDraw(); };
  slot.want = file;
  im.src = IMAGE_FOLDER + encodeURIComponent(file);
}
function loadBackground() {
  loadStageImage(BG_IMG, BG_FILES);
  loadStageImage(GROUND_IMG, GROUND_FILES);
}

// The background takes the BG color (a little darker at the top), the floor and
// ceiling take the GROUND color and their edge line the LINE color.
// With Geometry Dash art the background picture is drawn instead, moved left by
// scroll * BG_SPEED (scroll in level pixels, size = how big one picture is drawn).
const rgbCss = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
function drawSky(ctx, w, h, bg = CH_DEFAULT[CH.BG], scroll = 0, size = h) {
  const im = settings.art === 'gd' && BG_IMG.im;
  if (im && size > 0) {
    const off = ((scroll * BG_SPEED * size / 400) % size + size) % size;
    for (let x = -off; x < w; x += size) ctx.drawImage(im, x, h - size, size + 0.5, size);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgbCss(bg); ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const d = CH_DEFAULT[CH.BG], plain = bg.every((v, i) => Math.round(v) === d[i]);
  ctx.fillStyle = plain ? vGrad(ctx, 0, h, '#5784dd', '#6f9df2') : vGrad(ctx, 0, h, rgbCss(bg, 0.86), rgbCss(bg));
  ctx.fillRect(0, 0, w, h);
}

function drawStage(ctx, x0, x1, yTop, yBot, ground = CH_DEFAULT[CH.GROUND], line = [255, 255, 255]) {
  const im = settings.art === 'gd' && GROUND_IMG.im;
  if (im) {
    // Ground squares in level coordinates, so they move with the level and repeat.
    // The floor starts at y = 300 going down; the ceiling is the same picture
    // flipped, starting at y = 100 going up.
    const g = GROUND_SIZE, sx = Math.floor(x0 / g) * g;
    for (let y = 300; y < yBot; y += g)
      for (let x = sx; x < x1; x += g) ctx.drawImage(im, x, y, g + 0.5, g + 0.5);
    if (yTop < 100) {
      ctx.save(); ctx.translate(0, 200); ctx.scale(1, -1);   // mirror around y = 100
      for (let y = 100; y < 200 - yTop; y += g)
        for (let x = sx; x < x1; x += g) ctx.drawImage(im, x, y, g + 0.5, g + 0.5);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgbCss(ground);
    if (yTop < 100) ctx.fillRect(x0, yTop, x1 - x0, 100 - yTop);
    if (yBot > 300) ctx.fillRect(x0, 300, x1 - x0, yBot - 300);
    ctx.globalCompositeOperation = 'source-over';
  } else {
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
  }
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
const DRAW = { parts: null, cs: DEFAULT_COLORS, now: 0, play: false, layout: false, coinTime: 0, fade: null };
function colorsOf(o) { return (DRAW.parts && DRAW.parts[o.part] && DRAW.parts[o.part].colors) || DRAW.cs; }
// The colors one object is drawn with right now. HSV (from Edit Object) changes
// the color of just this object, not the whole channel.
function objColors(o) {
  if (DRAW.layout) {     // Show Layout: every object fully visible in its default colors
    const res = id => id ? DEFAULT_COLORS.resolve(id, 0) : null;
    return { main: res(o.ch0), det: res(o.dch0), alpha: 1 };
  }
  const cs = colorsOf(o), now = DRAW.now;
  let alpha = 1;
  for (const gid of o.groups || []) alpha *= cs.groupAlpha(gid, now);
  const main = o.ch ? cs.resolve(o.ch, now) : null, det = o.dch ? cs.resolve(o.dch, now) : null;
  return { main: o.hsv ? shiftHsv(main, o.hsv) : main, det: o.detailHsv ? shiftHsv(det, o.detailHsv) : det, alpha };
}
// Like Geometry Dash: turn the hue, then multiply (or add to) saturation and brightness
function shiftHsv(c, x) {
  if (!c) return c;
  const [h, s, v] = rgbToHsv([c.r, c.g, c.b]);
  const [r, g, b] = hsvToRgb((h + x.h + 360) % 360, clamp01(x.sAdd ? s + x.s : s * x.s), clamp01(x.vAdd ? v + x.v : v * x.v));
  return { ...c, r, g, b };
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

// Hide and High Detail (Edit Group > Extra) only matter while playing.
// DRAW.fade is the editor's: how see-through each object is (other layers, hidden objects).
function drawObject(ctx, o, pass) {
  if (pass === 'front' && o.kind !== 'portal') return;
  if (o.sub) return;
  if (DRAW.play && !DRAW.layout && (o.hide || (o.highDetail && settings.lowDetail))) return;
  const cols = objColors(o);
  const alpha = cols.alpha * (DRAW.fade ? DRAW.fade(o) : 1);
  if (alpha <= 0.004) return;
  if (alpha < 1) { ctx.save(); ctx.globalAlpha *= alpha; drawObjectArt(ctx, o, pass, cols); ctx.restore(); }
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
      else for (const { line: b } of o.parts) {       // each line as thick as piece 1's outline, kept inside the square
        const w = Math.max(1.2, b.r - b.l), h = Math.max(1.2, b.b - b.t);
        ctx.fillRect(Math.min(b.l, o.x + g - w), Math.min(b.t, o.y - h), w, h);
      }
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
        if (L.halo && !o.noGlow) drawSpr(ctx, spr + (L.join ? '|' + L.join : ''), o.cx, o.cy, { scale: o.size * 1.06, rot, alpha: 0.45 * (main ? main.a : 1) });
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

// Drawing order: Z layer (B5 lowest, T4 highest), then the object's own draw
// group (o.layer), then Z order, then the order it was placed in.
const drawOrder = (a, b) => a.zRank - b.zRank || a.layer - b.layer || a.zOrder - b.zOrder || a.idx - b.idx;
function drawObjects(ctx, list, pass) {
  const sorted = list.slice().sort(drawOrder);
  for (const o of sorted) drawObject(ctx, o, pass);
}
// Portal fronts go over the ship, like in Geometry Dash
function drawPortalFronts(ctx, list) {
  if (!useSheets()) return;
  for (const o of list) if (o.kind === 'portal') drawObject(ctx, o, 'front');
}

// --- player icons (picked in the icon kit) -------------------------------
// The cube and ship you pick in the icon kit, colored with Geometry Dash's player
// colors. The pictures come from Geometry Dash's own icon files, one pair per icon
// in the icons folder (ship_05-uhd.png + ship_05-uhd.plist, exactly as they are in
// the game's Resources/icons folder). Icons that aren't there come from
// GJ_GameSheetIcons.png instead (icons.js says where each one sits on it).
// Icon 0 is Ship Run's own picture (cube.png / ship.png), which is the default.
// The icon kit is based on GDBrowser's icon kit by GD Colon (gdbrowser.com).
const ICON_FOLDER = 'icons/';
const ICON_FORMS = { cube: { gd: 'player', max: 485 }, ship: { gd: 'ship', max: 169 } };
const PLAYER_COLORS = [
  '7dff00', '00ff00', '00ff7d', '00ffff', '007dff', '0000ff', '7d00ff', 'ff00ff', 'ff007d', 'ff0000', 'ff7d00',
  'ffff00', 'ffffff', 'b900ff', 'ffb900', '000000', '00c8ff', 'afafaf', '5a5a5a', 'ff7d7d', '00af4b', '007d7d',
  '004baf', '4b00af', '7d007d', 'af004b', 'af4b00', '7d7d00', '4baf00', 'ff4b00', '963200', '966400', '649600',
  '009664', '006496', '640096', '960064', '960000', '009600', '000096', '7dffaf', '7d7dff', 'fffa7f', 'fa7fff',
  '00ffc0', '50320e', 'cda576', 'b680ff', 'ff3a3a', '4d4d8f', '000a4c', 'fdd4ce', 'beb5ff', '700000', '520200',
  '380106', '804f4f', '7a3535', '512424', 'a36246', '754936', '563528', 'ffb972', 'ffa040', '66311e', '5b2700',
  '472000', 'a77b4d', '6d5339', '513e2a', 'ffffc0', 'fde0a0', 'c0ffa0', 'b1ff6d', 'c0ffe0', '94ffe4', '43a18a',
  '316d5f', '265449', '006000', '004000', '006060', '004040', 'a0ffff', '010770', '00496d', '00324c', '002638',
  '5080ad', '335375', '233c56', 'e0e0e0', '3d068c', '370860', '404040', '6f49a4', '54367f', '422a63', 'fcb5ff',
  'af57af', '824382', '5e315e', '808080', '66033e', '470134', 'd2ff32', '76bdff',
].map(h => '#' + h);
// The colors in the order Geometry Dash's garage shows them: four blocks of 4 x 6, then a row of blues and grays
const KIT_COLOR_ROWS = [[51, 19, 48, 9, 62, 63, 10, 29, 70, 42, 11, 27, 72, 73, 0, 1], [37, 53, 54, 55, 26, 59, 60, 61, 71, 14, 31, 45, 105, 28, 32, 20],
  [25, 56, 57, 58, 30, 64, 65, 66, 46, 67, 68, 69, 2, 38, 79, 80], [74, 75, 44, 3, 83, 16, 4, 5, 52, 41, 6, 35, 98, 8, 36, 103],
  [40, 76, 77, 78, 22, 39, 84, 50, 47, 23, 92, 93, 7, 13, 24, 104], [33, 21, 81, 82, 34, 85, 86, 87, 49, 95, 96, 97, 43, 99, 100, 101]];
const KIT_COLOR_BOTTOM = [106, 88, 89, 90, 12, 91, 17, 102, 18, 94, 15];
const ICON_SUFFIX = { low: '', medium: '-hd', high: '-uhd' }, ICON_PPB = { '': 30, '-hd': 60, '-uhd': 120 };
// In ship mode the cube sits in the ship at 0.55 size. Offsets are in squares, from the hitbox middle.
const KIT_CUBE_SCALE = 0.55, KIT_SHIP_DOWN = 5 / 30, KIT_CUBE_UP = 10 / 30;
const ICONS = { data: window.GD_ICONS || null, sheet: null, probe: {}, have: {}, src: new Map(), art: new Map() };
const iconBase = (form, id) => ICON_FORMS[form].gd + '_' + String(id).padStart(2, '0');

// Reads the frames out of a Geometry Dash .plist: { "ship_05_001": [x, y, w, h, rotated, full w, full h, offset x, offset y] }
function plistFrames(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const top = doc.querySelector('plist > dict');
  if (!top) return null;
  const value = el => el.tagName === 'dict' ? dictOf(el) : el.tagName === 'true' ? true : el.tagName === 'false' ? false : el.textContent;
  const dictOf = d => { const o = {}, k = [...d.children]; for (let i = 0; i + 1 < k.length; i += 2) o[k[i].textContent] = value(k[i + 1]); return o; };
  const frames = dictOf(top).frames;
  if (!isOpts(frames)) return null;
  const nums = v => (String(v || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const out = {};
  for (const [name, f] of Object.entries(frames)) {
    if (!isOpts(f)) continue;
    const r = nums(f.textureRect || f.frame), size = nums(f.spriteSourceSize || f.sourceSize), off = nums(f.spriteOffset || f.offset);
    if (r.length < 4) continue;
    out[name.replace(/\.png$/, '')] = [r[0], r[1], r[2], r[3], f.textureRotated || f.rotated ? 1 : 0, size[0] || r[2], size[1] || r[3], off[0] || 0, off[1] || 0];
  }
  return out;
}
function loadImage(src) {
  return new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
}
// One icon file pair from the icons folder, or null if it isn't there
async function loadIconFile(name) {
  try {
    const res = await fetch(ICON_FOLDER + name + '.plist');
    if (!res.ok) return null;
    const frames = plistFrames(await res.text());
    const im = frames && await loadImage(ICON_FOLDER + name + '.png');
    return im ? { im, frames } : null;
  } catch (e) { return null; }
}
// Which sizes the icons folder has for a form (checked once, with icon 1), so
// missing files aren't asked for over and over
function iconProbe(form) {
  return ICONS.probe[form] = ICONS.probe[form] || (async () => {
    const have = [];
    for (const suf of ['-uhd', '-hd', '']) if (await loadIconFile(iconBase(form, 1) + suf)) have.push(suf);
    ICONS.have[form] = have;
    return have;
  })();
}
// The fallback: GJ_GameSheetIcons at the best quality there is, up to the chosen one
function iconSheet() {
  return ICONS.sheet = ICONS.sheet || (async () => {
    const d = ICONS.data;
    if (!d) return null;
    for (const q of ['high', 'medium', 'low'].slice(['high', 'medium', 'low'].indexOf(settings.quality))) {
      if (!d.sheets[q]) continue;
      const im = await loadImage(IMAGE_FOLDER + encodeURIComponent(d.sheets[q][0]));
      if (im) return { im, ppb: d.sheets[q][1], frames: d.frames[q] };
    }
    return null;
  })();
}
async function loadIconSource(form, id, e) {
  const base = iconBase(form, id), want = ICON_SUFFIX[settings.quality] || '-hd';
  const have = await iconProbe(form);
  if (have.length) {
    const order = [want, '-uhd', '-hd', ''].filter((x, i, a) => have.includes(x) && a.indexOf(x) === i);
    for (const suf of order) {
      const got = await loadIconFile(base + suf);
      if (got) { Object.assign(e, got, { ppb: ICON_PPB[suf], state: 'ok' }); iconsChanged(); return; }
    }
  }
  const sh = await iconSheet();
  if (sh && sh.frames[base + '_001']) Object.assign(e, { im: sh.im, ppb: sh.ppb, frames: sh.frames, state: 'ok' });
  else e.state = 'none';
  iconsChanged();
}
// The pictures for one icon ({ im, ppb, frames }), or null while loading or if it doesn't exist
function iconSource(form, id) {
  const key = iconBase(form, id) + '|' + settings.quality;
  let e = ICONS.src.get(key);
  if (!e) { e = { state: 'loading' }; ICONS.src.set(key, e); loadIconSource(form, id, e); }
  return e.state === 'ok' ? e : null;
}
const iconMissing = (form, id) => { const e = ICONS.src.get(iconBase(form, id) + '|' + settings.quality); return !!e && e.state === 'none'; };
// One icon put together in its colors, like Geometry Dash: glow at the back, then
// color 2, then color 1, then the white parts ("W", white unless you change it). Kept for reuse.
function iconArt(form, id, look) {
  const src = iconSource(form, id);
  if (!src) return null;
  const base = iconBase(form, id);
  const key = [base, src.ppb, look.col1, look.col2, look.glow ? look.glowCol : '-', look.colW].join('|');
  let c = ICONS.art.get(key);
  if (c) return c;
  const layer = (part, col) => {
    const f = src.frames[base + part];
    if (!f || f[2] * f[3] <= 9) return null;      // missing, or a tiny empty placeholder
    const cut = cutFrame(src.im, f);
    const [, , w, h, , , , ox, oy] = f;
    return { im: col ? tintCanvas(cut, col) : cut, l: ox - w / 2, r: ox + w / 2, t: -oy - h / 2, b: -oy + h / 2 };
  };
  const layers = [look.glow && layer('_glow_001', PLAYER_COLORS[look.glowCol]), layer('_2_001', PLAYER_COLORS[look.col2]),
    layer('_001', PLAYER_COLORS[look.col1]), layer('_extra_001', look.colW === 12 ? null : PLAYER_COLORS[look.colW])].filter(Boolean);
  if (!layers.length) return null;
  // Sized to what is actually drawn (some icons have an empty placeholder frame).
  // (ax, ay) is the icon's middle, which is not always the middle of the picture.
  const L = Math.floor(Math.min(...layers.map(l => l.l))), T = Math.floor(Math.min(...layers.map(l => l.t)));
  c = document.createElement('canvas');
  c.width = Math.ceil(Math.max(...layers.map(l => l.r))) - L; c.height = Math.ceil(Math.max(...layers.map(l => l.b))) - T;
  c.ax = -L; c.ay = -T;
  const x = c.getContext('2d');
  for (const { im } of layers) x.drawImage(im, c.ax - im.width / 2, c.ay - im.height / 2);
  c.ppb = src.ppb;
  if (ICONS.art.size > 600) ICONS.art.clear();
  ICONS.art.set(key, c);
  return c;
}
// What the player looks like: { cube, ship, col1, col2, glow, glowCol }, kept in this browser
const KIT_KEY = 'shiprun.icons.v1';
const KIT_DEFAULTS = { cube: 0, ship: 0, col1: 0, col2: 3, glow: false, glowCol: 3, colW: 12 };
const kit = (() => {
  const k = { ...KIT_DEFAULTS };
  try {
    const d = JSON.parse(localStorage.getItem(KIT_KEY) || '{}');
    k.cube = intIn(d.cube, 0, ICON_FORMS.cube.max, 0); k.ship = intIn(d.ship, 0, ICON_FORMS.ship.max, 0);
    for (const c of ['col1', 'col2', 'glowCol', 'colW']) k[c] = intIn(d[c], 0, PLAYER_COLORS.length - 1, KIT_DEFAULTS[c]);
    k.glow = !!d.glow;
  } catch (e) { /* storage blocked: defaults */ }
  return k;
})();
function saveKit() { try { localStorage.setItem(KIT_KEY, JSON.stringify(kit)); } catch (e) { /* ignore */ } }
// The picked cube or ship, or null for Ship Run's own picture (also with My Pictures art, or while it loads)
function kitArt(form, look = kit) { return look[form] && settings.art === 'gd' ? iconArt(form, look[form], look) : null; }
let iconsTimer = 0;
function iconsChanged() {
  clearTimeout(iconsTimer);
  iconsTimer = setTimeout(() => { if (screen === 'icons') renderKit(); renderKitTile(); if (screen === 'editor') edRequestDraw(); }, 40);
}
function iconsReset() { ICONS.src.clear(); ICONS.art.clear(); ICONS.sheet = null; kitUI.built = ''; iconsChanged(); }   // graphics quality changed

// The ship and the cube, placed exactly like your render()
function drawPlayer(ctx, worldX, y, theta, s, grav, holding, opt = {}) {
  const hbSize = gridSize * s;
  const hbCY = (screenHeight - y) - hbSize / 2;
  const flip = grav === -1;

  // Icons from the icon kit are drawn at Geometry Dash's size, with the cube sitting
  // in the ship like in Geometry Dash (Ship Run's own pictures are a bit bigger)
  const look = opt.look || kit, cubeArt = kitArt('cube', look), shipArt = kitArt('ship', look);
  const shipDown = (shipArt ? KIT_SHIP_DOWN * gridSize : 5) * s * grav;
  const dx = 0, dy = -(shipArt ? KIT_CUBE_UP * gridSize : 10) * s * grav;
  const rX = dx * Math.cos(theta) - dy * Math.sin(theta);
  const rY = -dx * Math.sin(theta) + dy * Math.cos(theta);

  // cube (drawn first, the ship goes on top)
  ctx.save();
  ctx.translate(worldX + rX, hbCY + rY + shipDown);
  ctx.rotate(theta);
  const cubeImg = flip ? (IMG.cubeFlipped || IMG.cube) : IMG.cube;
  if (flip && (cubeArt || !IMG.cubeFlipped)) ctx.scale(1, -1);
  if (cubeArt) drawCentered(ctx, cubeArt, gridSize / cubeArt.ppb * KIT_CUBE_SCALE * s);
  else if (cubeImg) ctx.drawImage(cubeImg, -110 * scale * s / 2, -60 * scale * s / 2, 110 * scale * s, 60 * scale * s);
  else {
    const c = 12 * s;
    ctx.fillStyle = COLORS.shipMain; ctx.fillRect(-c / 2, -c / 2, c, c);
    ctx.fillStyle = COLORS.shipTrim; ctx.fillRect(-c / 4, -c / 4, c / 2, c / 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.strokeRect(-c / 2, -c / 2, c, c);
  }
  ctx.restore();

  // ship
  ctx.save();
  ctx.translate(worldX, hbCY + shipDown);
  ctx.rotate(theta);
  const shipImg = flip ? (IMG.shipFlipped || IMG.ship) : IMG.ship;
  if (flip && (shipArt || !IMG.shipFlipped)) ctx.scale(1, -1);
  if (shipArt) drawCentered(ctx, shipArt, gridSize / shipArt.ppb * s);
  else if (shipImg) ctx.drawImage(shipImg, -75 * 0.5 * s / 2, -40 * 0.5 * s / 2, 75 * 0.5 * s, 40 * 0.5 * s);
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

// Draws a picture at (0, 0) by its middle (ax, ay for icons), k = how much bigger
function drawCentered(ctx, c, k) { ctx.drawImage(c, -(c.ax == null ? c.width / 2 : c.ax) * k, -(c.ay == null ? c.height / 2 : c.ay) * k, c.width * k, c.height * k); }

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

// --- analytics (GoatCounter, loaded in index.html) ---
// Sends only an event name, never level contents or anything about the player.
// Skipped on localhost and file:// so testing does not count, and wrapped in
// try/catch so a blocked or missing GoatCounter can never break the game.
function track(name) {
  const host = location.hostname;
  if (!host || host === 'localhost') return;
  try {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true });
  } catch (e) { /* analytics is optional */ }
}
// Passing the end of a level in a run or in Practice (not editor tests or plays)
function trackLevelDone(pi) {
  if (game.mode === 'test' || game.returnTo === 'levels' || game.cheated) return;   // runs with hacks don't count
  const part = world.parts[pi];
  if (part) track('level-complete:' + part.id);
}

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
  deathHitboxes: false, teleported: false,
  prevScroll: 0, prevY: position, prevTheta: 0, trail: [], lastTrail: null,
  cssScale: 1, dpr: 1, hudKey: '', attemptX: 0,
  time: 0, coinPart: 0, cheated: false, runCoins: 0, stage: null,
  nc: { steps: 0, dead: 0, deaths: 0, was: false }, clicks: 0,
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
  game.nc = { steps: 0, dead: 0, deaths: 0, was: false }; game.clicks = 0;
  game.time = 0; game.coinPart = world.partAt(shipCenterX + scrollX); game.cheated = cheatsOn(); game.runCoins = 0; game.stage = null;
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
  if (cheatsOn()) game.cheated = true;
  if (Me.alive) {
    const poly = Me.hitPoly(sx);
    for (const o of world.near(sx)) {
      if (o.kind === 'trigger' && o.touch && !o.spawn && !o.fired && hitsShape(poly, o.hit)) fireTrigger(o, now);
      else if (o.kind === 'coin' && !o.got && hitsShape(poly, o.hit)) { o.got = true; o.gotAt = now; game.runCoins++; }
    }
  }
  // a coin counts once the ship gets past the end of its level alive
  const pi = world.partAt(sx);
  while (game.coinPart < pi) { trackLevelDone(game.coinPart); keepCoins(game.coinPart++); }
}
function keepCoins(pi) {
  if (game.mode === 'test' || game.cheated || hk('safeMode')) return;
  const part = world.parts[pi];
  if (!part) return;
  for (const o of world.coins) if (o.part === pi && o.got) saveCoin(part.id, o.key);
}

// One CMU onStep
function step() {
  game.prevScroll = scrollX; game.prevY = Me.y; game.prevTheta = Me.theta;
  game.teleported = false;
  if (!Me.alive) return;
  Me.clipped = false;
  Me.Update();
  pressed = false;
  Me.render();
  // Noclip Accuracy: the share of steps not spent inside something deadly.
  // Noclip Deaths: how many times the ship went from safe to "would be dead".
  if (Me.clipped || hk('noclip')) {
    const nc = game.nc;
    nc.steps++;
    if (Me.clipped) { nc.dead++; if (!nc.was) nc.deaths++; }
    nc.was = Me.clipped;
  }
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
  game.deathHitboxes = hk('deathHitboxes');   // setHitboxes(True)
  game.deathTimer = hk('instantRespawn') ? 0 : 0.5 + dt;   // sleep(0.5) on the next step, then restart()
  if (game.mode === 'test') game.lastTrail = { pts: game.trail, died: true };
}

function onFinish() {
  game.finished = true;
  upInput = false;
  while (game.coinPart < world.parts.length) { trackLevelDone(game.coinPart); keepCoins(game.coinPart++); }
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
  if (!pool.length) { toast('No levels are in random runs yet. Turn it on in the level editor.'); return false; }
  startPlay('run', { pool, returnTo: 'menu' });
  return true;
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
  return `<span class="done-line o coin-line">COINS: ${dots}</span>${game.cheated ? '<span class="done-line o small">HACKS WERE ON, SO COINS WERE NOT SAVED</span>' : ''}`;
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
  const layout = hk('layout');
  DRAW.parts = world.parts; DRAW.now = now; DRAW.play = true; DRAW.layout = layout; DRAW.coinTime = performance.now() / 1000;
  let st = stageColors(sI, now);
  if (layout) st = { bg: CH_DEFAULT[CH.BG], ground: CH_DEFAULT[CH.GROUND], line: [255, 255, 255] };

  // The camera only changes where things are drawn. The ship is still at
  // shipCenterX + scrollX in the level, exactly like CMU.
  const camL = sI + shipCenterX - SHIP_SCREEN_X;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawSky(ctx, VIEW_WIDTH, 400, st.bg, camL);
  ctx.setTransform(k, 0, 0, k, -camL * k, 0);
  if (gdFont && settings.showAttempts && game.attemptX > camL - 200) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlinedText(ctx, 'Attempt ' + game.attempts, game.attemptX, 172, 22, 5);
  }
  let vis = world.visible(camL, camL + VIEW_WIDTH);
  if (layout) vis = vis.filter(o => o.kind !== 'none');   // Show Layout: no deco, only objects with a hitbox
  const wx = shipCenterX + sI;
  // B layers (and objects with no Z layer) go behind the ship, T layers in front of it
  const behind = [], front = [];
  for (const o of vis) (o.zRank >= Z_FRONT ? front : behind).push(o);
  fadeShipX = layout ? null : wx;
  drawObjects(ctx, behind, 'back');
  if (!hk('hidePlayer')) drawPlayer(ctx, wx, yI, thI, Me.sizeScale, Me.gravity, upInput && Me.alive);
  drawPortalFronts(ctx, behind);
  if (front.length) drawObjects(ctx, front);
  fadeShipX = null;
  // the floor and ceiling go over everything, so anything reaching past them is hidden (like Geometry Dash)
  drawStage(ctx, camL, camL + VIEW_WIDTH, 0, 400, st.ground, st.line);
  if (game.deathHitboxes || hk('hitboxes')) {
    drawHitboxes(ctx, vis, { worldX: wx, y: yI, sizeScale: Me.sizeScale, rot: Me.rot });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (Me.clipped && hk('ncTint')) { ctx.fillStyle = 'rgba(255, 0, 0, 0.22)'; ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height); }
  DRAW.parts = null; DRAW.play = false; DRAW.layout = false; DRAW.now = 0;
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
  const key = pct + '|' + label + '|' + hk('noclip') + '|' + hk('hidePause') + '|' + game.mode;
  if (!force && key === game.hudKey) return;
  game.hudKey = key;
  $('progFill').style.width = pct + '%';
  $('hudPct').textContent = pct + '%';
  $('badgeLevel').textContent = label;
  $('badgeNoclip').hidden = !hk('noclip');
  $('btnPause').hidden = hk('hidePause');
  $('btnPause').setAttribute('aria-label', game.mode === 'test' ? 'Back to the editor' : 'Pause');
  applyHudSettings();
}
function applyHudSettings() {
  document.querySelector('.hud-progress').hidden = !settings.showProgress && !settings.showPercent;
  document.querySelector('.hud-progress .progress').style.visibility = settings.showProgress ? '' : 'hidden';
  $('hudPct').style.visibility = settings.showPercent ? '' : 'hidden';
  $('badgeLevel').hidden = !settings.showLevelName;
}


// --- the hack menu (dev mode only): Tab opens it, Tab again closes it ---
// Like Mega Hack: a few windows of switches you can drag around. Everything is
// kept in this browser. With dev mode off no hack does anything (Hitboxes on
// Death keeps its normal "on"), and the menu can't be opened.
const HACKS_KEY = 'shiprun.hacks.v1';
const HACK_DEFAULTS = { deathHitboxes: true };
const HACK_WINDOWS = [
  { id: 'player', name: 'Player', color: '#e8457c', items: [
    ['noclip', 'Noclip', 'Spikes and blocks can\'t kill you. Shortcut: I.'],
    ['ncAcc', 'Noclip Accuracy', 'With noclip on, shows how much of the attempt you spent NOT inside something deadly.'],
    ['ncDeaths', 'Noclip Deaths', 'With noclip on, counts how many times you would have died (once each time you hit something, not every step).'],
    ['ncTint', 'Noclip Death Tint', 'With noclip on, the screen goes red while you are inside something deadly.'],
    ['instantRespawn', 'Instant Respawn', 'Restart straight away after crashing, with no half-second wait.'],
    { act: 'restart', label: 'Restart Level', desc: 'Start the attempt again (in a run, this starts a new run).' },
    { act: 'complete', label: 'Instant Complete', desc: 'Jump to the end of the level. Coins are not saved.' },
  ] },
  { id: 'speed', name: 'Speedhack', color: '#2f9bff', items: [
    ['speedhack', 'Enabled', 'Runs the whole game faster or slower. Below 1 is slow motion.'],
    { input: 'speed', label: 'Speed', desc: 'How fast the game runs: 1 is normal, 0.5 is half speed, 2 is double.' },
    { presets: [0.25, 0.5, 0.75, 1, 1.5, 2] },
  ] },
  { id: 'cosmetic', name: 'Cosmetic', color: '#a45cff', items: [
    ['hitboxes', 'Show Hitboxes', 'Draws every hitbox while you play. Shortcut: H.'],
    ['deathHitboxes', 'Hitboxes on Death', 'Draws the hitboxes for a moment when you crash.'],
    ['layout', 'Show Layout', 'Hides all decoration and shows every object with a hitbox, fully visible in its default colors, on a plain background.'],
    ['hidePlayer', 'Hide Player', 'The ship is not drawn (it still flies and crashes).'],
    ['hidePause', 'Hide Pause Button', 'Hides the pause button. Esc still pauses.'],
  ] },
  { id: 'status', name: 'Status', color: '#3fd16b', items: [
    ['cheatIndicator', 'Cheat Indicator', 'A dot in the corner: green while the attempt is legit, red once any hack that changes the game was on.'],
    ['fps', 'FPS Counter', 'Frames drawn per second.'],
    ['cps', 'CPS Counter', 'Clicks per second, and how many clicks this attempt.'],
    ['attempts', 'Attempts', 'The attempt number.'],
    ['time', 'Level Time', 'Seconds of game time since the attempt started.'],
    ['position', 'Position', 'Where the ship is, in blocks.'],
    ['clock', 'Clock', 'The time of day.'],
  ] },
  { id: 'universal', name: 'Universal', color: '#ff9d2e', items: [
    ['safeMode', 'Safe Mode', 'Never saves coins, even with no other hack on.'],
    { act: 'resetLayout', label: 'Reset Windows', desc: 'Puts the hack windows back in their starting places.' },
    { act: 'allOff', label: 'Turn Everything Off', desc: 'Turns every hack off (Hitboxes on Death goes back on).' },
  ] },
];
// The hacks that change the game. With one of them on, coins are not saved and runs don't count.
const GAMEPLAY_HACKS = ['noclip', 'speedhack'];
const hacks = (() => {
  const h = { on: { ...HACK_DEFAULTS }, speed: 0.5, pos: {} };
  try {
    const d = JSON.parse(localStorage.getItem(HACKS_KEY) || '{}');
    if (isOpts(d.on)) for (const [k, v] of Object.entries(d.on)) h.on[k] = !!v;
    if (Number(d.speed) > 0) h.speed = clampSpeed(d.speed);
    if (isOpts(d.pos)) h.pos = d.pos;
  } catch (e) { /* storage blocked: defaults */ }
  return h;
})();
function clampSpeed(v) { return Math.round(Math.max(0.05, Math.min(10, Number(v) || 1)) * 100) / 100; }
function saveHacks() { try { localStorage.setItem(HACKS_KEY, JSON.stringify(hacks)); } catch (e) { /* ignore */ } }
function hk(id) { return settings.editorMode ? !!hacks.on[id] : !!HACK_DEFAULTS[id]; }
function hackSpeed() { return hk('speedhack') ? hacks.speed : 1; }
function cheatsOn() { return GAMEPLAY_HACKS.some(id => id === 'speedhack' ? hackSpeed() !== 1 : hk(id)); }
function setHack(id, v) {
  hacks.on[id] = v; saveHacks();
  if (screen === 'play') updateHud(true);
  renderHackMenu();
}

const hackMenuOpen = () => !!$('hackMenu') && !$('hackMenu').hidden;
function showHackMenu(open = !hackMenuOpen()) {
  if (open && !settings.editorMode) return;
  let m = $('hackMenu');
  if (!m) {
    if (!open) return;
    m = document.createElement('div');
    m.id = 'hackMenu'; m.hidden = true;
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Hack menu');
    document.body.appendChild(m);
    hackMenuEvents(m);
  }
  m.hidden = !open;
  if (open) { renderHackMenu(); placeHackWindows(); }
}
function hackRowHTML(it) {
  if (Array.isArray(it)) {
    const [id, label, desc] = it, on = !!hacks.on[id];
    return `<button type="button" class="hk-row${on ? ' on' : ''}" data-hack="${id}" title="${esc(desc)}" aria-pressed="${on}"><span>${label}</span><i></i></button>`;
  }
  if (it.act) return `<button type="button" class="hk-row hk-act" data-hact="${it.act}" title="${esc(it.desc)}"><span>${it.label}</span></button>`;
  if (it.input) return `<label class="hk-row hk-in" title="${esc(it.desc)}"><span>${it.label}</span><input type="number" min="0.05" max="10" step="0.05" value="${hacks.speed}" data-hin="${it.input}"><b>x</b></label>`;
  return `<div class="hk-presets">${it.presets.map(v => `<button type="button" data-hspeed="${v}"${hacks.on.speedhack && v === hacks.speed ? ' class="on"' : ''}>${v}</button>`).join('')}</div>`;
}
function renderHackMenu() {
  const m = $('hackMenu');
  if (!m || m.hidden) return;
  const focused = document.activeElement && m.contains(document.activeElement) && document.activeElement.dataset.hin;
  if (!m.children.length) {
    m.innerHTML = `<p class="hk-hint">HACK MENU · TAB TO CLOSE · DRAG THE TITLES TO MOVE</p>` + HACK_WINDOWS.map(w =>
      `<section class="hk-win" data-win="${w.id}" style="--hk:${w.color}"><h2 class="hk-head">${w.name}</h2><div class="hk-body"></div></section>`).join('');
  }
  for (const w of HACK_WINDOWS) {
    const body = m.querySelector(`[data-win="${w.id}"] .hk-body`);
    if (focused && w.id === 'speed') {      // don't rebuild the box being typed in
      body.querySelectorAll('[data-hack]').forEach(b => { const on = !!hacks.on[b.dataset.hack]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      continue;
    }
    body.innerHTML = w.items.map(hackRowHTML).join('');
  }
}
// Windows start in a row along the top (wrapping on small screens) until you drag them
function placeHackWindows(reset) {
  const m = $('hackMenu');
  if (!m || m.hidden) return;
  if (reset) { hacks.pos = {}; saveHacks(); }
  const W = innerWidth, Hh = innerHeight, gap = 8;
  let x = gap, y = 30, rowH = 0;
  for (const win of m.querySelectorAll('.hk-win')) {
    const w = win.offsetWidth, h = win.offsetHeight, p = hacks.pos[win.dataset.win];
    if (x + w > W - gap && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
    let px = x, py = y;
    if (p) { px = p[0]; py = p[1]; }
    win.style.left = Math.max(0, Math.min(W - w, px)) + 'px';
    win.style.top = Math.max(0, Math.min(Hh - 24, py)) + 'px';
    x += w + gap; rowH = Math.max(rowH, h);
  }
}
function hackAction(act) {
  if (act === 'resetLayout') { placeHackWindows(true); return; }
  if (act === 'allOff') { hacks.on = { ...HACK_DEFAULTS }; saveHacks(); if (screen === 'play') updateHud(true); renderHackMenu(); toast('All hacks are off.'); return; }
  if (screen !== 'play' || game.finished) { toast('Start a level first.'); return; }
  if (act === 'restart') { if (game.paused) hideOverlay(); restart(); }
  else if (act === 'complete') {
    if (game.paused) { game.paused = false; hideOverlay(); }
    game.cheated = true;
    scrollX = world.endPx - shipCenterX;
    game.prevScroll = scrollX;
    onFinish();
  }
}
function hackMenuEvents(m) {
  // buttons never take the keyboard, so Space keeps flying the ship after a click
  m.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  m.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.hack) setHack(b.dataset.hack, !hacks.on[b.dataset.hack]);
    else if (b.dataset.hact) hackAction(b.dataset.hact);
    else if (b.dataset.hspeed) { hacks.speed = clampSpeed(b.dataset.hspeed); hacks.on.speedhack = true; saveHacks(); renderHackMenu(); }
  });
  m.addEventListener('change', e => {
    if (!e.target.dataset.hin) return;
    hacks.speed = clampSpeed(e.target.value); e.target.value = hacks.speed; saveHacks();
    renderHackMenu();
  });
  // dragging a window by its title
  let drag = null;
  m.addEventListener('pointerdown', e => {
    const head = e.target.closest('.hk-head');
    if (!head) return;
    const win = head.parentElement;
    e.preventDefault();
    head.setPointerCapture(e.pointerId);
    drag = { win, dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    m.appendChild(win);                    // the window you grab goes on top
  });
  m.addEventListener('pointermove', e => {
    if (!drag) return;
    const { win } = drag;
    const x = Math.max(0, Math.min(innerWidth - win.offsetWidth, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(innerHeight - 24, e.clientY - drag.dy));
    win.style.left = x + 'px'; win.style.top = y + 'px';
  });
  const drop = () => {
    if (!drag) return;
    hacks.pos[drag.win.dataset.win] = [drag.win.offsetLeft, drag.win.offsetTop]; saveHacks();
    drag = null;
  };
  m.addEventListener('pointerup', drop);
  m.addEventListener('pointercancel', drop);
}
window.addEventListener('resize', () => placeHackWindows());

// --- the Status labels (top left while playing) ---
const fpsMeter = { frames: 0, t0: 0, fps: 0 };
function countFrame(now) {
  fpsMeter.frames++;
  if (now - fpsMeter.t0 >= 500) { fpsMeter.fps = Math.round(fpsMeter.frames * 1000 / (now - fpsMeter.t0)); fpsMeter.frames = 0; fpsMeter.t0 = now; }
}
const clickTimes = [];
function noteClick() {
  game.clicks++;
  clickTimes.push(performance.now());
}
let statusKey = '';
function updateStatus(now) {
  const lines = [];
  if (hk('cheatIndicator')) lines.push(`<i class="hk-dot${game.cheated || cheatsOn() ? ' red' : ''}"></i>`);
  if (hk('noclip')) {
    const nc = game.nc, cls = Me.clipped ? ' class="hit"' : '';
    if (hk('ncAcc')) lines.push(`<span${cls}>ACCURACY: ${(nc.steps ? 100 * (1 - nc.dead / nc.steps) : 100).toFixed(2)}%</span>`);
    if (hk('ncDeaths')) lines.push(`<span${cls}>DEATHS: ${nc.deaths}</span>`);
  }
  if (hk('fps')) lines.push(`<span>FPS: ${fpsMeter.fps}</span>`);
  if (hk('cps')) {
    while (clickTimes.length && now - clickTimes[0] > 1000) clickTimes.shift();
    lines.push(`<span>CPS: ${clickTimes.length} / ${game.clicks}</span>`);
  }
  if (hk('attempts')) lines.push(`<span>ATTEMPT ${game.attempts}</span>`);
  if (hk('time')) lines.push(`<span>TIME: ${game.time.toFixed(2)}</span>`);
  if (hk('position')) lines.push(`<span>X: ${((shipCenterX + scrollX) / gridSize).toFixed(1)} Y: ${(Me.y / gridSize).toFixed(1)}</span>`);
  if (hk('clock')) lines.push(`<span>${new Date().toLocaleTimeString()}</span>`);
  const key = lines.join('');
  if (key === statusKey) return;
  statusKey = key;
  $('hudLabels').innerHTML = lines.join('');
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
  editorMode: false, showProgress: true, showPercent: true, showAttempts: true, showLevelName: true, lowDetail: false,
  edHitboxes: false, edGrid: true, edInfo: true, edTrail: true, edCoords: true, edWarnings: true,
  swipe: true, freeMove: true, snap: true,
  art: 'gd', quality: 'medium',
  seenWarning: false,               // the photosensitivity warning was shown and accepted
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
  edLayer: -1, lockedLayers: new Set(),      // editor layers: -1 = ALL (only kept while the level is open)
};
const edCanvas = $('edCanvas'), edCtx = edCanvas.getContext('2d');
function edRequestDraw() { ed.needsDraw = true; }

function edOpen(level) {
  if (ed.level !== level) {
    ed.level = level; ed.sel.clear(); ed.undo = []; ed.redo = []; ed.trail = null; ed.camSet = false;
    ed.edLayer = -1; ed.lockedLayers = new Set();
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
  const d = brushDef(X, Y), layer = ed.edLayer >= 0 ? ed.edLayer : layerDefault(d[0]);
  if (layer !== layerDefault(d[0])) setOpt(d, 'editorL', layer);     // built on the layer you are on
  const key = JSON.stringify(d);
  const solidLike = d[0] === 'Block' || d[0] === 'GridBlock';
  if (ed.level.objects.some(o => JSON.stringify(o) === key || (solidLike && o[0] === d[0] && o[1] === X && o[2] === Y))) return null;
  ed.level.objects.push(d);
  // like Geometry Dash: the object you just placed is selected, so the
  // arrow keys / WASD and the action buttons work on it straight away
  // (not on a locked layer: those objects cannot be selected)
  ed.sel = ed.lockedLayers.has(layer) ? new Set() : new Set([d]);
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
  if (o.t === 'ThornPit' && o.design && o.design.startsWith('pit_b')) {     // tall thorn bushes
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
    if (!edCanTouch(o) || !objContains(o, wx, wy)) continue;
    if (!best || drawOrder(o, best) > 0) best = o;       // the one drawn on top
  }
  return best ? best.def : null;
}
function removeDefs(set) {
  ed.level.objects = ed.level.objects.filter(d => !set.has(d));
  for (const d of set) ed.sel.delete(d);
}

// --- editor layers (the pink arrows and number under GO TO LAYER) ---
// ed.edLayer is the layer you are building on, or -1 for ALL (every layer at
// once). On a layer, only objects on it (EDITOR L or EDITOR L2) can be picked,
// selected, moved, edited or deleted; the rest are drawn see-through.
// Objects on a locked layer cannot be selected or deleted from any view, but
// new objects can still be placed on it (like Geometry Dash).
const onLayer = (o, n) => o.edL === n || (o.edL2 > 0 && o.edL2 === n);
const layerLocked = o => ed.lockedLayers.has(o.edL) || (o.edL2 > 0 && ed.lockedLayers.has(o.edL2));
const edInView = o => ed.edLayer < 0 || onLayer(o, ed.edLayer);
const edCanTouch = o => !!o && edInView(o) && !layerLocked(o);
const edCanTouchDef = d => edCanTouch(ed.byDef.get(d));
const edFade = o => (edInView(o) ? 1 : 0.3) * (o.hide ? 0.35 : 1);     // how see-through it is drawn
function edPruneSel() { for (const d of [...ed.sel]) if (!edCanTouchDef(d)) ed.sel.delete(d); }
function edSetLayer(n) {
  ed.edLayer = n < 0 ? -1 : Math.min(EDITOR_LAYER_MAX, n);
  edPruneSel(); edRequestDraw(); edRenderUI();
}
function edLayerStep(dir) {
  if (ed.edLayer < 0) { if (dir > 0) edSetLayer(0); return; }    // from ALL, the right arrow goes to layer 0
  edSetLayer(Math.max(0, ed.edLayer + dir));
}
// Clicking the layer number locks or unlocks that layer
function edToggleLock() {
  if (ed.edLayer < 0) return toast('Go to a layer with the pink arrows first, then click its number to lock it.');
  const n = ed.edLayer, L = ed.lockedLayers;
  if (L.has(n)) L.delete(n); else L.add(n);
  edPruneSel(); edRequestDraw(); edRenderUI();
  toast(L.has(n) ? `Layer ${n} locked: its objects cannot be selected or deleted.` : `Layer ${n} unlocked.`);
}
// GO TO LAYER: jump to the layer of the (first) selected object. It stays
// selected, and so do the others on that layer; the rest drop out, like any layer switch.
function edGoToLayer() {
  const first = ed.sel.values().next().value;
  if (!first) return toast('Select an object first. GO TO LAYER takes you to its editor layer.');
  edSetLayer(ed.byDef.get(first).edL);
}
// The lowest editor layer that no object is on yet, from `from` up (the + buttons in EDIT GROUP;
// EDITOR L2 starts at 1, since 0 there means no second layer)
function freeEditorLayer(from = 0) {
  for (let n = from; n <= EDITOR_LAYER_MAX; n++) if (!ed.built.some(o => onLayer(o, n))) return n;
  return from;
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
  ed.sel = new Set(ed.level.objects.filter(d => test(d) && edCanTouchDef(d)));     // only this layer, never locked ones
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
  const fresh = ed.clip.map(d => { const c = clone(d); moveDef(c, dX, dY); return c; });
  edChange(() => { ed.level.objects.push(...fresh); });
  ed.sel = new Set(fresh); edPruneSel(); edRenderUI();
}
function edDuplicate() {
  const list = selectedList();
  if (!list.length) return toast('Select something first: click an object in Edit mode.');
  const fresh = clone(list);
  edChange(() => { ed.level.objects.push(...fresh); });
  ed.sel = new Set(fresh); edPruneSel(); edRenderUI();
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
        if (!edCanTouch(o)) continue;
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
  track('test-level');
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
  drawSky(ctx, W, H, sc(CH.BG), c.x, Math.max(H, 400 * c.scale));
  ctx.setTransform(k, 0, 0, k, -c.x * k, -c.y * k);

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
  DRAW.fade = edFade;                // other editor layers and hidden objects are see-through
  drawObjects(ctx, vis);
  DRAW.fade = null;
  // the floor and ceiling cover whatever reaches past them, as in the game
  drawStage(ctx, x0, x1, y0, y1, sc(CH.GROUND), sc(CH.LINE));

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
    b.disabled = a === 'paste' ? !ed.clip : a === 'selall' ? !ed.level.objects.length : a === 'golayer' ? false : !n;
  }
  // the layer number: ALL, or the layer (orange when it is locked)
  const ln = $('edLayerNum'), locked = ed.edLayer >= 0 && ed.lockedLayers.has(ed.edLayer);
  ln.textContent = ed.edLayer < 0 ? 'ALL' : String(ed.edLayer);
  ln.classList.toggle('locked', locked);
  ln.title = ed.edLayer < 0 ? 'Showing every editor layer' : `Layer ${ed.edLayer}${locked ? ' (locked)' : ''}: click to ${locked ? 'unlock' : 'lock'} it`;
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
  return `<button class="ch-chip" type="button" data-chip="${kind}" title="Edit Object: the ${kind === 'detail' ? 'detail' : 'base'} color of the selection">
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
  // editor layer(s), and the group IDs (the button opens EDIT GROUP)
  const shared = f => { const v = f(list[0]); return list.every(d => f(d) === v) ? v : null; };
  const lay = shared(d => { const o = ed.byDef.get(d); return o.edL + (o.edL2 > 0 && o.edL2 !== o.edL ? ', ' + o.edL2 : ''); });
  html += `<button type="button" class="field sel-layer" data-golayer title="GO TO LAYER: show only this editor layer"><span class="field-label">LAYER</span><span class="sel-val o">${lay === null ? 'MIXED' : lay}</span></button>`;
  // a copy of the layer row under GO TO LAYER, shown only on a short phone, where this panel covers that row
  const ln = $('edLayerNum');
  html += `<div class="sel-layers" role="group" aria-label="Editor layer">
    <button class="layer-arrow all" type="button" data-layer="all" title="Show all layers" aria-label="Show all layers"><svg aria-hidden="true"><use href="#i-page"/></svg></button>
    <button class="layer-arrow" type="button" data-layer="-1" title="Previous layer" aria-label="Previous layer"><svg aria-hidden="true"><use href="#i-page-pink"/></svg></button>
    <button class="layer-num o${ln.classList.contains('locked') ? ' locked' : ''}" type="button" data-layer="lock" title="${esc(ln.title)}">${ln.textContent}</button>
    <button class="layer-arrow right" type="button" data-layer="1" title="Next layer" aria-label="Next layer"><svg aria-hidden="true"><use href="#i-page-pink"/></svg></button></div>`;
  const gs = shared(d => ed.byDef.get(d).groups.join(', '));
  html += `<div class="field ch-field"><span class="field-label">GROUPS</span><button class="ch-chip" type="button" data-open-egroup title="Edit Group: group IDs, editor layers, Z layer"><span class="ch-name">${gs === null ? 'MIXED' : gs || 'NONE'}</span></button></div>`;
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
  if (chip) { openEditObject(chip.dataset.chip); return; }
  if (e.target.closest('[data-open-egroup]')) { openEditGroup(); return; }
  if (e.target.closest('[data-golayer]')) { edGoToLayer(); return; }
  const l = e.target.closest('[data-layer]');
  if (l) { edLayerButton(l.dataset.layer); return; }
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
  // and the colors objects have without being given one (like channel 1 on deco details)
  for (const o of ed.built) { if (o.ch) used.add(o.ch); if (o.dch) used.add(o.dch); }
  if (ed.level.objects.some(d => d[0] === 'ColorTrigger' && (optsOf(d) || {}).channel == null)) used.add(1);
  used.delete(0);
  return used;
}
function nextFreeChannel(from = 1) { const u = usedChannels(); for (let i = Math.max(1, from); i <= 999; i++) if (!u.has(i)) return i; return 1; }
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
  cpMenu(false);
  $('colorPop').hidden = true;
  if (snapshot() !== cp.snap) { ed.undo.push(cp.snap); if (ed.undo.length > 200) ed.undo.shift(); ed.redo = []; }
  edChanged(); edRenderUI();
  if (cp.back === 'picker') chpRefresh();
  else if (cp.back === 'settings') refreshSettings();
  else if (cp.back === 'eobj') eoRender();
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
    for (const k of EG_KEEP) if (old[k] != null) op[k] = old[k];     // its EDIT GROUP settings stay
    if (optsOf(d)) d.pop();
    d.push(op);
  } else {
    const key = chKey(cp.id), json = specJSON(s), plain = specJSON(defaultSpec(cp.id));
    if (JSON.stringify(json) === JSON.stringify(plain)) delete ed.level.colors[key]; else ed.level.colors[key] = json;
  }
  edRebuild(); edRequestDraw();
}
// The level's own channels a color trigger can change besides 1-999 (in the + menu next to COLOR ID)
const CP_NAMED = [CH.BG, CH.GROUND, CH.LINE, CH.OBJ];
function cpMenu(open) { $('cpMenu').hidden = !open; $('cpPlus').setAttribute('aria-expanded', String(open)); }
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
  for (const nb of document.querySelectorAll('#cpMenu [data-cpnamed]')) nb.setAttribute('aria-pressed', String(Number(nb.dataset.cpnamed) === cp.id));
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
  const b = e.target.closest('button');
  if (!b || b.id !== 'cpPlus') cpMenu(false);     // any other click closes the + menu
  if (!b) return;
  const step = (id, dir) => {
    const at = CP_NAMED.indexOf(id);
    if (at >= 0) { const k = at + dir; return k < 0 ? 999 : k >= CP_NAMED.length ? 1 : CP_NAMED[k]; }
    const n = id >= 1 && id <= 999 ? id + dir : dir > 0 ? 1 : 999;
    return n < 1 ? CP_NAMED[CP_NAMED.length - 1] : n > 999 ? CP_NAMED[0] : n;
  };
  if (b.dataset.cpid) cpSetChannel(step(cp.id, Number(b.dataset.cpid)));
  else if (b.dataset.cpnamed) cpSetChannel(Number(b.dataset.cpnamed));
  else if (b.hasAttribute('data-cpfree')) cpSetChannel(nextFreeChannel());
  else if (b.dataset.cpcopy) { cp.spec.copy = step(cp.spec.copy, Number(b.dataset.cpcopy)); if (cp.spec.copy === cp.id) cp.spec.copy = step(cp.spec.copy, Number(b.dataset.cpcopy)); cpWrite(); cpRender(); }
  else if (b.id === 'cpPlus') cpMenu($('cpMenu').hidden);
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
// The lowest group ID the level does not use yet (in objects' groups or as an
// alpha trigger's target), counting up from `from`. `skip` is the alpha trigger
// being edited: its own target does not count, so NEXT FREE there keeps giving the same ID.
function nextFreeGroup(from = 1, skip = null) {
  const used = new Set();
  for (const d of ed.level.objects) {
    const op = optsOf(d) || {};
    for (const g of op.groups || []) used.add(Number(g));
    if (d[0] === 'AlphaTrigger' && op.group && d !== skip) used.add(Number(op.group));
  }
  for (let i = Math.max(1, from); i < 10000; i++) if (!used.has(i)) return i;
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
    <p>When the ship passes this trigger, every object in the group fades to this opacity. To put objects in a group, select them and press EDIT GROUP.</p>
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
  for (const k of EG_KEEP) if (old[k] != null) op[k] = old[k];       // its EDIT GROUP settings stay
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
  else if (b.id === 'alFree') $('alGroup').value = nextFreeGroup(1, ap.def);
  else return;
  alWrite(false);
  alNote();
});

// --- the EDIT OBJECT window: the color of the selection (laid out like Geometry Dash's) ---
// BASE / DETAIL picks which of the two colors you are changing. Clicking a
// channel gives it to every selected object that has that color, and the
// square at the bottom right changes the channel itself (for the whole level).
// HSV shifts the color of just these objects. Every change is one undo step.
// (A single trigger opens its own window instead, like Geometry Dash.)
const eo = { kind: 'main', page: 0, offset: 0, hsv: false, live: false, clip: null };
const eoRecent = [];                 // channels given out this session, newest first
const EO_PER = 35, EO_PAGES = Math.ceil(999 / EO_PER), EO_RECENT = 15;
// The SPECIAL column, 5 rows of 3: [label, channel (-1 = D, 0 = not in Ship Run), the color a 0 is drawn in]
const EO_SPECIAL = [
  ['D', -1], ['P1', CH.P1], ['P2', CH.P2],
  ['BG', CH.BG], ['G1', CH.GROUND], ['MG', 0, CH.GROUND],
  ['LBG', 0, CH.BG], ['G2', 0, CH.GROUND], ['MG2', 0, CH.GROUND],
  ['OBJ', CH.OBJ], ['L', CH.LINE], ['3DL', 0, CH.LINE],
  ['LTR', 0, CH.WHITE], ['', CH.BLACK], ['', CH.WHITE],
];
const EO_LABEL = Object.fromEntries(EO_SPECIAL.filter(s => s[1] > 0).map(([label, id]) => [id, label]));
const EO_NAMES = { [CH.P1]: 'P1: player color 1', [CH.P2]: 'P2: player color 2', [CH.BG]: 'BG: the background', [CH.GROUND]: 'G1: the ground',
  [CH.OBJ]: 'OBJ: the object color', [CH.LINE]: 'L: the ground line', [CH.BLACK]: 'Black', [CH.WHITE]: 'White' };
// HSV as the window shows it (no change = hue 0, saturation and brightness x1)
const HSV_NONE = { h: 0, s: 1, v: 1, sAdd: false, vAdd: false };
const eoHsvKey = () => eo.kind === 'detail' ? 'detailHsv' : 'hsv';
function hsvOf(d, key = eoHsvKey()) {
  const v = optOf(d, key);
  if (!isOpts(v)) return { ...HSV_NONE };
  return parseHsv(v) || { ...HSV_NONE, s: v.sAdd ? 0 : 1, v: v.vAdd ? 0 : 1, sAdd: !!v.sAdd, vAdd: !!v.vAdd };
}
// The shortest levels.js form: {"h": 40, "s": 0.5}. A ticked ADD box is kept even at 0.
const round2 = v => Number(Number(v).toFixed(2));
function hsvJSON(x) {
  const out = {}, h = Math.round(x.h), s = round2(x.s), v = round2(x.v);
  if (h) out.h = h;
  if (s !== (x.sAdd ? 0 : 1)) out.s = s;
  if (v !== (x.vAdd ? 0 : 1)) out.v = v;
  if (x.sAdd) out.sAdd = true;
  if (x.vAdd) out.vAdd = true;
  return Object.keys(out).length ? out : null;
}
// The selected objects this window changes: all with a color, or all with a detail color
const eoList = () => selectedList().filter(eo.kind === 'detail' ? hasDetail : isColorable);
const eoChOf = d => { const o = ed.byDef.get(d); return eo.kind === 'detail' ? o.dch : o.ch; };
function eoCurrent(list = eoList()) { const id = list.length ? eoChOf(list[0]) : 0; return list.every(d => eoChOf(d) === id) ? id : 0; }   // 0 = mixed

// The [i] buttons of EDIT GROUP and EDIT OBJECT: an INFO popup over the window, like Geometry Dash's
function showInfo(text) { showModal('INFO', `<p>${esc(text)}</p>`, [{ label: 'OK', primary: true, fn: hideModal }]); }

function openEditObject(kind = 'main') {
  const list = selectedList();
  if (!list.length) return toast('Select something first: click an object in Edit mode.');
  if (list.length === 1 && isTrigger(list[0][0])) { openTriggerEditor(list[0]); return; }
  if (!list.some(isColorable)) return toast('Nothing selected can be colored.');
  eo.kind = kind === 'detail' && list.some(hasDetail) ? 'detail' : 'main';
  eo.hsv = false;
  eoShowPage();
  $('eoPop').hidden = false;
  eoRender();
}
function eoShowPage() { const id = eoCurrent(); eo.page = id >= 1 && id <= 999 ? Math.floor((id - 1) / EO_PER) : 0; }
function eoRender() {
  const pop = $('eoPop');
  if (pop.hidden) return;
  const list = eoList();
  if (!list.length) { closeEditObject(); return; }
  pop.innerHTML = eoHTML(list);
  pop.querySelectorAll('[data-some]').forEach(c => { c.indeterminate = true; });
  fitText(pop);
  placeToast();
}
function closeEditObject() {
  const pop = $('eoPop');
  if (pop.hidden) return;
  eoLiveEnd();
  pop.hidden = true; pop.innerHTML = '';
  edRenderUI();
}
// Gives the objects channel id (-1 = D: each back to its own default color)
function eoApply(id) {
  const key = eo.kind === 'detail' ? 'detail' : 'color', list = eoList();
  egChange(() => {
    for (const d of list) {
      const o = ed.byDef.get(d), def0 = eo.kind === 'detail' ? o.dch0 : o.ch0;
      setOpt(d, key, id === -1 || id === def0 ? null : chKey(id));
    }
  });
  if (id > 0) { const i = eoRecent.indexOf(id); if (i >= 0) eoRecent.splice(i, 1); eoRecent.unshift(id); eoRecent.length = Math.min(eoRecent.length, EO_RECENT); }
  eoRender();
}
// COPY / PASTE: the channels and HSV of one object, onto the whole selection
function eoCopy() {
  const d = selectedList().find(isColorable), o = ed.byDef.get(d);
  const raw = k => optOf(d, k) == null ? null : clone(optOf(d, k));
  eo.clip = { ch: o.ch, dch: o.dch, hsv: raw('hsv'), detailHsv: raw('detailHsv') };
  toast(ed.sel.size > 1 ? 'Copied the color of the first selected object.' : 'Color copied. Select other objects and press PASTE.');
}
function eoPaste() {
  const c = eo.clip, list = selectedList().filter(isColorable);
  if (!c) return;
  egChange(() => {
    for (const d of list) {
      const o = ed.byDef.get(d);
      setOpt(d, 'color', c.ch === o.ch0 ? null : chKey(c.ch)); setOpt(d, 'hsv', c.hsv && clone(c.hsv));
      if (o.dch0 && c.dch) { setOpt(d, 'detail', c.dch === o.dch0 ? null : chKey(c.dch)); setOpt(d, 'detailHsv', c.detailHsv && clone(c.detailHsv)); }
    }
  });
  toast(`Pasted the color onto ${list.length} object${list.length > 1 ? 's' : ''}.`);
}
// HSV: k is 'h', 's' or 'v'. A value typed or dragged is written to every object
// (in the mode the window shows when their ADD boxes differ).
function eoSetHsv(k, val) {
  const key = eoHsvKey(), list = eoList(), add = k !== 'h' && list.every(d => hsvOf(d, key)[k + 'Add']);
  const [lo, hi] = k === 'h' ? [-180, 180] : add ? [-1, 1] : [0, 2];
  for (const d of list) {
    const x = hsvOf(d, key);
    x[k] = Math.max(lo, Math.min(hi, val));
    if (k !== 'h') x[k + 'Add'] = add;
    setOpt(d, key, hsvJSON(x));
  }
}
function eoSetAdd(k, on) {           // ADD on: saturation / brightness are added, so they start at 0
  const key = eoHsvKey();
  for (const d of eoList()) { const x = hsvOf(d, key); x[k + 'Add'] = on; x[k] = on ? 0 : 1; setOpt(d, key, hsvJSON(x)); }
}
// A slider drag changes the objects while it moves, and the whole drag is one undo step
function eoLive(k, val) {
  if (!eo.live) { beginChange(); eo.live = true; }
  eoSetHsv(k, val);
  edRebuild(); edRequestDraw();
  eoHsvShow();
}
// Shows the objects' HSV in the open HSV window without building it again. Rebuilding
// would swap out the button under the pointer, so a click on OK or RESET right after
// typing in a box (which fires the box's "change" first) would be lost.
function eoHsvShow() {
  const pop = $('eoPop'), list = eoList();
  if (!list.length) return;
  const xs = list.map(d => hsvOf(d));
  for (const k of ['h', 's', 'v']) {
    const v = xs.every(x => x[k] === xs[0][k]) ? xs[0][k] : null;
    const box = pop.querySelector(`[data-eohsvnum="${k}"]`), range = pop.querySelector(`[data-eohsv="${k}"]`);
    if (box) { box.value = v === null ? '' : k === 'h' ? String(v) : v.toFixed(2); box.placeholder = v === null ? 'MIXED' : ''; }
    if (range && v !== null) range.value = String(v);
  }
  const after = pop.querySelector('.eo-after');
  if (after) after.style.background = cssOf(eoPreview(list[0]).after);
  const btn = pop.querySelector('.eo-hsv-btn');
  if (btn) btn.classList.toggle('on', list.some(d => parseHsv(optOf(d, eoHsvKey()))));
}
function eoLiveEnd() {
  if (!eo.live) return;
  eo.live = false;
  if (snapshot() === ed.pending) { ed.pending = null; edChanged(); } else commitChange();
}
function eoPreview(d) {               // the channel's color, and this object's color after HSV
  const c = ed.cs.resolve(eoChOf(d), 0), x = parseHsv(optOf(d, eoHsvKey()));
  return { before: c, after: x ? shiftHsv(c, x) : c };
}

// One channel square: its color, its number (black or white, whichever shows),
// its opacity under the number when it is see-through, and a dot for blending
function eoCell(id, cur, label = EO_LABEL[id] ?? String(id)) {
  const c = ed.cs.resolve(id, 0), light = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 150, blend = ed.cs.spec(id).blend;
  return `<button type="button" class="eo-ch${light ? ' light' : ''}${blend ? ' blend' : ''}" data-eoch="${id}" aria-pressed="${id === cur}"
    style="background:${cssOf(c)}" title="${EO_NAMES[id] || 'Channel ' + id}${blend ? ' (blending)' : ''}">${label ? `<span class="eo-n o">${label}</span>` : ''}${c.a < 1 ? `<span class="eo-op o">${c.a.toFixed(2)}</span>` : ''}</button>`;
}
const eoEmpty = n => '<span class="eo-ch empty" aria-hidden="true"></span>'.repeat(Math.max(0, n));
function eoHTML(list) {
  const cur = eoCurrent(list), det = selectedList().some(hasDetail), base = eo.kind !== 'detail';
  const special = EO_SPECIAL.map(([label, id, look]) => id === -1
    ? `<button type="button" class="eo-ch eo-d" data-eoch="-1" title="Default: each object goes back to its own color"><span class="eo-n o">D</span></button>`
    : id ? eoCell(id, cur, label)
    : `<button type="button" class="eo-ch off" disabled title="Not used in Ship Run" style="background:${cssOf(ed.cs.resolve(look, 0))}"><span class="eo-n o">${label}</span></button>`).join('');
  const first = eo.page * EO_PER + 1, ids = [];
  for (let i = first; i < first + EO_PER && i <= 999; i++) ids.push(i);
  const c = cur ? ed.cs.resolve(cur, 0) : null;
  const hsvOn = list.some(d => parseHsv(optOf(d, eoHsvKey())));
  return `<div class="eo-wrap">
    <button type="button" class="gd-btn eo-base${det ? '' : ' only'}" data-eo="kind" title="${det ? `Switch to the ${base ? 'detail' : 'base'} color` : 'These objects only have a base color'}">${base ? 'BASE' : 'DETAIL'}</button>
    <div class="gd-panel eo-panel" role="dialog" aria-modal="true" aria-label="Edit object">
      <div class="eo-head">
        <button type="button" class="gd-btn eo-hsv-btn${hsvOn ? ' on' : ''}" data-eo="hsv" title="HSV: shift the hue, saturation and brightness of just these objects">HSV<span class="eo-hsv-bar"></span></button>
        <h2><span class="gold" data-fit>${base ? 'BASE' : 'DETAIL'} COLOR</span></h2>
        <button type="button" class="cp-info eo-info" data-eo="info" aria-label="What this does">i</button>
      </div>
      <div class="eo-board">
        <div class="eo-sec eo-special"><div class="eo-sec-title"><span class="gold">SPECIAL</span></div><div class="eo-g3">${special}</div></div>
        <div class="eo-sec eo-chans">
          <div class="eo-sec-title">
            <button type="button" class="cp-arrow left eo-arrow" data-eopage="-1" aria-label="Previous page"><svg aria-hidden="true"><use href="#i-tri"/></svg></button>
            <span class="gold">PAGE ${eo.page + 1} / ${EO_PAGES}</span>
            <button type="button" class="cp-arrow eo-arrow" data-eopage="1" aria-label="Next page"><svg aria-hidden="true"><use href="#i-tri"/></svg></button>
          </div>
          <div class="eo-g7">${ids.map(id => eoCell(id, cur)).join('')}${eoEmpty(EO_PER - ids.length)}</div>
        </div>
        <div class="eo-sec eo-recent"><div class="eo-sec-title"><span class="gold">RECENT</span></div>
          <div class="eo-g3">${eoRecent.map(id => eoCell(id, cur)).join('')}${eoEmpty(EO_RECENT - eoRecent.length)}</div></div>
      </div>
      <div class="eo-foot">
        <div class="eo-free">
          <button type="button" class="gd-btn gray eg-btn" data-eo="free" title="The lowest channel the level does not use yet, from OFFSET up"><span class="gold">NEXT FREE</span></button>
          <label class="eg-off"><span class="gold">OFFSET</span><input class="eg-num small" type="number" min="0" max="999" data-eonum="offset" value="${eo.offset || ''}" placeholder="NUM" aria-label="Offset for NEXT FREE"></label>
        </div>
        <button type="button" class="gd-btn big eo-ok" data-eo="ok">OK</button>
        <div class="eo-cur">
          <span class="gold">${cur ? chLabel(cur) : 'MIXED'}</span>
          <button type="button" class="eo-swatch" data-eo="edit" style="background:${c ? cssOf(c) : 'linear-gradient(135deg,#fff 50%,#000 50%)'}"
            title="${!cur ? 'The objects use different channels' : CH_FIXED.has(cur) ? 'This channel never changes' : 'Change the color of channel ' + chLabel(cur)}" aria-label="Edit this channel's color"></button>
        </div>
      </div>
    </div>
    <div class="eg-side eo-side">
      <button type="button" class="gd-btn gray eg-side-btn" data-eo="copy" title="Copy the color and HSV of the selected object"><span class="gold">COPY</span></button>
      <button type="button" class="gd-btn gray eg-side-btn" data-eo="paste" title="Paste the copied color onto the selection"${eo.clip ? '' : ' disabled'}><span class="gold">PASTE</span></button>
    </div>
  </div>${eo.hsv ? eoHsvHTML(list) : ''}`;
}
// The HSV window, over the color window
function eoHsvHTML(list) {
  const xs = list.map(d => hsvOf(d)), sh = k => xs.every(x => x[k] === xs[0][k]) ? xs[0][k] : null;
  const p = eoPreview(list[0]);
  const row = (k, label) => {
    const v = sh(k), add = k === 'h' ? null : sh(k + 'Add');
    const [lo, hi, step] = k === 'h' ? [-180, 180, 1] : add ? [-1, 1, 0.01] : [0, 2, 0.01];
    const none = k === 'h' || add ? 0 : 1;
    return `<div class="eo-hrow">
      <span class="gold">${label}</span>
      <input type="range" class="gd-range eo-range" data-eohsv="${k}" min="${lo}" max="${hi}" step="${step}" value="${v ?? none}" aria-label="${label}">
      <input class="eg-num small" type="number" data-eohsvnum="${k}" min="${lo}" max="${hi}" step="${step}" value="${v === null ? '' : k === 'h' ? v : v.toFixed(2)}" placeholder="${v === null ? 'MIXED' : ''}" aria-label="${label}">
      ${k === 'h' ? '<span></span>' : `<label class="gd-toggle" title="Add to the ${label.toLowerCase()} (-1 to 1) instead of multiplying it (0 to 2)"><input type="checkbox" class="gd-check" data-eoadd="${k}"${add ? ' checked' : ''}${add === null ? ' data-some' : ''}> ADD</label>`}
    </div>`;
  };
  return `<div class="eo-hsv-back" data-eo="hsvback">
    <div class="gd-panel eo-hsv" role="dialog" aria-modal="true" aria-label="HSV">
      <h3><span class="gold">${eo.kind === 'detail' ? 'DETAIL' : 'BASE'} HSV</span></h3>
      <div class="eo-prev"><span class="eo-sw" style="background:${cssOf(p.before)}" title="The channel's color"></span><svg class="eo-to" aria-hidden="true"><use href="#i-tri"/></svg><span class="eo-sw eo-after" style="background:${cssOf(p.after)}" title="This object's color"></span></div>
      ${row('h', 'HUE')}${row('s', 'SATURATION')}${row('v', 'BRIGHTNESS')}
      <p class="eg-note">Changes the color of just the selected objects, not the whole channel.</p>
      <div class="btn-row"><button type="button" class="gd-btn gray" data-eo="hsvreset">RESET</button><button type="button" class="gd-btn" data-eo="hsvok">OK</button></div>
    </div>
  </div>`;
}
// Escape: the HSV window first, then this one
function eoBack() { if (eo.hsv) { eoLiveEnd(); eo.hsv = false; eoRender(); } else closeEditObject(); }
$('eoPop').addEventListener('click', e => {
  eoLiveEnd();                         // a slider drag that never got its "change" ends here
  if (e.target.id === 'eoPop') { closeEditObject(); return; }
  if (e.target.dataset.eo === 'hsvback') { eoBack(); return; }
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.eoch) eoApply(Number(d.eoch));
  else if (d.eopage) { eo.page = (eo.page + Number(d.eopage) + EO_PAGES) % EO_PAGES; eoRender(); }
  else if (d.eo === 'kind') {
    if (!selectedList().some(hasDetail)) { toast('These objects only have a base color.'); return; }
    eo.kind = eo.kind === 'detail' ? 'main' : 'detail'; eoShowPage(); eoRender();
  }
  else if (d.eo === 'free') { const id = nextFreeChannel(eo.offset); eo.page = Math.floor((id - 1) / EO_PER); eoApply(id); }
  else if (d.eo === 'edit') {
    const id = eoCurrent();
    if (!id) toast('These objects use different channels. Pick one for all of them first.');
    else if (CH_FIXED.has(id)) toast('Black, white and the player colors never change.');
    else openColorPop({ mode: 'channel', id, back: 'eobj' });
  }
  else if (d.eo === 'copy') { eoCopy(); eoRender(); }
  else if (d.eo === 'paste') { eoPaste(); eoRender(); }
  else if (d.eo === 'hsv') { eo.hsv = true; eoRender(); }
  else if (d.eo === 'hsvok') { eo.hsv = false; eoRender(); }
  else if (d.eo === 'hsvreset') { const key = eoHsvKey(); egChange(() => { for (const x of eoList()) setOpt(x, key, null); }); eoRender(); }
  else if (d.eo === 'ok') closeEditObject();
  else if (d.eo === 'info') showInfo(`Click a channel to give it to the ${eo.kind === 'detail' ? 'detail color' : 'color'} of the selected objects. D puts each back to its own. `
    + 'Color triggers change a channel, and every object on it changes too. The square at the bottom right edits the channel; HSV changes just these objects.');
});
$('eoPop').addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.eonum === 'offset') eo.offset = intIn(t.value, 0, 999, 0);
  else if (t.dataset.eohsv) eoLive(t.dataset.eohsv, Number(t.value));
});
$('eoPop').addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.eohsv) { eoLiveEnd(); eoHsvShow(); return; }
  if (d.eoadd) { egChange(() => eoSetAdd(d.eoadd, t.checked)); eoRender(); return; }
  if (!d.eohsvnum) return;
  const v = Number(t.value);
  if (t.value.trim() !== '' && Number.isFinite(v)) egChange(() => eoSetHsv(d.eohsvnum, d.eohsvnum === 'h' ? Math.round(v) : v));
  eoHsvShow();
});

// --- the EDIT GROUP window (laid out like Geometry Dash's) ---
// Editor layers, group IDs, Z layer and Z order, and the EXTRA / EXTRA2 tabs.
// It works on the whole selection: a box shows the value every selected object
// shares (blank when they differ), and only what you change is written.
// Every change is one undo step.
const eg = { tab: 'main', id: 0, offset: 0, clip: null };
// The Extra tab: [setting, label, does something in Ship Run]
const EXTRA_FLAGS = [
  ['dontFade', 'DONT FADE'], ['dontEnter', 'DONT ENTER'], ['noEffects', 'NO EFFECTS'], ['parent', 'GROUP PARENT', true],
  ['areaParent', 'AREA PARENT'], ['dontBoostY', 'DONT BOOST Y'], ['dontBoostX', 'DONT BOOST X'], ['highDetail', 'HIGH DETAIL', true],
  ['noTouch', 'NOTOUCH', true], ['passable', 'PASSABLE'], ['hide', 'HIDE', true], ['nonStickX', 'NONSTICKX'],
  ['nonStickY', 'NONSTICKY'], ['extraSticky', 'EXTRASTICKY'], ['extendedCollision', 'EXTENDED COLLISION'], ['iceBlock', 'ICEBLOCK'],
  ['gripSlope', 'GRIPSLOPE'], ['noGlow', 'NOGLOW', true], ['scaleStick', 'SCALESTICK'], ['noParticle', 'NOPARTICLE'],
  ['centerEffect', 'CENTER EFFECT'], ['singlePTouch', 'SINGLE PTOUCH'], ['noAudioScale', 'NO AUDIO SCALE'],
];
const FLAG_KEYS = EXTRA_FLAGS.filter(f => f[2] && f[0] !== 'parent').map(f => f[0]);     // hide, noTouch, highDetail, noGlow
const FLAG_HELP = {
  parent: 'Makes this object the parent of its group (shown pink). Same as the P button.',
  highDetail: 'Hidden while playing when LOW DETAIL MODE is on in Settings.',
  noTouch: 'The ship goes straight through it: no crash, no landing, and portals, pads, orbs, coins and touch triggers do nothing.',
  hide: 'Not drawn while playing, but it still works. The editor shows it faint.',
  noGlow: 'No soft white edge around black saws.',
};
const EG_INFO = {
  main: 'EDITOR L and L2: the editor layers the objects are on (the pink arrows under GO TO LAYER). Z LAYER: B layers are drawn behind the ship, T layers in front. Z ORDER: higher is drawn on top inside a Z layer. Alpha triggers fade group IDs.',
  extra: 'Ticked boxes change every selected object. Grey ones are Geometry Dash options that Ship Run does not use.',
  extra2: 'Special IDs are saved with the level for later. Nothing in Ship Run uses them yet.',
};
const optOf = (d, k) => (optsOf(d) || {})[k];
const groupsOf = d => ed.byDef.get(d).groups;
const parentOf = d => { const p = Math.round(Number(optOf(d, 'parent'))); return groupsOf(d).includes(p) ? p : 0; };
const zKeyOf = d => Z_LAYERS.includes(optOf(d, 'zLayer')) ? optOf(d, 'zLayer') : '';     // '' = DEFAULT
// The number boxes: how to read one setting and write it (0 or the default leaves it out of levels.js).
// "only" = the objects it is for (ORD, CH and Control ID are only for gameplay objects and triggers).
const forGameplay = d => isGameplay(d[0]);
const EG_NUM = {
  L:  { get: d => ed.byDef.get(d).edL, set: (d, v) => setOpt(d, 'editorL', v === layerDefault(d[0]) ? null : v), lo: 0, hi: EDITOR_LAYER_MAX },
  L2: { get: d => ed.byDef.get(d).edL2, set: (d, v) => setOpt(d, 'editorL2', v || null), lo: 0, hi: EDITOR_LAYER_MAX },
  Z:  { get: d => ed.byDef.get(d).zOrder, set: (d, v) => setOpt(d, 'zOrder', v || null), lo: -Z_ORDER_MAX, hi: Z_ORDER_MAX },
};
for (const k of ['ord', 'gch', 'enterCh', 'material', 'controlId']) {
  EG_NUM[k] = { get: d => intIn(optOf(d, k), -9999, 9999, 0), set: (d, v) => setOpt(d, k, v || null),
    lo: k === 'ord' ? -9999 : 0, hi: 9999, only: k === 'ord' || k === 'gch' || k === 'controlId' ? forGameplay : null };
}
// What COPY / PASTE carry over (EDITOR L is copied as a number, since its default depends on the object)
const EG_COPY = ['editorL2', 'zOrder', 'zLayer', 'groups', 'parent', 'ord', 'gch', 'enterCh', 'material', 'controlId', ...FLAG_KEYS];
const GAMEPLAY_ONLY = new Set(['ord', 'gch', 'controlId']);
// What a trigger's own window keeps when it writes the trigger again
const EG_KEEP = ['editorL', ...EG_COPY];

function egShared(list, f) { const v = f(list[0]); return list.every(d => f(d) === v) ? v : null; }    // null = they differ
// One undo step, and only when something really changed
function egChange(fn) { edChange(() => { fn(); return snapshot() !== ed.pending; }); }
function egSetNum(k, v, rel) {          // rel: the arrows add v to each object's own value
  const f = EG_NUM[k], list = selectedList().filter(d => !f.only || f.only(d));
  egChange(() => { for (const d of list) f.set(d, Math.max(f.lo, Math.min(f.hi, rel ? f.get(d) + v : v))); });
}
function egSetZ(z) { egChange(() => { for (const d of selectedList()) setOpt(d, 'zLayer', z || null); }); }
// The - and + next to Z LAYER (when the selection is on different Z layers): one step down or up
function egStepZ(dir) {
  egChange(() => {
    for (const d of selectedList()) {
      const r = zKeyOf(d) ? Z_LAYERS.indexOf(zKeyOf(d)) : Z_DEFAULT;
      setOpt(d, 'zLayer', Z_LAYERS[Math.max(0, Math.min(Z_LAYERS.length - 1, r + dir))]);
    }
  });
}
// ADD (and P: the group parent, pink). An object can have at most MAX_GROUPS group IDs.
function egAddGroup(asParent) {
  const id = eg.id, list = selectedList();
  if (!(id >= 1 && id <= 9999)) return toast('Type a group ID from 1 to 9999 first, or press NEXT FREE.');
  let full = 0;
  egChange(() => {
    for (const d of list) {
      const g = groupsOf(d);
      if (!g.includes(id)) {
        if (g.length >= MAX_GROUPS) { full++; continue; }
        setOpt(d, 'groups', [...g, id]);
      }
      if (asParent) setOpt(d, 'parent', parentOf(d) === id ? null : id);
    }
  });
  if (full) toast(list.length === 1 ? `This object already has ${MAX_GROUPS} group IDs, the most it can have.`
    : `${full} of the objects already had ${MAX_GROUPS} group IDs (the most), so they did not get ${id}.`);
}
// Clicking a group ID in the list takes it off every selected object
function egRemoveGroup(id) {
  egChange(() => {
    for (const d of selectedList()) {
      const g = groupsOf(d);
      if (g.includes(id)) setOpt(d, 'groups', g.length > 1 ? g.filter(x => x !== id) : null);
      if (Math.round(Number(optOf(d, 'parent'))) === id) setOpt(d, 'parent', null);
    }
  });
}
function egSetFlag(k, on) {
  const list = selectedList();
  if (k === 'parent') {                 // one object: parent of its first group (or the one it already is)
    const d = list[0], g = groupsOf(d);
    if (on && !g.length) return toast('Add a group ID first. The object becomes the parent of that group.');
    egChange(() => setOpt(d, 'parent', on ? (parentOf(d) || g[0]) : null));
    return;
  }
  egChange(() => { for (const d of list) setOpt(d, k, on ? true : null); });
}
function freeEnterChannel() {
  const used = new Set(ed.level.objects.map(d => intIn(optOf(d, 'enterCh'), 0, 9999, 0)));
  for (let i = 1; i < 10000; i++) if (!used.has(i)) return i;
  return 1;
}
function egCopy() {
  const d = selectedList()[0];
  eg.clip = { edL: ed.byDef.get(d).edL, op: Object.fromEntries(EG_COPY.map(k => [k, optOf(d, k) == null ? null : clone(optOf(d, k))])) };
  toast(ed.sel.size > 1 ? 'Copied the settings of the first selected object.' : 'Settings copied. Select other objects and press PASTE.');
}
function egPaste() {
  const c = eg.clip, list = selectedList();
  if (!c) return;
  egChange(() => {
    for (const d of list) {
      setOpt(d, 'editorL', c.edL === layerDefault(d[0]) ? null : c.edL);
      for (const k of EG_COPY) {
        if ((GAMEPLAY_ONLY.has(k) && !isGameplay(d[0])) || (k === 'parent' && list.length > 1)) continue;
        setOpt(d, k, c.op[k] == null ? null : clone(c.op[k]));
      }
      const p = optOf(d, 'parent');        // a parent must be one of the object's own groups
      if (p != null && !(optOf(d, 'groups') || []).map(Number).includes(Number(p))) setOpt(d, 'parent', null);
    }
  });
  toast(`Pasted onto ${list.length} object${list.length > 1 ? 's' : ''}.`);
}

const egArrow = (color, attrs, label, right) => `<button type="button" class="eg-arrow${right ? ' right' : ''}" ${attrs} aria-label="${label}"><svg aria-hidden="true"><use href="#i-page${color}"/></svg></button>`;
function egStepper(k, val, color, label) {
  return `<div class="eg-step">${egArrow(color, `data-egstep="${k}" data-dir="-1"`, label + ': less')}
    <input class="eg-num" type="number" data-egnum="${k}" value="${val === null ? '' : val}" placeholder="${val === null ? 'MIXED' : ''}" aria-label="${label}">
    ${egArrow(color, `data-egstep="${k}" data-dir="1"`, label + ': more', true)}</div>`;
}
const egPlus = (k, title) => `<button type="button" class="cp-plus eg-plus" data-egplus="${k}" title="${title}" aria-label="${title}">+</button>`;
function egMainHTML(list) {
  const sh = f => egShared(list, f), one = list.length === 1, play = list.every(forGameplay);
  // the group list: one chip per ID (pink = parent, dimmer = only some of the selected objects have it)
  const ids = [];
  for (const d of list) for (const g of groupsOf(d)) if (!ids.includes(g)) ids.push(g);
  const chips = ids.map(g => {
    const all = list.every(d => groupsOf(d).includes(g)), par = list.every(d => parentOf(d) === g);
    return `<button type="button" class="eg-chip o${par ? ' parent' : ''}${all ? '' : ' some'}" data-eggroup="${g}" title="Click to remove group ${g}${all ? '' : ' (only some of the selected objects have it)'}">${g}</button>`;
  }).join('');
  const z = sh(zKeyOf), tile = sh(d => Math.max(0, 9 - ed.byDef.get(d).layer));
  const zStep = dir => z === null ? `<button type="button" class="eg-zstep" data-egzstep="${dir}" title="Move every selected object one Z layer ${dir < 0 ? 'down' : 'up'}" aria-label="Z layer ${dir < 0 ? 'down' : 'up'}">${dir < 0 ? '−' : '+'}</button>` : '';
  const small = (k, label) => `<label class="eg-small"><span class="gold">${label}</span><input class="eg-num small" type="number" data-egnum="${k}" value="${sh(EG_NUM[k].get) ?? ''}" placeholder="${sh(EG_NUM[k].get) === null ? 'MIXED' : ''}" aria-label="${label}"></label>`;
  return `<div class="eg-top">
      <div class="eg-field"><div class="eg-title"><span class="gold">EDITOR L</span>${egPlus('L', 'The lowest layer with no objects on it')}</div>${egStepper('L', sh(EG_NUM.L.get), '', 'Editor layer')}</div>
      <div class="eg-field"><div class="eg-title"><span class="gold">EDITOR L2</span>${egPlus('L2', 'The lowest layer with no objects on it')}</div>${egStepper('L2', sh(EG_NUM.L2.get), '-pink', 'Second editor layer (0 = none)')}</div>
      <div class="eg-field"><div class="eg-title"><span class="gold">Z ORDER</span></div>${egStepper('Z', sh(EG_NUM.Z.get), '', 'Z order')}</div>
    </div>
    <div class="eg-title"><span class="gold">ADD GROUP ID</span></div>
    <div class="eg-add">
      <button type="button" class="gd-btn gray small eg-btn" data-eg="free" title="The lowest group ID the level does not use yet, from OFFSET up"><span class="gold">NEXT FREE</span></button>
      <label class="eg-off"><span class="gold">OFFSET</span><input class="eg-num small" type="number" min="0" max="9999" data-egnum="offset" value="${eg.offset || ''}" placeholder="NUM" aria-label="Offset for NEXT FREE"></label>
      ${egStepper('id', eg.id, '-green', 'Group ID')}
      <button type="button" class="gd-btn gray eg-btn" data-eg="add" title="Give the selected objects this group ID (${MAX_GROUPS} at most)"><span class="gold">ADD</span></button>
      ${one ? '<button type="button" class="gd-btn gray eg-btn" data-eg="parent" title="Make this object the parent of this group (pink)"><span class="gold">P</span></button>' : ''}
    </div>
    <div class="eg-groups" aria-label="Group IDs">${chips}</div>
    ${play ? `<div class="eg-ordch">${small('ord', 'ORD')}${small('gch', 'CH')}</div>` : ''}
    <div class="eg-zhead">${zStep(-1)}<span class="gold">Z LAYER</span>${zStep(1)}<span class="eg-tile">${tile === null ? '' : '(' + tile + ')'}</span></div>
    <div class="eg-zrow">${[...Z_LAYERS, ''].map(k => `<button type="button" class="gd-btn gray small eg-z${k ? '' : ' wide'}" data-egz="${k}" aria-pressed="${z === k}">${k || 'DEFAULT'}</button>`).join('')}</div>`;
}
function egExtraHTML(list) {
  const one = list.length === 1;
  return `<div class="eg-title"><span class="gold">EXTRA</span></div>
    <div class="eg-flags">${EXTRA_FLAGS.map(([k, label, works]) => {
      if (!works) return `<label class="gd-toggle eg-flag off" title="Not used in Ship Run"><input type="checkbox" class="gd-check" disabled> ${label}</label>`;
      if (k === 'parent') return `<label class="gd-toggle eg-flag${one ? '' : ' off'}" title="${one ? FLAG_HELP.parent : 'Select just one object to make it a group parent'}">
        <input type="checkbox" class="gd-check" data-egflag="parent"${one && parentOf(list[0]) ? ' checked' : ''}${one ? '' : ' disabled'}> ${label}</label>`;
      const n = list.filter(d => !!optOf(d, k)).length;
      return `<label class="gd-toggle eg-flag" title="${FLAG_HELP[k]}"><input type="checkbox" class="gd-check" data-egflag="${k}"${n === list.length ? ' checked' : ''}${n && n < list.length ? ' data-some' : ''}> ${label}</label>`;
    }).join('')}</div>`;
}
function egExtra2HTML(list) {
  const sh = f => egShared(list, f);
  const row = (k, title, plus) => `<div class="eg-field"><div class="eg-title"><span class="gold">${title}</span>${plus ? egPlus(k, 'The lowest enter channel not used yet') : ''}</div>${egStepper(k, sh(EG_NUM[k].get), '', title)}</div>`;
  return `<div class="eg-title"><span class="gold">EXTRA 2</span></div>
    <div class="eg-top">${row('enterCh', 'ENTER CHANNEL', true)}${row('material', 'MATERIAL')}${list.every(forGameplay) ? row('controlId', 'CONTROL ID') : ''}</div>
    <p class="eg-note">Special IDs for triggers. They are saved with the level, but nothing in Ship Run uses them yet.</p>`;
}
function egHTML(list) {
  const body = eg.tab === 'extra' ? egExtraHTML(list) : eg.tab === 'extra2' ? egExtra2HTML(list) : egMainHTML(list);
  const side = (k, label, attrs) => `<button type="button" class="gd-btn gray eg-side-btn" data-eg="${k}" ${attrs}><span class="gold">${label}</span></button>`;
  return `<div class="eg-wrap">
    <div class="gd-panel eg-panel" role="dialog" aria-modal="true" aria-label="Edit group">
      <button type="button" class="cp-info eg-info" data-eg="info" aria-label="What this does">i</button>
      ${body}
      <button type="button" class="gd-btn big eg-ok" data-eg="ok">OK</button>
    </div>
    <div class="eg-side">
      ${side('copy', 'COPY', 'title="Copy these settings from the selected object"')}
      ${side('paste', 'PASTE', `title="Paste the copied settings onto the selection"${eg.clip ? '' : ' disabled'}`)}
      ${side('extra', 'EXTRA', `aria-pressed="${eg.tab === 'extra'}"`)}
      ${side('extra2', 'EXTRA2', `aria-pressed="${eg.tab === 'extra2'}"`)}
      ${side('anim', 'ANIM', 'disabled title="Ship Run has no animated objects"')}
    </div>
  </div>`;
}
function openEditGroup() {
  if (!ed.sel.size) return toast('Select something first: click an object in Edit mode.');
  eg.tab = 'main';
  $('egPop').hidden = false;
  egRender();
}
function egRender() {
  const pop = $('egPop'), list = selectedList();
  if (pop.hidden) return;
  if (!list.length) { closeEditGroup(); return; }
  pop.innerHTML = egHTML(list);
  pop.querySelectorAll('[data-some]').forEach(c => { c.indeterminate = true; });
  fitText(pop);
  placeToast();
}
function closeEditGroup() {
  const pop = $('egPop');
  if (pop.hidden) return;
  pop.hidden = true; pop.innerHTML = '';
  edPruneSel(); edSelChanged();         // objects moved off the layer you are on drop out of the selection
}
$('egPop').addEventListener('click', e => {
  if (e.target.id === 'egPop') { closeEditGroup(); return; }
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.egstep === 'id') eg.id = Math.max(0, Math.min(9999, eg.id + Number(d.dir)));
  else if (d.egstep) egSetNum(d.egstep, Number(d.dir), true);
  else if (d.egplus) egSetNum(d.egplus, d.egplus === 'enterCh' ? freeEnterChannel() : freeEditorLayer(d.egplus === 'L2' ? 1 : 0));
  else if (d.eggroup) egRemoveGroup(Number(d.eggroup));
  else if (d.egzstep) egStepZ(Number(d.egzstep));
  else if (d.egz != null) egSetZ(d.egz);
  else if (d.eg === 'free') eg.id = nextFreeGroup(eg.offset);
  else if (d.eg === 'add') egAddGroup(false);
  else if (d.eg === 'parent') egAddGroup(true);
  else if (d.eg === 'copy') egCopy();
  else if (d.eg === 'paste') egPaste();
  else if (d.eg === 'extra' || d.eg === 'extra2') eg.tab = eg.tab === d.eg ? 'main' : d.eg;
  else if (d.eg === 'info') { showInfo(EG_INFO[eg.tab]); return; }
  else if (d.eg === 'ok') { if (eg.tab === 'main') { closeEditGroup(); return; } eg.tab = 'main'; }
  else return;
  egRender();
});
// The group ID and OFFSET boxes only belong to this window; the other boxes change the objects
$('egPop').addEventListener('input', e => {
  const k = e.target.dataset.egnum;
  if (k === 'id') eg.id = intIn(e.target.value, 0, 9999, 0);
  else if (k === 'offset') eg.offset = intIn(e.target.value, 0, 9999, 0);
});
$('egPop').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.egflag) { egSetFlag(t.dataset.egflag, t.checked); egRender(); return; }
  const k = t.dataset.egnum, f = EG_NUM[k];
  if (!f) return;
  const v = Math.round(Number(t.value));
  if (t.value.trim() !== '' && Number.isFinite(v)) egSetNum(k, v);
  // show what the objects have now (the box stays, so a click on the next button still lands)
  const list = selectedList().filter(d => !f.only || f.only(d)), cur = list.length ? egShared(list, f.get) : null;
  t.value = cur === null ? '' : String(cur);
  t.placeholder = cur === null ? 'MIXED' : '';
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
      <dt>EDIT GROUP</dt><dd>Editor layers, group IDs (for alpha triggers), Z layer (B = behind the ship, T = in front) and Z order, plus EXTRA options like Hide and NoTouch</dd>
      <dt>EDIT OBJECT</dt><dd>The color channel of the selection (BASE / DETAIL switches color), and HSV to shift the color of just those objects. A trigger opens its own window.</dd>
      <dt>LAYERS</dt><dd>The pink arrows switch editor layer: on a layer you can only select and delete its objects, and new objects go on it. Click the number to lock the layer. The blue arrow shows ALL layers, and GO TO LAYER jumps to the selected object's layer.</dd>
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
  else if (act === 'egroup') openEditGroup();
  else if (act === 'eobject') openEditObject();
  else if (act === 'golayer') edGoToLayer();
}
$('edActions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { edAction(b.dataset.act); return; }
  const l = e.target.closest('[data-layer]');
  if (l) edLayerButton(l.dataset.layer);
});
// the editor layer row: blue arrow = ALL, pink arrows = layer down / up, the number = lock
function edLayerButton(a) {
  if (a === 'all') edSetLayer(-1);
  else if (a === 'lock') edToggleLock();
  else edLayerStep(Number(a));
}
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
  if (name === 'menu') { renderMenuNote(); $('btnEditor').hidden = !settings.editorMode; requestAnimationFrame(renderKitTile); }
  if (name === 'icons') requestAnimationFrame(openKit);
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
    toast('The Pusab font did not load. Put PUSAB___.ttf in the same folder as index.html.');
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
  const L = levels[Number(b.dataset.play)];
  afterWarning(() => { track('practice-start'); startPlay('practice', { level: L, returnTo: 'practice' }); });
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
  placeToast();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400);
}
// While EDIT GROUP or EDIT OBJECT is open, a message goes to the top of the screen, off the window, or
// to the bottom when that hides fewer of its buttons (on a phone the window fills the screen)
function placeToast() {
  const t = $('toast'), pop = [$('egPop'), $('eoPop')].find(p => !p.hidden);
  t.classList.toggle('over', !!pop); t.classList.remove('under');
  if (!pop || t.hidden) return;
  const covered = () => {
    const r = t.getBoundingClientRect();
    return [...pop.querySelectorAll('button, input')].filter(b => {
      const q = b.getBoundingClientRect();
      return q.width && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top;
    }).length;
  };
  const atTop = covered();
  if (!atTop) return;
  t.classList.add('under');
  if (covered() >= atTop) t.classList.remove('under');
}

// --- the icon kit: pick your cube, ship and colors ---
// Looks and works like GDBrowser's Online Icon Kit by GD Colon (gdbrowser.com).
// Icon 0 is Ship Run's own picture. The list shows every icon in gray and white,
// like Geometry Dash's garage; the big one at the top is in your colors.
const kitUI = { tab: 'ship', slot: 'col1', colors: false, built: '', seen: new Set(), observer: null };
const KIT_GRID_LOOK = { col1: 17, col2: 12, glow: false, glowCol: 0, colW: 12 };
const KIT_SLOT_NAMES = { col1: 'Col 1', col2: 'Col 2', glowCol: 'Glow', colW: 'White' };
// How many icons there are: all of Geometry Dash's once the icons folder has them,
// otherwise the ones on GJ_GameSheetIcons
function kitCount(form) {
  if (ICONS.have[form] && ICONS.have[form].length) return ICON_FORMS[form].max;
  const fr = ICONS.data ? Object.values(ICONS.data.frames)[0] || {} : {};
  const re = new RegExp('^' + ICON_FORMS[form].gd + '_(\\d+)_001$');
  let n = 0;
  for (const k in fr) { const m = re.exec(k); if (m) n = Math.max(n, Number(m[1])); }
  return Math.min(n, ICON_FORMS[form].max);
}
const kitGlowOk = () => ['cube', 'ship'].some(f => ICONS.have[f] && ICONS.have[f].length);   // GJ_GameSheetIcons has no glow pictures
function sizeCanvasToBox(c) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.imageSmoothingQuality = 'high';
  return [w, h];
}
// The player (ship with its cube), with the hitbox middle at (cx, cy) and 1 square = b pixels
function drawKitPlayer(ctx, cx, cy, b, look = kit) {
  const u = b / gridSize;
  ctx.save(); ctx.scale(u, u);
  drawPlayer(ctx, cx / u, screenHeight - cy / u - gridSize / 2, 0, 1, 1, false, { look });
  ctx.restore();
}
// A cube or a ship on its own, middle at (cx, cy), 1 square = b pixels. False if it isn't loaded yet.
function drawKitIcon(ctx, form, cx, cy, b, look = kit) {
  ctx.save(); ctx.translate(cx, cy);
  const art = kitArt(form, look);
  let ok = true;
  if (art) drawCentered(ctx, art, b / art.ppb);
  else if (look[form]) ok = false;
  else if (form === 'cube' && IMG.cube) drawCentered(ctx, IMG.cube, b * 0.77 / 554);   // cube.png: the cube is 554 pixels wide
  else if (form === 'ship' && IMG.ship) drawCentered(ctx, IMG.ship, b * 1.875 / IMG.ship.width);
  ctx.restore();
  return ok;
}
function drawKitTileArt(btn) {
  const c = btn.querySelector('canvas'), form = kitUI.tab, id = Number(btn.dataset.icon);
  const [W, H] = sizeCanvasToBox(c);
  drawKitIcon(c.getContext('2d'), form, W / 2, H / 2, Math.min(H * 0.62, W * (form === 'ship' ? 0.5 : 0.7)), { ...KIT_GRID_LOOK, [form]: id });
  if (id && iconMissing(form, id)) { btn.hidden = true; kitUI.seen.delete(btn); }
}
function renderKitGrid() {
  const grid = $('kitGrid'), form = kitUI.tab, n = kitCount(form), key = form + n + settings.quality + settings.art;
  if (kitUI.built !== key) {
    kitUI.built = key;
    if (kitUI.observer) kitUI.observer.disconnect();
    kitUI.seen.clear();
    const kind = form === 'cube' ? 'Cube' : 'Ship';
    let html = '';
    for (let id = 0; id <= n; id++) {
      html += `<button type="button" class="kit-icon" data-icon="${id}" title="${id ? kind + ' ' + id : 'Ship Run\'s own ' + form}" aria-label="${id ? kind + ' ' + id : 'Ship Run\'s own ' + form}"><canvas></canvas>${id ? '' : '<span class="kit-def o">DEFAULT</span>'}</button>`;
    }
    grid.innerHTML = html;
    grid.scrollTop = 0;
    // pictures are only loaded for the icons you scroll to
    kitUI.observer = new IntersectionObserver(list => {
      for (const en of list) {
        if (en.isIntersecting) { kitUI.seen.add(en.target); drawKitTileArt(en.target); }
        else kitUI.seen.delete(en.target);
      }
    }, { root: grid, rootMargin: '120px' });
    grid.querySelectorAll('.kit-icon').forEach(b => kitUI.observer.observe(b));
  } else for (const b of kitUI.seen) drawKitTileArt(b);
  grid.querySelectorAll('.kit-icon').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.icon) === kit[form]));
}
function renderKitColors() {
  const box = $('kitColors');
  if (!box.children.length) {
    const sw = i => `<button type="button" class="kit-color" data-col="${i}" style="background:${PLAYER_COLORS[i]}" title="Color ${i} (${PLAYER_COLORS[i]})" aria-label="Color ${i}"></button>`;
    let html = '';
    for (let blk = 0; blk < 4; blk++) html += `<div class="kit-block">${KIT_COLOR_ROWS.map(r => r.slice(blk * 4, blk * 4 + 4).map(sw).join('')).join('')}</div>`;
    box.innerHTML = html + `<div class="kit-bottom">${KIT_COLOR_BOTTOM.map(sw).join('')}</div>`;
  }
  const glowOk = kitGlowOk();
  if (!glowOk && kitUI.slot === 'glowCol') kitUI.slot = 'col1';
  document.querySelectorAll('[data-kit-slot]').forEach(b => {
    b.hidden = b.dataset.kitSlot === 'glowCol' && !glowOk;
    b.style.background = PLAYER_COLORS[kit[b.dataset.kitSlot]];
    b.setAttribute('aria-pressed', b.dataset.kitSlot === kitUI.slot);
  });
  document.querySelector('.kit-glow').hidden = !glowOk;
  $('kitGlow').checked = kit.glow;
  box.querySelectorAll('.kit-color').forEach(b => b.setAttribute('aria-pressed', kit[kitUI.slot] === Number(b.dataset.col)));
}
function renderKitInfo() {
  const form = kitUI.tab, id = kit[form], hex = i => PLAYER_COLORS[i];
  const lines = [`ID: ${id ? (form === 'cube' ? 'Cube ' : 'Ship ') + id : 'Ship Run ' + form}`];
  if (id) {
    lines.push(`Col 1: ${kit.col1} (${hex(kit.col1)})`, `Col 2: ${kit.col2} (${hex(kit.col2)})`);
    if (kit.glow && kitGlowOk()) lines.push(`Glow: ${kit.glowCol} (${hex(kit.glowCol)})`);
    if (kit.colW !== 12) lines.push(`White: ${kit.colW} (${hex(kit.colW)})`);
  }
  $('kitInfo').innerHTML = lines.map(l => `<div>${esc(l)}</div>`).join('');
}
function renderKitPreview() {
  const c = $('kitPreview'), [W, H] = sizeCanvasToBox(c), ctx = c.getContext('2d'), b = H * 0.62;
  if (kitUI.tab === 'ship') drawKitPlayer(ctx, W / 2, H - b * 0.72, b);
  else drawKitIcon(ctx, 'cube', W / 2, H - b * 0.5 - 2, b);
}
function renderKitForms() {
  document.querySelectorAll('[data-kit-tab]').forEach(b => {
    const on = b.dataset.kitTab === kitUI.tab, c = b.querySelector('canvas');
    b.classList.toggle('cyan', on); b.classList.toggle('gray', !on); b.setAttribute('aria-selected', on);
    const [W, H] = sizeCanvasToBox(c);
    drawKitIcon(c.getContext('2d'), b.dataset.kitTab, W / 2, H / 2, W * (b.dataset.kitTab === 'ship' ? 0.62 : 0.72), { ...KIT_GRID_LOOK, cube: 1, ship: 1 });
  });
}
function renderKit() {
  if (screen !== 'icons') return;
  $('kitGrid').hidden = kitUI.colors;
  $('kitColorPanel').hidden = !kitUI.colors;
  $('kitPaletteBtn').setAttribute('aria-pressed', kitUI.colors);
  $('kitPaletteBtn').setAttribute('aria-label', kitUI.colors ? 'Show icons' : 'Show colors');
  renderKitForms();
  if (kitUI.colors) renderKitColors(); else renderKitGrid();
  renderKitInfo();
  renderKitPreview();
}
// The ICONS button on the main menu shows your ship
function renderKitTile() {
  const c = $('kitTileIcon');
  if (!c || !c.getClientRects().length) return;
  const [W, H] = sizeCanvasToBox(c);
  drawKitPlayer(c.getContext('2d'), W / 2, H * 0.52, W / (kit.ship ? 1.5 : 2));
}
function kitChanged() { saveKit(); renderKit(); renderKitTile(); }
function openKit() {
  kitUI.built = '';
  Promise.all([iconProbe('cube'), iconProbe('ship')]).then(() => { kitUI.built = ''; renderKit(); });
  renderKit();
}
function kitRandom() {
  for (const form of ['cube', 'ship']) {
    const n = kitCount(form);
    let id = 1, tries = 0;
    do id = 1 + Math.floor(Math.random() * n); while (iconMissing(form, id) && ++tries < 20);
    kit[form] = id;
  }
  kit.col1 = Math.floor(Math.random() * PLAYER_COLORS.length);
  kit.col2 = Math.floor(Math.random() * PLAYER_COLORS.length);
  kit.glowCol = kit.col2;
  kitChanged();
}
// Saves the icon you're looking at (the ship with its cube, or the cube) as a PNG
function cropCanvas(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let l = c.width, t = c.height, r = -1, b = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (d[(y * c.width + x) * 4 + 3]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  if (r < 0) return c;
  const o = document.createElement('canvas'); o.width = r - l + 1; o.height = b - t + 1;
  o.getContext('2d').drawImage(c, -l, -t);
  return o;
}
function kitDownload() {
  const form = kitUI.tab, art = kitArt(form), b = (art && art.ppb) || 120;
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  c.width = b * 4; c.height = b * 4;
  if (form === 'cube') drawKitIcon(ctx, 'cube', c.width / 2, c.height / 2, b);
  else drawKitPlayer(ctx, c.width / 2, c.height / 2, b);
  cropCanvas(c).toBlob(blob => {
    if (!blob) { toast('Could not make the picture.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shiprun-${form}-${kit[form] || 'default'}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}
document.querySelectorAll('[data-kit-tab]').forEach(b => b.addEventListener('click', () => { kitUI.tab = b.dataset.kitTab; kitUI.colors = false; renderKit(); }));
document.querySelectorAll('[data-kit-slot]').forEach(b => b.addEventListener('click', () => { kitUI.slot = b.dataset.kitSlot; renderKit(); }));
$('kitPaletteBtn').addEventListener('click', () => { kitUI.colors = !kitUI.colors; renderKit(); });
$('kitGrid').addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (b) { kit[kitUI.tab] = Number(b.dataset.icon); kitChanged(); } });
function kitPickColor(slot, i) {
  kit[slot] = i;
  if (slot === 'glowCol') kit.glow = true;      // picking a glow color turns the glow on
  kitChanged();
}
$('kitColors').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) kitPickColor(kitUI.slot, Number(b.dataset.col)); });
$('kitColors').addEventListener('contextmenu', e => { const b = e.target.closest('[data-col]'); if (b) { e.preventDefault(); kitPickColor('col1', Number(b.dataset.col)); } });
$('kitGlow').addEventListener('change', e => { kit.glow = e.target.checked; kitChanged(); });
$('kitRandom').addEventListener('click', kitRandom);
$('kitReset').addEventListener('click', () => { Object.assign(kit, KIT_DEFAULTS); kitChanged(); });
$('kitDownload').addEventListener('click', kitDownload);
$('btnIcons').addEventListener('click', () => showScreen('icons'));


// --- the Settings menu ---
const GAME_SETTINGS = [
  ['editorMode', 'DEV MODE', 'Unlocks the level editor and the hack menu (Tab): noclip, speedhack, hitboxes and more. Until it is on, they are hidden and cannot be used.'],
  ['showProgress', 'PROGRESS BAR', 'The bar at the top while you play.'],
  ['showPercent', 'PERCENTAGE', 'The number next to the progress bar.'],
  ['showAttempts', 'ATTEMPT COUNTER', 'The "Attempt 3" text at the start of each try.'],
  ['showLevelName', 'LEVEL NAME', 'The level name in the top-left corner while you play.'],
  ['lowDetail', 'LOW DETAIL MODE', 'Hides the extra decoration a level marks as High Detail. Can help the game run smoothly on slow devices.'],
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
  iconsReset();
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
    if (!settings.editorMode) showHackMenu(false);
    toast(settings.editorMode ? 'Dev mode on. The EDITOR button is on the main menu, and Tab opens the hack menu.' : 'Dev mode off. The editor and the hack menu are hidden, and no hacks are on.');
    requestAnimationFrame(() => fitText());
  }
});

function showHowToPlay() {
  showModal('HOW TO PLAY', `<dl class="keys-list">
      <dt>SPACE / UP / CLICK</dt><dd>Hold to fly up. Let go to fall.</dd>
      <dt>ESC</dt><dd>Pause.</dd>
${settings.editorMode ? `      <dt>TAB</dt><dd>Open or close the hack menu (dev mode).</dd>
      <dt>I</dt><dd>Noclip on or off.</dd>
      <dt>H</dt><dd>Show hitboxes on or off.</dd>
` : ''}    </dl>
    <p>A run is ${LEVELS_PER_RUN} random levels back to back. Crash once and a new run starts with new levels.</p>`,
    [{ label: 'OK', primary: true, fn: hideModal }]);
}

// The photosensitivity warning: shown the first time someone starts playing, then
// remembered with the other settings. Closing it without accepting doesn't start the game.
function afterWarning(go) {
  if (settings.seenWarning) { go(); return; }
  showModal('WARNING', `<p><b>Photosensitivity warning.</b> Ship Run has flashing and changing colours, fast movement and
      repeating patterns. A very small number of people may have a seizure when they see these, even with no history of
      epilepsy. If you or anyone in your family has had seizures, talk to a doctor before playing.</p>
    <p>Stop playing straight away if you feel dizzy or sick, see blurred vision, or have eye or muscle twitches.
      Play in a well-lit room and take regular breaks.</p>
    <p class="small"><a href="terms.html" target="_blank" rel="noopener">Read the full warning in the Terms of Use</a></p>`,
    [{ label: 'BACK', fn: hideModal },
     { label: 'I UNDERSTAND', primary: true, fn: () => { settings.seenWarning = true; saveSettings(); hideModal(); go(); } }]);
}

// buttons
$('btnPlay').addEventListener('click', () => afterWarning(() => { if (startRun()) track('play-start'); }));
$('btnPractice').addEventListener('click', () => showScreen('practice'));
$('btnEditor').addEventListener('click', () => { track('editor-open'); showScreen('levels'); });
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
  if (e.key === 'Tab' && settings.editorMode && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!e.repeat) showHackMenu(); return; }
  if (isTyping(e) && e.target.closest('#hackMenu')) { if (e.key === 'Escape' || e.key === 'Enter') e.target.blur(); return; }
  if (e.key === 'Escape' && hackMenuOpen()) { showHackMenu(false); return; }
  if (!$('colorPop').hidden) { if (e.key === 'Escape') { if (!$('cpMenu').hidden) cpMenu(false); else closeColorPop(); } return; }
  if (!$('modal').hidden) { if (e.key === 'Escape') hideModal(); return; }
  if (!$('egPop').hidden) { if (e.key === 'Escape') closeEditGroup(); return; }
  if (!$('eoPop').hidden) { if (e.key === 'Escape') eoBack(); return; }
  if (screen === 'play') {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!e.repeat && !game.paused && !game.finished) { upInput = true; pressed = true; noteClick(); }
    } else if (e.code === 'Escape') {
      if (game.mode === 'test' || game.finished) leavePlay();
      else if (game.paused) resumeGame();
      else pauseGame();
    }
    else if (e.code === 'KeyI' && settings.editorMode) setHack('noclip', !hk('noclip'));
    else if (e.code === 'KeyH' && settings.editorMode) setHack('hitboxes', !hk('hitboxes'));
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
  e.preventDefault(); upInput = true; pressed = true; noteClick();
});
window.addEventListener('pointerup', () => { if (screen === 'play') upInput = false; });
window.addEventListener('pointercancel', () => { upInput = false; });
window.addEventListener('blur', () => { upInput = false; ed.spaceDown = false; });

window.addEventListener('resize', () => {
  if (screen === 'play') fitGameCanvas();
  else if (screen === 'editor') { edResize(); renderPalette(); }
  else if (screen === 'icons') renderKit();
  else if (screen === 'menu') renderKitTile();
  fitTitle();
  fitText();
});

// main loop: fixed 45 steps per second, drawn every animation frame
let lastFrame = performance.now();
function frame(now) {
  const elapsed = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  countFrame(now);
  if (screen === 'play') {
    const t = elapsed * hackSpeed();     // Speedhack: the game's clock runs faster or slower
    if (!game.finished && !game.paused) {
      if (game.dead) {
        game.deathTimer -= t;
        if (game.deathTimer <= 0) restart();
      } else {
        game.acc += t;
        while (game.acc >= dt) {
          step();
          game.acc -= dt;
          if (game.dead || game.finished) { game.acc = 0; break; }
        }
      }
    }
    if (screen === 'play') { drawGame(); updateStatus(now); }
  } else if (screen === 'editor' && ed.needsDraw) { ed.needsDraw = false; drawEditor(); }
  requestAnimationFrame(frame);
}

if (!document.title.startsWith(GAME_TITLE)) document.title = GAME_TITLE;   // keeps the longer title in index.html
renderMoveButtons();
renderPaletteTabs();
renderPalette();
showScreen('menu');
loadGdFont();
loadSprites();
requestAnimationFrame(frame);
