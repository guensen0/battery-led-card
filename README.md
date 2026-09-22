# battery-led-card

🇬🇧 English | 🇩🇪 [Deutsch](README.de.md)

**v4.6.0** — two cards from one file, editor in English/German (follows `hass.language`)

Two Lovelace cards, one file, one resource:

| Type | For |
|---|---|
| `custom:battery-led-card` | batteries — level in %, percentage display, "collect" button |
| `custom:led-gauge-card` | any numeric value — `min`/`max` per row, raw value with unit |

Both share bars, colors, thresholds, charge flow and the editor; below is where they differ.

Battery entities as a horizontal LED segment panel (inspired by `led.jpg`, but horizontal
and with more bars). One row per entity, click opens the more-info dialog. Fully configurable
through the visual editor.

<video src="https://raw.githubusercontent.com/guensen0/battery-led-card/main/led_shot.mp4" controls autoplay muted loop width="500"></video>

## Installation

**Manual**

1. Copy `battery-led-card.js` to `config/www/`.
2. Settings → Dashboards → ⋮ → Resources → **+ Add Resource**:
   URL `/local/battery-led-card.js?v=1`, type **JavaScript Module**.
   (Menu item only visible with *Advanced Mode* enabled in your user profile.)
3. Ctrl+F5. The card appears in the picker as **Battery LED Card** (with preview).

For dashboards in YAML mode, add it under `lovelace: resources:` in `configuration.yaml`
instead (`url` + `type: module`) and restart HA.

**HACS**: add the repository as a *Dashboard* source, `hacs.json` is included.

## Configuration

```yaml
type: custom:battery-led-card
title: Batteries
segments: 12
columns: 2
bar_height: 22
name_width: auto
state_width: auto
cap: true
cap_size: 5
show_icon: true
show_name: true
show_state: true
show_flow: true
animate_flow: true
flow_full_scale: 3000
sort: true
color_mode: segment
warn_below: 15
show_last_changed: true
deadband: 5
thresholds: { critical: 10, low: 30, medium: 50, high: 80 }
colors:
  critical: tomato
  low: "#ffa500"
  full: 32cd32
entities:
  - sensor.phone_battery
  - entity: sensor.home_battery_soc
    name: Home battery
    charge: sensor.storage_charge_power
    discharge: sensor.storage_discharge_power
    deadband: 20
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `entities` | list | – | entity IDs or objects (see below); omitted when `auto: true` |
| `title` | string | – | card heading, leave out = none |
| `segments` | 1–40 | `12` | number of LED bars per row |
| `columns` | 1–6 | `1` | columns in the grid |
| `bar_height` | 8–80 px | `22` | height of the bars (width scales responsively) |
| `row_gap` | 0–40 px | `8` | gap between icon, name, bar, arrow and value |
| `name_width` | CSS length \| `auto` | `30%` | label width. `auto` measures the longest name; anything else is used as-is (`120px`, `10em`, `40%`) |
| `precision` | 0–5 | – | decimal places of the displayed value. Empty = as reported by the entity (battery card: whole percent). Formatted in the HA language, so `3.8` vs `3,8` |
| `state_width` | CSS length \| `auto` | `3.2em` | width of the value column on the right. `auto` measures the longest value — usually the better choice for the gauge card with units |
| `show_icon` | bool | `true` | show the icon on the far left |
| `show_name` | bool | `true` | show the label on the left |
| `show_state` | bool | `true` | show the percentage on the right |
| `show_flow` | bool | `true` | show the charge-flow arrow (▲/▼) |
| `animate_flow` | bool | `true` | arrow moves in the flow direction, speed follows magnitude |
| `flow_style` | `arrow` \| `alternate` | `arrow` | `arrow`: own column next to the bar. `alternate`: the value column alternates between value and direction (every 2.5 s), saving a column |
| `peak` | bool | `false` | peak-hold mark: a single segment stays at the last-reached high while the bar below it recedes — the level-meter convention |
| `peak_hold` | 1–86400 s | `60` | how long the mark holds before it follows the current value again |
| `pulse_travel` | 0.2–20 s | `1.5` | duration of one pass across the full width — the **speed**, applies to `pulse` and `fill` |
| `pulse_period` | 1–60 s | `3` | time from one pass to the next — the **gap**. Doesn't change the speed; anything beyond `pulse_travel` is idle time. Smaller than `pulse_travel` lets passes overlap |
| `pulse_width` | 1–8 | `2` | how many segments are dark at once — the width of the travelling gap |
| `blink_tip` | bool | `false` | makes the tip blink in addition to the chosen animation, as soon as a direction is detected. Combinable with `fill` and `pulse`; already included in `blink` |
| `animation` | `none` \| `blink` \| `blink_always` \| `pulse` \| `fill` | `none` | `blink`: the last lit segment blinks as soon as a charge/discharge flow is detected — same in both directions, in the bar's level color. `blink_always`: always blinks, in the level color, without indicating direction. `pulse`: a dark segment travels across the lit part, right while charging, left while discharging; speed and repeat rate via `pulse_travel`, `pulse_period` and `pulse_width`. Close to the pre-4.2.0 behavior:
`pulse_travel: 3`, `pulse_period: 3`, `pulse_width: 3` — a continuous wave with no pause. `fill`: the segments up to the level light up dimmed and turn fully bright one by one — upward from 0 while charging, the same motion reversed while discharging, with the top going dark first. The level stays readable at all times because nothing ever goes fully dark. Filling happens over `pulse_travel`, then the bar holds until `pulse_period` is up. Blinking and the arrow, on the other hand, follow the actual power (1.8 s near 0 down to 0.35 s at `flow_full_scale`; 1.1 s without a measurable power value) |
| `flow_full_scale` | number | `1000` | value at which the animation runs at its fastest (unit of the power sensors) |
| `cap` | bool | `true` | show the positive terminal on the right of the bar |
| `frame_width` | 0–6 px | `2` | thickness of the housing frame, `0` = no frame |
| `cap_size` | 1–20 px | `5` | width of the terminal; its height follows from `bar_height` and this width |
| `sort` | bool | `false` | lowest level first |
| `preset` | see below | `standard` | ready-made color ramp (LED colors) |
| `surface` | `classic` \| `glass` \| `flat` | `classic` | housing, unlit segments and frame |
| `color_state` | bool | `true` | value on the right in the direction color, as soon as a flow is detected |
| `color_mode` | `level` \| `segment` | `level` | `level`: the whole bar carries the color of the current level. `segment`: each segment has its own color by the threshold it covers — the ramp then runs left to right |
| `warn_below` | 0–100 | `0` | the bar blinks below this level, `0` = off |
| `show_last_changed` | bool | `false` | "3 hours ago" next to the name — exposes dead sensors |
| `deadband` | number | `1` | charge-flow threshold (default for all rows), in the unit of the power sensors |
| `auto` | bool | `false` | collect all `device_class: battery` entities |
| `auto_area` | list | – | … only from these areas (entity or device area) |
| `auto_exclude` | list | – | … excluding these |
| `rebuild_delay` | 0–300 s | `5` | buffer before a changed auto-list is redrawn |
| `thresholds` | map | see below | boundaries of the color levels, in % |
| `colors` | map | see below | color per level (see below) |

### Collecting entities

When the card is added, the first four batteries found are pre-selected.

Under **Selected entities**, each row has its own expandable block: entity, display name,
charge-flow sensors and charge-flow threshold — all in one place. At the bottom is an empty
**＋ Add entity** block; as soon as an entity is chosen there, it moves into the list and a new
empty block appears. Remove a row by clearing its entity field.

The **Collect batteries** button appends every `device_class: battery` entity not already
listed, in one go.

To keep the list maintained *continuously* and automatically instead, set `auto: true` by hand
in YAML — then `auto_area`, `auto_exclude` and `rebuild_delay` apply. Manually listed entities
always come first, the rest is appended without duplicates.

When the auto-list changes (a device appears or disappears), the card doesn't redraw the rows
immediately but only after `rebuild_delay` seconds — a flapping sensor won't make the card
jitter. Until then the old row list keeps running; a vanished entity shows grey as `n/a` in the
meantime. The timer is deliberately *not* retriggered on every change, otherwise constant
flapping would postpone the rebuild forever. `0` = immediately.

### Per-entity entry

| Key | Meaning |
|---|---|
| `entity` | required |
| `name` | display name instead of `friendly_name` / entity ID |
| `icon` | icon instead of the entity's own, e.g. `mdi:home-battery` |
| `precision` | decimal places for this row only |
| `charging` | `binary_sensor`, `on` = charging |
| `power` | a signed sensor: `+` charging, `−` discharging |
| `charge` + `discharge` | two separate power sensors, the larger one wins |
| `deadband` | charge-flow threshold for this row only, otherwise the card value applies |

This is meant for home batteries (LG, Marstek, Solix …) that come with power sensors besides
the state of charge. For device batteries, just leave the fields empty and the arrow column
stays empty — or turn it off entirely with `show_flow: false`.

The result is a chevron next to the bar: **▲ green** = charging, **▼ orange** = discharging,
nothing = idle or unknown. With `animate_flow` the arrow moves in the flow direction; the
speed increases with power — from 2 s per pass near 0 down to 0.5 s at `flow_full_scale`. A
plain charging binary sensor doesn't report a magnitude, so the arrow runs at medium speed.
`prefers-reduced-motion` turns off all animations. The three sources are checked in the order
above; `charging: off` explicitly does *not* mean "discharging" — a charging binary sensor
doesn't know that. Values below the charge-flow threshold count as idle.

### Color presets (`preset`)

| Value | Ramp |
|---|---|
| `standard` | tomato → orange → gold → yellowgreen → limegreen |
| `led-classic` | red → orange → yellow → green → cyan, like `led.jpg` |
| `ampel` | muted traffic-light colors, `#d32f2f` → `#388e3c` |
| `neon` | vivid, for dark themes |
| `mono` | every level in `var(--primary-color)` — length matters, not color |
| `invers` | blue → green → yellow → orange → red, i.e. **full = red**: for values where high is bad (temperature, a wastewater tank's fill level) |

```yaml
preset: ampel
colors:
  critical: "#000"      # override a single level anyway
```

The placeholders in the color editor always show the values of the selected preset.

### Housing (`surface`)

| Value | Body | Unlit | Frame |
|---|---|---|---|
| `classic` | `#111111` | `#262626` | `var(--divider-color)` |
| `glass` | text color at 7% over transparent | 18% | 25% |
| `flat` | `transparent` | text color at 15% | none |

`classic` is the black battery body from `led.jpg` and the default — matches the standard
themes, light and dark alike. **`glass`** is for themes with translucent or gradient cards
(e.g. *kibbit-dark-cards*): nothing is painted over, the card shows through, and in a light
theme the same veil turns dark instead of light. `flat` drops the housing entirely.

Override individual values as usual via `colors.body`, `colors.off`, `colors.frame` — these
beat both `surface` and `preset`.

### Color levels

| Key | Default threshold | Default color |
|---|---|---|
| `critical` | < 10% | `#ff6347` tomato |
| `low` | < 30% | `#ffa500` orange |
| `medium` | < 50% | `#ffd700` gold |
| `high` | < 80% | `#9acd32` yellowgreen |
| `full` | rest | `#32cd32` limegreen |
| `off` | – | unlit segments — mixed from the theme by default |
| `body` | – | housing behind the segments — mixed from the theme by default |
| `frame` | – | frame and terminal, default `var(--divider-color)` |
| `pos` | – | positive direction (charging / rising), default `var(--success-color)` — colors the arrow and value, not the segments |
| `neg` | – | negative direction (discharging / falling), default `var(--error-color)`, i.e. red |

The editor offers two ways: **Colors (theme)** with HA's own color picker (theme colors like
*red*, *primary*, *accent*) and below it **Colors — custom values** with a color picker plus a
text field for everything else. Both write the same key, empty = default. Color values may be:
`#2ed0d8`, `2ed0d8` (the `#` is added), `#2ed0d8ff` with alpha, `rgba(46,208,216,0.4)`,
`rgb(46 208 216 / 40%)`, `hsla(…)`, `#2ed0d866` and `2ed0d866` (8-digit = with alpha),
`[46,208,216]` and `[46,208,216,0.4]` as a list, names like `red` or `tomato` (becomes
`var(--red-color, red)`: theme color if the theme has one, otherwise the CSS value of the
same name), hyphenated theme names like `deep-purple`, `rgb(46,208,216)`,
`var(--error-color)` — or still `[46,208,216]` from older configs. `thresholds` and `colors`
are independent of each other.

### Theme

The card picks up theme variables wherever they exist: card background and border from
`ha-card`, `--ha-card-header-font-size`/`-font-family`/`-color` for the title,
`--primary-text-color` for names, `--secondary-text-color` for value and time,
`--divider-color` for the housing frame and terminal, `--state-icon-color` for the icon,
`--error-color` for the warning, `--success-color`/`--warning-color` for the arrow,
`--disabled-text-color` for rows without a value.

Housing, unlit segments and frame are veils of the text color over `transparent`
(`color-mix` at 7%, 18% and 25%) — so **no background of their own**. This lets the card show
through even with themes that have translucent or gradient cards; in a light theme the same
veil turns dark instead of light. The LED colors themselves stay fixed, otherwise the ramp
would look different in every theme.

To get the classic black battery body from `led.jpg` regardless of theme:

```yaml
colors:
  body: "#111111"
  off: "#262626"
  frame: "#9e9e9e"
```

And with no housing at all, just segments on the card:

```yaml
frame_width: 0
colors:
  body: transparent
```

### Determining the value

numeric state → `battery_level` attribute → `binary_sensor` (`on` = empty, `off` = full)
→ otherwise `n/a` (grey row, no segments).

## Version

`VERSION` is at the top of `battery-led-card.js`. It shows up at the bottom of the visual
editor, in the description in the card picker, and as a banner in the browser console —
handy for checking whether the browser has loaded the new file (cache!).

## `custom:led-gauge-card` — any values

Same options as above, plus:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `min` | number | `0` | value that corresponds to 0% (card-wide) |
| `max` | number | `100` | value that corresponds to 100% (card-wide) |
| `trend_flow` | bool | `true` | arrow derived from the value's own trend, when no charge-flow sensors are given. Only on here — the battery card leaves it off, a battery dropping by 1% doesn't need an arrow |
| `trend_deadband` | 0–100% | `0.5` | changes smaller than this (in % of scale) count as idle — the counterpart to `deadband` on the battery card. Also settable per row |
| `trend_hold` | 10–86400 s | `300` | how long the arrow stays after the last change, and how far back the history query looks |
| `trend_history` | bool | `true` | ask HA for the history once on load, so the arrow is correct right away |
| `trend_full_scale` | number | `5` | change in %/min at which the animation runs at its fastest |

`min`/`max` are also available per row and then override the card-wide value. Without either,
0–100 applies and the card behaves like the battery variant.

```yaml
type: custom:led-gauge-card
title: Storage & tanks
segments: 20
color_mode: segment
entities:
  - entity: sensor.cistern_level
    name: Cistern
    min: 0
    max: 5000
  - entity: sensor.heating_oil_liters
    name: Heating oil
    max: 3000
  - sensor.bathroom_humidity          # without min/max: 0–100
```

Shown on the right is the **raw value with its unit** (`3240 l`), not the percentage — that's
encoded in the bar length instead.

The charge-flow sensors (`charging`, `power`, `charge`/`discharge`, `deadband`) don't exist
here — "charging" has no meaning for a fill level. Instead there's the **trend arrow**: the
card watches the value itself, points up when it rises, down when it falls, speed follows the
rate of change per minute. On load, the card fetches the last `trend_hold` seconds of history
once (`history/history_during_period`, one call for all rows together) — so the arrow is
correct right away instead of only after the first observed change. After that it runs off the
ongoing state updates with no further queries. If the history integration is off or the call
fails, it falls back to the old behavior: arrow only from the first change onward. Disable
with `trend_history: false`.

(The sensor fields still work in YAML, they're just not in the editor.)

## Test sensors

`testsensoren.yaml` contains four template sensors for trying out the animations without
waiting for a real battery: **falling** and **rising** (5 minutes from 0 to 100 and back),
**oscillating** (a triangle wave with no jump, 10 minutes per cycle) and **test power**
(+2000 / −2000 W, matching the oscillator). Add it, reload YAML configuration, done — no
restart needed.

```yaml
type: custom:led-gauge-card
title: Animation test
segments: 24
animation: pulse
peak: true
entities:
  - entity: sensor.testwert_pendelnd
    name: Oscillating
  - entity: sensor.testwert_steigend
    name: Rising
  - entity: sensor.testwert_fallend
    name: Falling
trend_full_scale: 20
trend_hold: 60
```

For the battery card, use `sensor.testwert_pendelnd` with `power: sensor.testleistung`
instead — then the direction comes from the power value rather than the trend.

## Editor language

The visual editor's labels, dropdown options, buttons and hints follow `hass.language` —
English and German are supported today, with English as the fallback for any other language.
The card's own on-screen text (e.g. the `n/a`/`n/v` shown for an unavailable entity) follows
the same setting. The card picker's description text is fixed at load time (from the browser
language), since it's set before any dashboard's `hass` is available.

## Test

`node test.mjs` — runs both: the logic tests, then `test-render.mjs`, which actually renders
the card in a minimal DOM (both card types, every mode, edge cases like an empty list or a
dead sensor). The render test doesn't check appearance, only that the render path completes
without throwing.

Covered: color levels and thresholds, color normalization, segment math, value resolution,
charge-flow logic, auto-collection incl. area filtering, relative time, editor→config
conversion, and the editor's language selection.
