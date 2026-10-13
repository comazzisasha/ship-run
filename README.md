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

The icons are cut out of Geometry Dash's own files:

- `GJ_GameSheetIcons.png` + `.plist`: the low-quality sheet that is already in the
  repo. `icons.js` says where each icon is on it. Remake `icons.js` with
  `python3 tools/make_icons_js.py` if you replace the sheet, or if you add
  `GJ_GameSheetIcons-hd` / `-uhd` versions.
- An `icons/` folder (optional, for every icon in sharp quality, with glow): copy
  the `player_XX` and `ship_XX` files from Geometry Dash's `Resources/icons` folder,
  for example `ship_05-uhd.png` + `ship_05-uhd.plist`. The game uses them
  automatically: `-uhd` for High graphics, `-hd` for Medium and the plain ones for
  Low. Any icon missing from the folder comes from `GJ_GameSheetIcons` instead.
