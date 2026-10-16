'use strict';
/* ==========================================================================
   SHIP RUN  -  gd-import.js
   Turns a Geometry Dash level into a Ship Run level.

   Reads:
     .gmd    GDShare's file: Geometry Dash's own level save (an XML plist)
     .gmd2   GDShare's zip: level.data (the same plist) + level.meta (+ song)
     .lvl    the plist, zlib-compressed
     text    a .gmd's contents, or just the level string ("H4sIA..." or "kS38,...;1,1,2,15,3,15;...")

   Inside the plist, k2 is the name, k5 the creator and k4 the level string:
   base64 (URL-safe) of gzip of "header;object;object;...". The header has
   the start gamemode (kA2), speed (kA4), mini (kA3), flipped gravity (kA11)
   and colors (kS38). Each object is "key,value,key,value": 1 = object ID,
   2 = x, 3 = y (30 units = 1 square, x and y are the middle of the object),
   4/5 = flipped, 6 = rotation (clockwise), 21/22 = colors, 57 = groups ...

   Ship Run only has the ship, so only the ship parts of a level come over.
   Cube, ball, UFO, wave, robot, spider and swing parts are cut out and the
   ship parts are joined together. Each ship part uses the 10 squares
   Geometry Dash gives the ship there (worked out from its ship portal).
   Decoration and objects Ship Run doesn't have are left out, and the
   import report says what was left out.

   The level that comes out is ordinary level code, the same as the editor
   makes, so it can be edited, tested and downloaded in levels.js as usual.
   ========================================================================== */

(function () {

  // ----- object IDs ---------------------------------------------------------

  const ranges = (...rs) => { const s = new Set(); for (const r of rs) { const [a, b] = Array.isArray(r) ? r : [r, r]; for (let i = a; i <= b; i++) s.add(i); } return s; };

  // Full squares that are solid in Geometry Dash (the block tabs, 1.0 to 2.1)
  const SOLID = ranges([1, 7], [69, 78], [80, 83], [90, 96], [116, 122], [160, 169], 175, 193, [207, 213], [247, 261],
    [263, 272], [274, 275], 467, [470, 471], [476, 482], [658, 659], [668, 670], 722, 734, [737, 738], [752, 759],
    [807, 825], [841, 848], 890, [903, 904], 911, [927, 935], [952, 959], [974, 977], [1082, 1090], [1100, 1106],
    [1140, 1153], [1162, 1186], 1193, [1195, 1197], 1204, [1209, 1210], 1222, [1226, 1227], [1229, 1240],
    [1294, 1297], 1304, 1315, 1322, [1737, 1739], 1742);
  // Half-height slabs (solid in the top half of their square). Ship Run has no
  // half block, so they become a thin solid line along the top of the square.
  const SLAB = ranges(40, [62, 66], 68, [170, 173], 192, 194, 215, 369, 370, 655, 656, [662, 664], 723, 735, 891,
    [1079, 1081], [1096, 1098], [1903, 1905]);
  const INVIS_BLOCK = 146, INVIS_SLAB = ranges(147, 204);
  // Block sets: each has a square, a top, an outer corner, an inner corner, an inner square,
  // a top pillar and a pillar. They come over like Ship Run's own grid blocks: the grid
  // picture plus the outline pieces that are solid where its white edges are, and the
  // inner square as a grid block with no hitbox.
  //   [square, top, outer corner, inner corner, inner, top pillar, pillar] (0 = the set has none)
  const BLOCK_SETS = [
    [1, 2, 3, 4, 5, 6, 7], [69, 70, 71, 72, 73, 74, 75], [76, 77, 78, 0, 80, 81, 82], [90, 91, 92, 93, 94, 95, 96],
    [116, 117, 118, 119, 120, 121, 122], [207, 208, 209, 210, 211, 212, 213], [247, 248, 249, 250, 251, 252, 253],
    [255, 256, 257, 258, 259, 260, 261], [263, 264, 265, 0, 266, 267, 268], [269, 270, 271, 272, 0, 274, 275],
  ];
  // Each part: [grid picture, outline piece] (piece 12 is the column: lines on both sides)
  const SET_PARTS = [null, ['square_02_001', 2], ['square_03_001', 3], ['square_04_001', 6], 'inner', ['square_06_001', 4], ['square_07_001', 12]];
  const BLOCK_PART = {};
  for (const set of BLOCK_SETS) set.forEach((id, i) => { if (id && SET_PARTS[i]) BLOCK_PART[id] = SET_PARTS[i]; });
  BLOCK_PART[83] = ['square_08_001', 1];        // the grid square with all four edges

  // Spikes: [Ship Run type, design]
  const SPIKES = {
    8: ['Spike'], 39: ['ShortSpike'], 103: ['SmallSpike'], 392: ['TinySpike'],
    216: ['Spike', 'colorSpike_01'], 217: ['ShortSpike', 'colorSpike_02'], 218: ['SmallSpike', 'colorSpike_03'], 458: ['TinySpike', 'colorSpike_04'],
    177: ['Spike', 'iceSpike_01'], 178: ['ShortSpike', 'iceSpike_02'], 179: ['SmallSpike', 'iceSpike_03'],
    144: ['FadeSpike'], 205: ['FadeShortSpike'], 145: ['FadeSmallSpike'], 459: ['FadeTinySpike'],
  };
  // Ground spikes and thorns: Ship Run's thorn pit, with a design where there is one
  const PITS = { 9: null, 61: 'pit_02', 135: 'pit_03', 1711: 'pit_b_01', 1712: 'pit_b_02', 1713: 'pit_b_03', 1714: 'pit_b_04',
    363: null, 364: null, 365: null, 421: null, 422: null, 768: null, 919: null,
    1715: null, 1716: null, 1717: null, 1718: null, 1719: null, 1725: null, 1726: null, 1727: null };
  // Saws: [size, design]. The designs carry their own hitbox size, so they stay at size 1.
  const SAWS = {
    88: [1], 89: [0.67], 98: [0.5],
    183: [1, 'blade_01'], 184: [1, 'blade_02'], 185: [1, 'blade_03'],
    186: [1, 'blade_b_01'], 187: [1, 'blade_b_02'], 188: [1, 'blade_b_03'],
    397: [1, 'darkblade_01'], 398: [1, 'darkblade_02'], 399: [1, 'darkblade_03'],
    740: [1, 'blade_01'], 741: [1, 'blade_02'], 742: [1, 'blade_03'],
    1705: [1, 'blade_01'], 1706: [1, 'blade_02'], 1707: [1, 'blade_03'],
    1708: [1, 'darkblade_01'], 1709: [1, 'darkblade_02'], 1710: [1, 'darkblade_03'],
    1734: [1, 'blackCogwheel_01'], 1735: [1, 'blackCogwheel_02'], 1736: [1, 'blackCogwheel_03'],
    1619: [1, 'spinBlade01'], 1620: [1, 'spinBlade02'],
  };
  const SAW_MIN = 0.5, SAW_MAX = 2;

  const GAMEMODE = { 12: 'cube', 13: 'ship', 47: 'ball', 111: 'ufo', 660: 'wave', 745: 'robot', 1331: 'spider', 1933: 'swing' };
  const START_MODE = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'];
  const SPEED_PORTAL = { 200: 'half', 201: 'normal', 202: 'double', 203: 'triple', 1334: 'quad' };
  const START_SPEED = ['normal', 'half', 'double', 'triple', 'quad'];      // kA4: 0 is 1x, 1 is 0.5x
  const GRAVITY_PORTAL = { 10: 1, 11: -1 };
  const SIZE_PORTAL = { 99: 'big', 101: 'mini' };
  const TELEPORT = 747, PAD = 35, ORB = 36, COINS = ranges(142, 1329), END_TRIGGER = 3600, START_POS = 31;
  const COLOR_TRIGGER = 899, ALPHA_TRIGGER = 1007;
  // Pre-2.0 color triggers, one per channel
  const OLD_COLOR_TRIGGER = { 29: 1000, 30: 1001, 104: 1002, 105: 1004, 221: 1, 717: 2, 718: 3, 743: 4 };

  // Things that matter to gameplay but Ship Run doesn't have, named in the report
  const UNSUPPORTED = {
    84: 'blue orbs', 141: 'pink orbs', 1022: 'green orbs', 1330: 'black orbs', 1333: 'red orbs', 1594: 'trigger orbs',
    1704: 'dash orbs', 1751: 'pink dash orbs', 3004: 'spider orbs',
    67: 'blue pads', 140: 'pink pads', 1332: 'red pads', 3005: 'spider pads',
    45: 'mirror portals', 46: 'mirror portals', 286: 'dual portals', 287: 'dual portals',
    901: 'move triggers', 1006: 'pulse triggers', 1049: 'toggle triggers', 1268: 'spawn triggers', 1346: 'rotate triggers',
    1347: 'follow triggers', 1520: 'shake triggers', 1585: 'animate triggers', 1595: 'touch triggers', 1611: 'count triggers',
    1616: 'stop triggers', 1811: 'instant count triggers', 1812: 'on death triggers', 1814: 'follow player Y triggers',
    1815: 'collision triggers', 1817: 'pickup triggers', 1912: 'random triggers', 1913: 'zoom triggers',
    1914: 'static camera triggers', 1916: 'camera offset triggers', 1917: 'reverse triggers', 1934: 'song triggers',
    2901: 'gameplay offset triggers', 2903: 'gradient triggers', 2999: 'middleground triggers', 3006: 'area move triggers',
    1816: 'collision blocks', 667: 'square hazards', 720: 'square hazards', 3610: 'damage squares', 143: 'breakable bricks',
    2902: 'new teleport portals', 2064: 'new teleport portals', 1755: 'D blocks', 1813: 'J blocks', 1829: 'S blocks', 1859: 'H blocks',
    195: 'small squares', 206: 'small squares', 220: 'small squares', 661: 'small squares', 176: 'small squares',
  };

  // Color channels Ship Run has: 1 to 999, BG, GROUND, LINE, OBJ (and the fixed BLACK, WHITE, P1, P2 for objects)
  const CH_NAME = { 1000: 'bg', 1001: 'ground', 1002: 'line', 1004: 'obj', 1005: 'p1', 1006: 'p2', 1010: 'black', 1011: 'white' };
  const CH_FIXED = new Set([1005, 1006, 1010, 1011]);
  const chOk = id => (id >= 1 && id <= 999) || !!CH_NAME[id];
  const chKey = id => CH_NAME[id] || id;
  const OLD_OBJ_COLOR = { 1: 1005, 2: 1006, 3: 1, 4: 2, 6: 3, 7: 4 };        // key 19, the 1.9 color of an object
  const Z_LAYER = { '-5': 'B5', '-3': 'B4', '-1': 'B3', '1': 'B2', '3': 'B1', '5': 'T1', '7': 'T2', '9': 'T3', '11': 'T4' };

  const GD_DEFAULT_BG = '#287DFF', GD_DEFAULT_GROUND = '#0066FF';
  const SQ = 30;                  // Geometry Dash units in one square
  const START_COL = 8.5;          // Geometry Dash x = 0 (where the player starts) lands under Ship Run's ship
  const JOIN_GAP = 6;             // empty squares between two ship parts that were joined
  const ROWS = 10;                // the ship's flying space, in squares

  // ----- reading the file -----------------------------------------------------

  const textOf = bytes => new TextDecoder('utf-8').decode(bytes);

  async function inflate(bytes, format) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack Geometry Dash levels. Try a newer Chrome, Edge, Firefox or Safari.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  // gzip or zlib, whichever it is
  function unpack(bytes) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return inflate(bytes, 'gzip');
    if ((bytes[0] & 0x0f) === 8 && ((bytes[0] << 8) | bytes[1]) % 31 === 0) return inflate(bytes, 'deflate');
    return null;
  }
  function base64Bytes(s) {
    s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    while (s.length % 4) s += '=';
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // A .gmd2 is a zip. Reads one file out of it by name.
  async function unzipFile(bytes, wanted) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('That .gmd2 file is not a zip file.');
    let p = dv.getUint32(end + 16, true);
    const count = dv.getUint16(end + 10, true);
    for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = textOf(bytes.subarray(p + 46, p + 46 + nameLen));
      if (name === wanted) {
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        if (method === 0) return data;
        if (method === 8) return inflate(data, 'deflate-raw');
        throw new Error('That .gmd2 file is packed in a way Ship Run cannot read.');
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('That .gmd2 file has no level.data inside.');
  }

  const unescapeXml = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);

  // The plist's top-level values: { k2: 'name', k4: 'H4sI...', ... } (first of each key)
  function plistValues(text) {
    const out = {};
    const re = /<k>([^<]*)<\/k>\s*(?:<([sir])>([\s\S]*?)<\/\2>|<([sir])\s*\/>)/g;
    let m;
    while ((m = re.exec(text))) if (!(m[1] in out)) out[m[1]] = m[3] != null ? unescapeXml(m[3]) : '';
    return out;
  }

  const isRawLevelString = s => /^(k[AS]\d+,|1,\d+,2,)/.test(s);
  // Does this text look like a Geometry Dash level (for PASTE LEVEL CODE)?
  function looksLikeGd(text) {
    const s = String(text || '').trim();
    return s.includes('<k>k4</k>') || s.startsWith('<?xml') || s.startsWith('<plist') || /^H4sI[A-Za-z0-9_\-+/=\s]+$/.test(s) || isRawLevelString(s);
  }

  // A k4 value (or a pasted level string) -> the plain level string
  async function levelString(data) {
    const s = String(data || '').trim();
    if (!s) throw new Error('This level is empty.');
    if (isRawLevelString(s)) return s;
    let bytes;
    try { bytes = base64Bytes(s); } catch (e) { throw new Error('The level data is damaged (it is not base64).'); }
    let out = unpack(bytes);
    if (!out) {                   // official levels leave out the start of the gzip header
      try { bytes = base64Bytes('H4sIAAAAAAAAA' + s); out = unpack(bytes); } catch (e) { out = null; }
    }
    if (!out) throw new Error('The level data is damaged (it is not compressed the way Geometry Dash does it).');
    try { return textOf(await out); }
    catch (e) { throw new Error('The level data is damaged and could not be unpacked.'); }
  }

  // Any of the supported texts -> { name, creator, str }
  async function readText(text, fallbackName) {
    text = String(text || '').replace(/\0/g, ' ').trim();
    if (text.includes('<k>')) {
      const v = plistValues(text);
      if (v.kCEK === '4' && !v.k4 && text.includes('<k>k1</k>') && !text.includes('<k>k2</k>')) throw new Error('That is a level list, not a level.');
      if (!v.k4) throw new Error('This file has no level in it (k4, the level data, is missing).');
      return { name: v.k2 || fallbackName || 'Geometry Dash level', creator: v.k5 || '', str: await levelString(v.k4) };
    }
    return { name: fallbackName || 'Geometry Dash level', creator: '', str: await levelString(text) };
  }

  async function readFile(file) {
    const name = file.name || '', base = name.replace(/\.[^.]*$/, '');
    const ext = (name.match(/\.([^.]+)$/) || [])[1];
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/^gmdl$/i.test(ext)) throw new Error('A .gmdl file is a level list: it only has level IDs, not the levels. Export the levels one by one as .gmd.');
    let text;
    if (/^gmd2$/i.test(ext)) text = textOf(await unzipFile(bytes, 'level.data'));
    else {
      const packed = unpack(bytes);              // .lvl (and any compressed file)
      text = textOf(packed ? await packed : bytes);
    }
    return convert(await readText(text, base));
  }
  async function fromText(text, name) { return convert(await readText(text, name)); }

  // ----- the level string -----------------------------------------------------

  function pairs(s, sep) {
    const a = s.split(sep), m = {};
    for (let i = 0; i + 1 < a.length; i += 2) m[a[i]] = a[i + 1];
    return m;
  }
  const num = (v, d = 0) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : d; };
  const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const rgbHex = (r, g, b) => ('#' + hex2(r) + hex2(g) + hex2(b)).toUpperCase();

  // One color from the header ("1_255_2_0_3_0_6_1000_7_1_...") -> [channel, Ship Run setting]
  function headerColor(entry, fixedId) {
    const p = pairs(entry, '_');
    const id = fixedId || num(p[6]);
    if (!chOk(id) || CH_FIXED.has(id)) return null;
    const spec = { rgb: rgbHex(num(p[1], 255), num(p[2], 255), num(p[3], 255)) };
    const op = num(p[7], 1);
    if (op < 1) spec.opacity = Math.max(0, Number(op.toFixed(3)));
    if (p[5] === '1') spec.blending = true;
    const copy = num(p[9]);
    if (copy && chOk(copy)) { spec.copy = chKey(copy); if (p[17] === '1') spec.copyOpacity = true; }
    const player = num(p[4], -1);
    if (player === 1 || player === 2) spec.player = player;
    return [chKey(id), Object.keys(spec).length === 1 ? spec.rgb : spec];
  }

  function levelColors(head) {
    const c = {};
    const add = r => { if (r) c[r[0]] = r[1]; };
    if (head.kS38) {
      for (const e of head.kS38.split('|')) if (e) add(headerColor(e));
    } else {
      const OLD = { kS29: 1000, kS30: 1001, kS31: 1002, kS32: 1004, kS33: 1, kS34: 2, kS35: 3, kS36: 4 };
      for (const k in OLD) if (head[k]) add(headerColor(head[k], OLD[k]));
      if (!head.kS29 && head.kS1 != null) c.bg = rgbHex(num(head.kS1), num(head.kS2), num(head.kS3));
      if (!head.kS30 && head.kS4 != null) c.ground = rgbHex(num(head.kS4), num(head.kS5), num(head.kS6));
    }
    if (!c.bg) c.bg = GD_DEFAULT_BG;
    if (!c.ground) c.ground = GD_DEFAULT_GROUND;
    return c;
  }

  // ----- converting -----------------------------------------------------------

  const round2 = v => Math.round(v * 100) / 100;
  const normDeg = a => { a = ((a % 360) + 360) % 360; return Math.round(a * 100) / 100; };

  function convert({ name, creator, str }) {
    const parts = str.split(';');
    const head = pairs(parts[0] || '', ',');
    const objs = [];
    for (let i = 1; i < parts.length; i++) {
      if (!parts[i]) continue;
      const p = pairs(parts[i], ',');
      const id = num(p[1], -1);
      if (id < 0) continue;
      objs.push({ id, p, x: num(p[2]), y: num(p[3]) });
    }
    if (!objs.length) throw new Error('This level has no objects in it.');

    const report = { kept: 0, left: {}, outside: 0, small: 0, slabs: 0, cut: [] };
    const leaveOut = (what, n = 1) => { report.left[what] = (report.left[what] || 0) + n; };

    // --- the parts of the level, split at gamemode portals ---
    const startMode = START_MODE[num(head.kA2)] || 'cube';
    const shipBottom = y => Math.max(0, Math.floor(y / SQ) - 5) * SQ;   // the ship's 10 squares around its portal
    const sections = [{ x0: -Infinity, mode: startMode, bottom: 0, startOfLevel: true }];
    for (const o of objs.filter(o => GAMEMODE[o.id]).sort((a, b) => a.x - b.x)) {
      const mode = GAMEMODE[o.id], cur = sections[sections.length - 1];
      if (mode === 'ship') sections.push({ x0: o.x, mode, bottom: shipBottom(o.y) });
      else if (mode !== cur.mode) sections.push({ x0: o.x, mode, bottom: 0 });
    }
    sections.forEach((s, i) => { s.x1 = i + 1 < sections.length ? sections[i + 1].x0 : Infinity; });
    // A level with no ship at all: fly the whole thing, starting from the ground
    const noShip = !sections.some(s => s.mode === 'ship');
    const kept = noShip ? [{ x0: -Infinity, x1: Infinity, mode: 'ship', bottom: 0, startOfLevel: true }] : sections.filter(s => s.mode === 'ship');
    const lastObjX = Math.max(...objs.map(o => o.x));
    // Where each ship part goes: the first one stays in place when the level starts as a ship,
    // the others follow each other with a small gap
    let cursor = 0;
    kept.forEach((s, i) => {
      if (s.startOfLevel) s.out0 = 0;
      else s.out0 = i === 0 ? 3 * SQ : cursor + JOIN_GAP * SQ;
      const firstX = s.startOfLevel ? 0 : s.x0;
      const lastX = Math.min(s.x1, lastObjX + SQ);
      s.shift = s.out0 - firstX;
      cursor = lastX + s.shift;
    });
    if (!noShip) {
      for (const s of sections) if (s.mode !== 'ship') {
        const len = Math.round((Math.min(s.x1, lastObjX) - Math.max(s.x0, 0)) / SQ);
        if (len > 0) report.cut.push({ mode: s.mode, len });
      }
    }
    const sectionAt = x => { for (const s of kept) if (x >= s.x0 && x < s.x1) return s; return null; };
    // Something in a part that was cut out: put it where the next ship part starts
    const joinAt = x => { for (const s of kept) if (x < s.x0) return s; return kept[kept.length - 1]; };

    const X = (x, s) => round2((x + s.shift) / SQ + START_COL);
    const Y = (y, s) => round2((y - s.bottom) / SQ + 0.5);
    const inside = (Yv, reach = 0) => Yv > -reach && Yv - 1 < ROWS + reach;

    // --- speed, gravity and size: carried across the parts that were cut out ---
    const stateEvents = objs.filter(o => SPEED_PORTAL[o.id] || GRAVITY_PORTAL[o.id] || SIZE_PORTAL[o.id]).sort((a, b) => a.x - b.x);
    const gdStart = { speed: START_SPEED[num(head.kA4)] || 'normal', gravity: head.kA11 === '1' ? -1 : 1, size: head.kA3 === '1' ? 'mini' : 'big' };
    const stateAt = x => {
      const st = { ...gdStart };
      for (const o of stateEvents) {
        if (o.x >= x) break;
        if (SPEED_PORTAL[o.id]) st.speed = SPEED_PORTAL[o.id];
        else if (GRAVITY_PORTAL[o.id]) st.gravity = GRAVITY_PORTAL[o.id];
        else st.size = SIZE_PORTAL[o.id];
      }
      return st;
    };
    const out = [];
    // A column of portals from floor to ceiling, so the ship can't miss it
    const portalColumn = (Xv, st, was) => {
      for (const Yv of [1.5, 3.5, 5.5, 7.5, 9.5]) {
        if (st.speed !== was.speed) out.push(['SpeedPortal', Xv, Yv, st.speed]);
        if (st.gravity !== was.gravity) out.push(['GravityPortal', Xv + (st.speed !== was.speed ? 2 : 0), Yv, st.gravity]);
        if (st.size !== was.size) out.push(['SizePortal', Xv + (st.speed !== was.speed ? 2 : 0) + (st.gravity !== was.gravity ? 2 : 0), Yv, st.size]);
      }
    };
    let shipState = { speed: 'normal', gravity: 1, size: 'big' };      // a Ship Run level always starts like this
    kept.forEach(s => {
      const st = stateAt(s.startOfLevel ? -Infinity : s.x0);
      if (st.speed !== shipState.speed || st.gravity !== shipState.gravity || st.size !== shipState.size) portalColumn(round2(s.out0 / SQ + START_COL), st, shipState);
      shipState = stateAt(s.x1);
    });

    // --- the objects ---
    const coinsSeen = [];
    let endCol = null;
    for (const o of objs) {
      const { id, p } = o;
      if (GAMEMODE[id] || id === START_POS) continue;
      const trig = id === COLOR_TRIGGER || id === ALPHA_TRIGGER || OLD_COLOR_TRIGGER[id];
      let s = sectionAt(o.x);
      if (!s) {
        if (trig) s = joinAt(o.x);           // colors still change, at the join
        else { leaveOut('cut'); continue; }
      }
      const inCut = !sectionAt(o.x);
      // Geometry Dash nudges some objects a couple of units off the grid; those snap back onto it
      const snap = v => Math.abs(v - Math.round(v)) < 0.1 ? Math.round(v) : v;
      const Xv = inCut ? round2(s.out0 / SQ + START_COL - 1) : snap(X(o.x, s)), Yv = snap(Y(o.y, s));
      const rot = num(p[6]), flipY = p[5] === '1', flipX = p[4] === '1';
      const sc = num(p[32], 1), sx = Math.abs(num(p[128], sc)), sy = Math.abs(num(p[129], sc));
      const angle = normDeg(-(rot + (flipY ? 180 : 0)));               // Ship Run turns the other way
      const opts = {};
      const main = num(p[21]) || OLD_OBJ_COLOR[num(p[19])] || 0;
      if (main && chOk(main)) opts.color = chKey(main);
      const groups = String(p[57] || '').split('.').map(Number).filter(n => n >= 1 && n <= 9999).slice(0, 10);
      if (groups.length) opts.groups = groups;
      if (Z_LAYER[p[24]]) opts.zLayer = Z_LAYER[p[24]];
      const z = Math.round(num(p[25]));
      if (z) opts.zOrder = Math.max(-999, Math.min(999, z));
      if (p[121] === '1') opts.noTouch = true;
      if (p[103] === '1') opts.highDetail = true;
      const withOpts = d => { if (Object.keys(opts).length) d.push(opts); return d; };
      const add = d => { out.push(d); report.kept++; };

      if (trig) {
        const t = { };
        const Yt = Math.max(1, Math.min(ROWS, Math.round(Yv)));
        if (p[11] === '1') t.touch = true;
        if (p[62] === '1') t.spawn = true;
        if (id === ALPHA_TRIGGER) {
          const g = Math.round(num(p[51]));
          if (!g) { leaveOut('alpha triggers with no group'); continue; }
          Object.assign(t, { group: g, opacity: Math.max(0, Math.min(1, num(p[35], 1))), fade: Math.max(0, num(p[10], 0.5)) });
          add(['AlphaTrigger', Xv, Yt, t]);
          continue;
        }
        const ch = OLD_COLOR_TRIGGER[id] || num(p[23], 1);
        if (!chOk(ch) || CH_FIXED.has(ch)) { leaveOut('color triggers for channels Ship Run does not have'); continue; }
        t.channel = chKey(ch);
        t.rgb = rgbHex(num(p[7], 255), num(p[8], 255), num(p[9], 255));
        t.fade = Math.max(0, num(p[10], 0.5));
        const op = num(p[35], 1);
        if (op < 1) t.opacity = Math.max(0, Number(op.toFixed(3)));
        if (p[17] === '1') t.blending = true;
        if (p[15] === '1') t.player = 1; else if (p[16] === '1') t.player = 2;
        const copy = num(p[50]);
        if (copy && chOk(copy)) { t.copy = chKey(copy); if (p[60] === '1') t.copyOpacity = true; }
        add(['ColorTrigger', Xv, Yt, t]);
        continue;
      }
      if (id === END_TRIGGER) { endCol = Math.round(Xv); continue; }

      const part = BLOCK_PART[id];
      if (Array.isArray(part)) {
        // a block set's edge piece: the grid picture, and the outline piece for its hitbox
        const gx = Math.round(Xv), gy = Math.round(Yv);
        if (!inside(gy)) { report.outside++; continue; }
        const turn = normDeg(Math.round(angle / 90) * 90), flip = flipX !== flipY;
        const deco = ['Deco', gx, gy, turn, part[0]], line = ['OutlineBlock', gx, gy, turn, part[1]];
        if (flip) { deco.push(1); line.push(1); }
        add(withOpts(deco)); add(withOpts(line));
        continue;
      }
      if (SOLID.has(id) || id === INVIS_BLOCK) {
        const t = part === 'inner' ? 'GridBlock' : id === INVIS_BLOCK ? 'InvisibleBlock' : 'Block';
        // A block covers the grid squares its edges are on, so a stretched block becomes
        // several blocks lined up with the grid. One much smaller than a square is left out.
        let w = sx, h = sy;
        if (Math.round(Math.abs(rot) / 90) % 2) [w, h] = [h, w];
        if (w < 0.75 || h < 0.75) { report.small++; continue; }
        const cells = (c, size) => { const a = Math.round(c - 0.5 - size / 2), b = Math.round(c - 0.5 + size / 2); const out = []; for (let k = a + 1; k <= Math.max(b, a + 1); k++) out.push(k); return out; };
        let any = false;
        for (const bx of cells(Xv, w)) for (const by of cells(Yv, h)) {
          if (!inside(by)) continue;
          add(withOpts([t, bx, by])); any = true;
        }
        if (!any) report.outside++;
        continue;
      }
      if (!inside(Yv, SAWS[id] ? 2 : 0)) { report.outside++; continue; }

      if (SLAB.has(id) || INVIS_SLAB.has(id)) {
        // the top line of the square, turned like the slab (in 90 degree steps)
        const turn = normDeg(Math.round(angle / 90) * 90);
        const d = ['OutlineBlock', Xv, Yv, turn, INVIS_SLAB.has(id) ? 10 : 2];
        add(withOpts(d)); report.slabs++;
      } else if (SPIKES[id]) {
        let [t, design] = SPIKES[id];
        const fade = t.startsWith('Fade');
        // a shrunk spike: the Ship Run spike nearest its height
        const k = Math.min(sx, sy);
        if (k < 0.85 && (t === 'Spike' || t === 'FadeSpike')) { t = (fade ? 'Fade' : '') + (k < 0.55 ? 'TinySpike' : 'SmallSpike'); design = undefined; }
        let sx0 = Xv, sy0 = Yv;
        if (t.endsWith('TinySpike')) {
          // Ship Run's tiny spike sits in the left half of its square; Geometry Dash's is in the middle
          const a = angle * Math.PI / 180;
          sx0 = round2(Xv + 0.25 * Math.cos(a)); sy0 = round2(Yv + 0.25 * Math.sin(a));
        }
        const d = [t, sx0, sy0, angle];
        if (design) d.push(design);
        add(withOpts(d));
      } else if (id in PITS) {
        // Geometry Dash keeps a thorn pit's position half a square below its grid square
        const a = angle * Math.PI / 180;
        const d = ['ThornPit', snap(round2(Xv - 0.5 * Math.sin(a))), snap(round2(Yv + 0.5 * Math.cos(a))), angle];
        if (PITS[id]) d.push(PITS[id]);
        add(withOpts(d));
      } else if (SAWS[id]) {
        const [size, design] = SAWS[id];
        const d = ['Saw', Xv, Yv, round2(Math.max(SAW_MIN, Math.min(SAW_MAX, size * Math.max(sx, sy))))];
        if (design) d.push(design);
        if (p[22] && chOk(num(p[22]))) opts.detail = chKey(num(p[22]));
        add(withOpts(d));
      } else if (SPEED_PORTAL[id]) {
        add(['SpeedPortal', Xv, Yv, SPEED_PORTAL[id]]);
      } else if (GRAVITY_PORTAL[id]) {
        add(['GravityPortal', Xv, Yv, GRAVITY_PORTAL[id]]);
      } else if (SIZE_PORTAL[id]) {
        add(['SizePortal', Xv, Yv, SIZE_PORTAL[id]]);
      } else if (id === TELEPORT) {
        add(['TelePortal', Xv, Yv, round2(Yv + num(p[54], 100) / SQ)]);
      } else if (id === PAD) {
        if (flipY || flipX || rot) { leaveOut('yellow pads on walls or ceilings'); continue; }
        add(['Pad', Xv, Math.abs(Yv - Math.round(Yv)) < 0.4 ? Math.round(Yv) : Yv]);   // pads sit on the bottom of their square
      } else if (id === ORB) {
        add(['Orb', Xv, Yv]);
      } else if (COINS.has(id)) {
        if (coinsSeen.length >= 3) { leaveOut('coins past the third'); continue; }
        coinsSeen.push(1);
        add(['Coin', Xv, Yv]);
      } else {
        leaveOut(UNSUPPORTED[id] || 'other');
      }
    }

    // A level must end at normal speed, big and with normal gravity (it may be followed by another in a Random Mix)
    const endState = shipState;
    if (endState.speed !== 'normal' || endState.gravity !== 1 || endState.size !== 'big') {
      const right = Math.max(...out.map(d => d[1]));
      portalColumn(Math.ceil(right) + 3, { speed: 'normal', gravity: 1, size: 'big' }, endState);
    }

    // the same object twice in the same place is kept once
    const seen = new Set(), objects = [];
    for (const d of out) { const k = JSON.stringify(d); if (!seen.has(k)) { seen.add(k); objects.push(d); } }
    objects.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    if (!objects.some(d => d[0] !== 'ColorTrigger' && d[0] !== 'AlphaTrigger')) throw new Error('Nothing in this level could be brought into Ship Run.');

    const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'level';
    const level = {
      id: 'gd_' + slug + '_' + Math.random().toString(36).slice(2, 6),
      name: String(name).trim().slice(0, 60) || 'Geometry Dash level',
      randomizer: false,
      end: endCol,
      colors: levelColors(head),
      objects,
    };
    return { level, report: reportLines(report, { name: level.name, creator, startMode, noShip, objects: objects.length, total: objs.length }) };
  }

  const MODE_NAME = { cube: 'cube', ball: 'ball', ufo: 'UFO', wave: 'wave', robot: 'robot', spider: 'spider', swing: 'swing' };
  function reportLines(r, info) {
    const lines = [];
    lines.push(`"${info.name}"${info.creator ? ' by ' + info.creator : ''}: ${info.objects} of its ${info.total} objects came over.`);
    if (info.noShip) lines.push(`This level has no ship part (it starts as ${MODE_NAME[info.startMode] || info.startMode}), so the whole level was brought in as if it were flown with the ship. It may not be playable as it is.`);
    if (r.cut.length) {
      const what = r.cut.map(c => `${MODE_NAME[c.mode] || c.mode} (${c.len} squares)`).join(', ');
      lines.push(`Cut out, because Ship Run only has the ship: ${what}. The ship parts were joined together, with speed, gravity and size portals added where they change.`);
    }
    const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
    if (r.outside) lines.push(`Left out ${n(r.outside, 'object that was', 'objects that were')} above or below the ship's flying space.`);
    if (r.small) lines.push(`Left out ${n(r.small, 'shrunk block', 'shrunk blocks')} (Ship Run blocks are always one square).`);
    const left = Object.entries(r.left).filter(([k]) => k !== 'cut' && k !== 'other');
    if (left.length) lines.push('Not in Ship Run yet, so left out: ' + left.map(([k, c]) => `${k} (${c})`).join(', ') + '.');
    if (r.left.other) lines.push(`Left out ${n(r.left.other, 'decoration or other object', 'decorations and other objects')} Ship Run doesn't have.`);
    if (r.slabs) lines.push(`${n(r.slabs, 'half-height slab', 'half-height slabs')} became a thin solid line at the top of the square.`);
    lines.push('Test the level in the editor before publishing it.');
    return lines;
  }

  const api = { readFile, fromText, looksLikeGd, convert, levelString };
  if (typeof window !== 'undefined') window.GD_IMPORT = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
