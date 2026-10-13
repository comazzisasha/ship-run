# Ship Run

A Geometry Dash–style ship game. Open `index.html` in a browser to play.

## Stats (GoatCounter)

Visitor numbers are collected with [GoatCounter](https://www.goatcounter.com),
a privacy-friendly analytics service: no cookies, and no personal data such as
names, IP addresses or level contents is stored.

See the stats at **https://thesashanator.goatcounter.com**.

Besides normal page views, the game sends these events:

| Event | Sent when |
| --- | --- |
| `play-start` | A random run is started with the PLAY button on the main menu (not when it restarts after a crash, or with "play again"). |
| `level-complete:<levelId>` | The ship gets past the end of a level in a random run or in Practice. `<levelId>` is the level's id from `levels.js`, e.g. `level-complete:crack`. |
| `practice-start` | A level is started from the Practice screen. |
| `editor-open` | The level editor is opened with the EDITOR button on the main menu (dev mode only). |
| `test-level` | A level is tested from inside the editor. |

Nothing else is tracked while the editor is in use. Nothing is sent when the
game runs on `localhost` or from a file (`file://`), so testing on your own
computer does not affect the numbers. If GoatCounter is blocked or offline the
game works exactly the same.

The analytics code is the `track()` helper near the top of section 8 of
`game.js`, plus the GoatCounter `<script>` tag at the end of `<head>` in
`index.html`.

## Icon kit

The ICONS button on the main menu opens an icon kit for picking your cube, ship
and colors. It is based on [GDBrowser's Online Icon Kit](https://gdbrowser.com/iconkit/)
by GD Colon. Your choice is saved in your browser.

The icons come from, in this order:

- An `icons/` folder (optional): Geometry Dash's own per-icon files from its
  `Resources/icons` folder, e.g. `ship_05-uhd.png` + `ship_05-uhd.plist`. These are
  used automatically if present.
- The SSOH texture pack's cubes and ships, in `icons-ssoh-uhd.png` (High graphics),
  `icons-ssoh-hd.png` (Medium) and `icons-ssoh.png` (Low). Only the pack's icons
  were cut out; nothing else from the pack is used.
- `GJ_GameSheetIcons.png`, Geometry Dash's low-quality icon sheet, for icons the
  pack doesn't have.

`icons.js` says where every icon is on these sheets. Remake it with
`python3 tools/make_icons_js.py` (see the top of that file for how to cut the
SSOH icons again from the pack's sheets).
