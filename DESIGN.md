# Dash design

How dash looks and moves, and how to add a panel. Each section names the files that hold its rules.

## The sheet

The page is a blueprint: pale ink on blueprint blue. One accent, red, means "needs you". Light blue means live, now
or yours.

### Day and night (src/app.css, src/app.html)

- The day theme is the default. The night theme is darker: a deeper navy, softer ink.
- The `theme / auto` button in the header cycles `auto`, `light`, `dark`. `auto` follows the system's
  `prefers-color-scheme`.
- The choice is kept in `localStorage` under `theme`. A script in `app.html` applies it before the first paint,
  so the page never flashes the other theme.
- The browser's `theme-color` is `#12306b` for light and `#0a1730` for dark (`src/routes/+layout.svelte`).

### Tokens (src/app.css)

| Token | Day | Night | Use |
| --- | --- | --- | --- |
| `--paper` | `#12306b` | `#0a1730` | The sheet |
| `--ink` | `#e9eefb` | `#d6deef` | Text and lines |
| `--mute` | `#a8b8e0` | `#8597c2` | Labels, secondary text |
| `--rule` | ink 35% into paper | same mix | Borders, rules |
| `--track` | ink 18% into paper | same mix | Faint lines and tracks |
| `--sheet` | ink 8% into paper | same mix | Tile and input fill |
| `--signal` | `#ff4d3d` | same | Needs attention |
| `--on-signal` | `#141414` | same | Text on `--signal` |
| `--live` | `#7fd0ff` | `#6cc3f2` | Live, now, yours; focus ring; a selected button |
| `--on-live` | `--paper` | `--paper` | Text on `--live` |
| `--cat-0`, `-1`, `-2` | `--live`, `#f2c879`, `#9fe3c3` | same | Calendar feeds and todo boards, by index mod 3 |
| `--hatch` | `--mute` stripes at -45° | same | Partial or running; the resize grip |

`src/lib/art.test.ts` checks the contrast of these pairs in both themes (see Checks).

### Fonts

| Token | Font | Used for |
| --- | --- | --- |
| `--font-text` | Host Grotesk Variable | Body text, 15 px, line height 1.45, tabular numbers |
| `--font-data` | JetBrains Mono Variable | Header strips, facts, keys, `.data` (0.85 em) |
| `--font-display` | Tektur Variable | The clock, the weather temperature, the timer, the events count |

The fonts come from the `@fontsource-variable` packages. `src/hooks.server.ts` preloads only the latin weight files.

### The grid (src/app.css, src/lib/layout.ts, src/lib/Board.svelte)

- The board has 24 fluid columns and 24 px rows (`COLS`, `ROW`). A layout can reach 100 rows deep (`ROWS`).
- The drawn grid: each column is one major line and six minor ones (`--mx` is 100% / 24, `--cx` is 100% / 144).
  Rows have a minor line every 12 px and a major line every 72 px (`--my`).
- Minor lines are ink at 7%, major lines ink at 15%.
- Rows and columns are two layers (`.board::before` and `::after`), so the boot can plot each one.
- `--label` is what small text stands on. It is `--paper`, so a label knocks the grid out behind it.
- The board ends on a major line: the deeper of the lowest tile (rounded up) and the screen (rounded down).
- The page is at most 1880 px wide.
- On the phone (700 px wide or less) the grid is 12 px squares with a major line every 60 px, and `--label` is
  transparent.

## The bare tiles

A bare tile has no sheet and no header strip; its frame shows only in edit mode. The car, the title block, the
clock, "now and next" (events) and the weather are bare. Together they fill the top 18 rows of the full board.

### The car (src/lib/art.ts, src/lib/panels/car/)

- A 1986.5 Toyota Supra (MA70), drawn as a technical drawing. The mesh is `src/lib/assets/supra.bin`, baked by
  `scripts/bake_mesh.py` from a CC BY 4.0 model (README, Credits).
- Raw WebGL2 in three passes: the mesh into a G-buffer, one texel per character cell, then the composite.
- Characters: the tone ramp `␠.,:;+*#%@`, then the strokes `_-¯/|\`. A cell is 4 px wide and twice as tall.
- The cycle: the car turns as ASCII ink (12 drawn steps a second, one turn in 90 s, pitched 0.26 rad). It settles
  into a view (4 s), wipes to line ink (2.5 s), holds (40 s) and wipes back (2.5 s).
- The views lock in this order: side elevation, front elevation, plan view, rear elevation.
- The start: the first frame comes 1.5 s after page start and plots in over 1.2 s. Then the headlamps rise
  (1.2 s). The page opens 12 s before the first lock.
- At a lock, dimension lines draw in with the line ink, from factory figures in mm: side shows wheelbase (2595),
  length (4620) and height (1310); plan shows length and width (1745); front and rear show width and height.
- Part names follow: a dot, a leader, a shelf, the label. A view shows all of its names or none, and only if they fit.
- While a red alert stands, the car blinks its lights in `--signal`: half a second on, half a second off.
- Without WebGL2 the tile stays empty. A lost WebGL context is not restored.
- On the phone the car is a small box beside the time, in line ink only, with no dimensions.

### The title block (src/lib/panels/title/)

Ruled cells, like the title block of a drawing: drawing `Supra MA70 / 1986.5`; view (the locked view's name, or
`yaw 019°` while the car turns); scale `1:n`; units `mm`; model (the model credit, its licence link, "adapted").

### The clock (src/lib/panels/clock/)

- `HH:MM` in Tektur, weight 700, at 22.3 cqi. A digit scrambles only when it changes. Seconds are in `--mute`.
- The date reads like `Tuesday, November 24 / week 48` (en-CA, ISO week).
- On the phone the digits are `clamp(4rem, 15vw, 7.5rem)`.
- The clock uses the browser's time zone.

## The tile (src/lib/Panel.svelte)

### Anatomy

- Each tile hangs from a top rule, with a 9 px registration cross at its top left.
- Tiles overlap by 1 px, so shared edges are one line.
- The header strip is in the data font at 0.75 rem, in ruled cells: the detail number, the title, then the facts.
- The detail number counts the shown, non-bare tiles from `01`, column by column (by x, then y).
- A fact is a label and a value. A number counts up from 0 when it first shows, then rolls to new values
  (`src/lib/Roll.svelte`). An unknown value shows `–`.
- The body is a size container named `tile` and scrolls.
- A render error in the body shows its message in `.err` and a `retry` button (a `svelte:boundary`).

### The ✱ mark

- `✱` marks the thing that needs you. It is always in `--signal` or on a `--signal` fill.
- In the header strip: a panel passes `attention` to show `✱` after its title. Screen readers read "needs
  attention". The todo panel does this while a card is overdue, the deadlines panel while one is due within a day.
- In the body: before an event that starts within 15 minutes (events), a homelab value in trouble, a stuck download
  (media), a service that is down (uptime), and at the head of the alert banner.
- The header mark and the events mark blink twice when they appear (0.5 s steps), then hold still (`.mark`).

### States (src/lib/Status.svelte)

| Shows | When |
| --- | --- |
| `…` | Loading |
| `n/c` | Not connected: the error starts with `not set up`, because env keys are missing. The tooltip names them. |
| The error text, in `.err` | Any other error: a red fill with `--on-signal` text |

The weather panel shows its own error line, `weather: <error>`, and has no `n/c` (it needs no keys).

### Other parts

- Empty states (`src/lib/Empty.svelte`): a small ASCII line drawing, hidden from screen readers, with the message
  as its caption.
- Status marks (`.mk`): filled is have, done or ok; hatched is partial or running; empty is pending; `.bad` is a
  `--signal` fill.
- Gauges (`src/lib/Gauge.svelte`) are characters: `[`, `#` full, `:` half, `.` empty, `]`. The fill is
  `--live`, or `--signal` when the panel sets `--gauge` for a bad value. A gauge eases from empty over 0.7 s.
- A tick box (`.check`): ticking erases the row right to left behind a `--live` caret (450 ms). A new todo writes
  in behind the same caret.
- Priorities: `.p1` is bold ink, `.p2` ink, the rest `--mute`.

## Red

- Red is `--signal` and nothing else. There is no amber or yellow anywhere.
- Red fills: `.err`, `.mk.bad`, a red alert banner. Text on a red fill is `--on-signal`, because red type on the
  blue sheet is too faint for small text.
- Red type: the `✱` mark, and a name or value in trouble: a service that is down, a deadline 2 days away or less,
  an overdue todo's date, a failed CI run, a homelab value or gauge over its limit, a stuck download.
- A critical guest card in the homelab carousel and an event within 15 minutes are red fills.
- In edit mode, a tile that would overlap another gets a red border.
- Nothing flashes more than 3 times a second: the mark blinks twice in one second, the car's lights once a second.

### The alert banner (src/lib/Alerts.svelte, src/lib/server/alerts.ts)

- Polled every 20 s. It sits under the header: `✱ N need(s) you`, then one link per alert.
- Red alerts: a service down (it links to the service), a VPN leak or bad VPN status, an antivirus status other
  than `CLEAN`, an unhealthy pool, a failed CI run.
- Yellow alerts: media guards stale (more than 20 minutes), a pool more than 85% full, the CPU at or over its
  Glances warning, overdue todos, a stuck download (it links to the `qBittorrent` link).
- A banner with a red alert is a red fill. A banner with only yellow alerts is a red outline with red text.
- Alerts reuse the last answers the panels fetched and the uptime history. They make no requests of their own.

## The board (src/lib/Board.svelte, src/lib/server/sources/presets.ts)

### Presets

- A preset is a named layout. There are nine at most. Their tabs sit in the header, each with its key number.
- Keys 1 to 9 pick a preset by place (not in edit mode, not while typing). Every load opens on the first preset.
- `glance` is created at first start: every panel whose meta does not say `glance: false`, at its home. It can
  move but not be deleted.
- Presets are polled every 5 minutes, so another screen picks up changes.

### Edit mode

- The `edit` button (desktop only) starts edit mode on a draft of the shown preset.
- The bar shows `editing / <preset>`, then:
  - `+ <title>` for each hidden panel; a panel that can come several times adds its first setting
    (`weather · Tokyo`). It goes to the first free spot, at its home size.
  - `+ new <title>` for each panel that can come several times (`many`).
  - `save` (over the shown preset), a `save as` field (a new name, 1 to 30 characters), `delete` (asks
    `delete, sure?`; not for `glance`) and `cancel`.
- Tabs drag sideways to a new place. The new order saves on drop.
- The header strip moves a tile (anywhere on a bare tile). The hatched 14 px grip at the bottom right corner resizes
  it. Both snap to whole cells.
- A drop onto another tile puts the tile back. Neighbours are not pushed aside.
- Each tile's header holds `set` (when the panel has settings) and `×` (hide). `set` opens the settings form: a
  choice is a row of buttons, a number a number field, a text a text field (at most 100 characters).
- An added panel also has `delete`, which asks `delete, sure?` and takes it out of every preset.

### Glide (src/lib/motion.ts, move())

Every layout change goes through `move()`: a preset switch, a tile hidden, added or put back.

1. Tiles that leave fly out, each in its own random direction (0.45 s).
2. From 0.3 s, tiles that stay glide to their new spots (GSAP Flip, 0.6 s, `power3.inOut`), and new tiles fly in
   (0.7 s).
3. The board's height eases to its new depth.

A switch during a glide finishes the glide first. The car hears a `glide` event and eases its scale.

### The phone (700 px wide or less)

- Tiles stack column by column, each as tall as its content.
- The bare tiles come first, as one band. The car is a small box beside the time.
- The preset tabs take their own row, without key numbers. There is no edit mode.

## Ctrl+K (src/lib/Palette.svelte, src/lib/commands.svelte.ts)

- Ctrl+K, or `/` when not typing, or the `ctrl+k` button in the header opens the palette. Escape closes it.
- The links from `links.json`: the name, the group as a hint, the icon. Enter opens the link in a new tab.
- Panels add entries with `commands()` while they are mounted, once something is typed: `timer: <project>`,
  `timer: stop`, `todo: <text>`. Hidden panels stay mounted, so their entries work in every preset.
- Scoring: a prefix match is 3, a substring 2, letters in order 1. Arrow keys move, Enter runs.
- After the matches come `todo: <text>` (it adds a card, see README, Vault format) and `log: <text>` (it adds a
  line to today's daily note).
- An error shows in a browser alert.

### The orb (src/lib/orb.ts)

- A `todo:` entry plays like an XP orb. A caret sweeps the typed text, the highlight squashes into a 16 px cube in
  `--live`, and the cube flies with a speed trail to the new row in the todo panel, which writes in.
- If the save fails, the cube turns `--signal` and drops, and the text goes back into the palette.
- A `log:` entry does not fly: the palette closes, and a ding plays once the line is saved.
- The ding is a bell at a random pitch. It plays only after a key press or click has unlocked audio.

## Boot (src/app.css, src/app.html, src/lib/motion.ts boot())

The boot is CSS from the first paint, on transforms, opacity and stepped clips, so it stays smooth while the app
loads.

1. The grid rows plot left to right (0.8 s), then the columns top down (0.8 s, from 0.2 s).
2. The title block types in (from 0.7 s, over 0.5 s, in 18 steps).
3. The tiles follow in a wave from the top left. A tile's delay is 450 ms + (x / 6 + 1 + y / 10) × 90 ms. Its frame
   shows, the top rule draws, the header strip types in (0.45 s, 16 steps), the body comes up and the cross pops.
4. Meanwhile GSAP ScrambleText decodes the page title (0.7 s, with the glyphs `+/<>[]_-=:#01`).

Bare tiles stand from the start. `app.html` sets `.boot` and drops it after 3 s. A key press or click drops it
sooner.

## Other motion

- Guest carousel (homelab, `src/lib/guests.ts`): 3 cards, a new page every 8 s, new cards wiping in left to right
  200 ms apart. A guest whose CPU or memory moved by 1 point or more since the last poll takes a visible slot at
  once and plots in top down. A critical guest is a red card pinned in front until it is fine: a status other than
  running or stopped, or CPU at 90% or more, or a container's memory at 95% or more, for 2 polls in a row. A VM's
  memory never counts, since it includes the page cache. Stopped guests are left out.
- `src/lib/Carousel.svelte` (media requests and latest): a row of cells that turns a page on the same timer and
  holds still while hovered.

## Reduced motion

With `prefers-reduced-motion: reduce`:

- There is no boot.
- `app.css` turns off every animation and transition, and `ms()` (`motion.ts`) gives 0 ms to Svelte
  transitions.
- Layout changes switch at once.
- The car holds still on the side elevation, and its lights stay on during a red alert.
- The orb does not fly; the ding still plays.
- The guest carousel changes its cards at once.

## Panels

A panel is a folder in `src/lib/panels/`. The board finds it; no list names it.

### Start one

`npm run panel -- <name>` writes `src/lib/panels/<name>/`, a small working panel with one example of each part
below. Then, on the board (`npm run dev`): `edit`, `+ <name>`, place and size it, `save`.

The script refuses a name that is not lowercase letters, digits and `-` starting with a letter, a folder that
exists, and a name `/api/` already serves.

### The files

- `meta.ts` says what the panel is.
- `<Name>.svelte` draws it. The name is the folder name in PascalCase: `my-thing/MyThing.svelte`.
- `data.server.ts` (optional) serves its data.

### meta.ts

| Field | Meaning |
| --- | --- |
| `title` | The name in the header strip and in edit mode |
| `home` | `{ x, y, w, h }` in cells, its spot on the full board. Without one it takes the first free 6 × 6 spot. |
| `bare: true` | No sheet and no header strip |
| `glance: false` | Left out of the `glance` preset |
| `many: true` | Edit mode can add more of it: `<name>-2`, `<name>-3`… |
| `settings` | Each setting's default. A string is a text field (1 to 100 characters; 0 to 100 when the default is empty), a number a number field, a list a choice whose first item is the default. The key is the label. |

Secrets never go in settings. They stay in the environment.

### The view

- The view gets `{ id, settings }` and renders `<Panel {id} facts={[['label', value]]} attention={…}>`.
- Data: `poll('/api/<source>', ms)` (`src/lib/poll.svelte.ts`) fetches a source, then again every `ms`. Views that
  ask for the same URL share one poll. A source that answers within 300 ms comes with the first paint.
- While there is no data, render `<Status p={data} />` for `…`, `n/c` and errors.
- An empty list renders `<Empty drawing={DRAWING} text="…" />`.
- Size: `cells(() => id)` (`Panel.svelte`) gives the tile's size in whole cells, 24 wide on the phone, so a view
  can show more as it grows. In CSS, `@container tile (…)` asks the tile's body. On the phone tiles grow with
  their content, so only width queries work there.
- Ctrl+K: `commands(() => [...])` offers the view's entries while it is mounted.
- A write: `post('<action>', body)` (`src/lib/poll.svelte.ts`), then `data.reload()`.

### The data

- A source is an async function, exported from `data.server.ts` as `sources = { name: fn }`. `/api/<name>`
  serves it: GET answers its JSON, or 502 with `{ error }`.
- A write is an `actions = { name: fn }` entry that takes the JSON body of a POST to `/api/<name>` (400 on error).
- `src/lib/server/http.ts` has the helpers: `json()` fetches with an 8 s timeout, `cached(key, ms, fn)` keeps an
  answer, `env('KEY', …)` reads keys and throws `not set up: KEY` when one is missing (that shows as `n/c`).
  `service()` makes a fetcher for an API whose URL and key come from env.
- Sources several panels use live in `src/lib/server/sources/`. A name is used once across all of them; a name used
  twice stops the server at startup.
- Settings reach the source, not the client: `poll(api('<source>', id), ms)` (`src/lib/panels/index.ts`) asks
  `/api/<source>?i=<id>` for an added panel. The server looks the panel up and calls `fn(settings)`. A source that
  reads settings caches by them: `cached(\`weather:${place}\`, …)`.

### Finish

Run `npm run check` and `npm test`.

## Checks

- `npm test`: Vitest, every `*.test.ts` in `src/`. Tests run with `DB_PATH=:memory:` and
  `LINKS_FILE=links.example.json` (`vite.config.ts`).
- `npm run check`: `svelte-check` with TypeScript.
- `src/lib/art.test.ts` also checks the car's geometry and mesh, and the contrast of the tokens in both themes:
  ink on paper at least 7:1, mute, live and `--signal` on paper at least 4.5:1, 4.5:1 and 3:1, and `--on-signal`
  on `--signal` at least 4.5:1.
- `scripts/car.mjs` checks the car in a real browser: its spot, gauges, label backgrounds, draw rate, the alert
  blink, dimensions and part names, frame times, off screen, reduced motion, no WebGL2 and the phone. Playwright
  is not a dependency, so point `PLAYWRIGHT_FROM` at a folder where it is installed. `PLAYWRIGHT_BROWSERS_PATH`
  is optional. Start `npm run preview` first:

  ```sh
  PLAYWRIGHT_FROM=/path/to/a/project/with/playwright node scripts/car.mjs http://localhost:4173 [folder for screenshots]
  ```

  It takes about 80 s. Its frame-time limits were set on one laptop GPU, so a slower GPU may fail them.

Run `src/lib/art.test.ts` and `scripts/car.mjs` after any change to the car.
