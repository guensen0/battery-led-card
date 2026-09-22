// battery-led-card — horizontal segmented LED battery overview for Home Assistant
// Resource type: module

export const VERSION = "4.5.1";

// Stufe, Default-Schwelle (Stand < Schwelle), Default-Farbe. Reihenfolge = Prüfreihenfolge.
const LEVELS = [
  ["critical", 10, "#ff6347"],   // tomato
  ["low", 30, "#ffa500"],        // orange
  ["medium", 50, "#ffd700"],     // gold
  ["high", 80, "#9acd32"],       // yellowgreen
  ["full", Infinity, "#32cd32"], // limegreen
];
// Schleier aus der Textfarbe gegen `transparent` — dunkles Theme heller Schleier, helles
// Theme dunkler, und die Karte scheint durch.
const shade = (pct) =>
  `color-mix(in srgb, var(--primary-text-color, #000) ${pct}%, transparent)`;

/** Gehäuse-Voreinstellungen: Körper, unbeleuchtete Segmente, Rahmen + Pluspol. */
export const SURFACES = {
  classic: { body: "#111111", off: "#262626", frame: "var(--divider-color, #9e9e9e)" },
  glass: { body: shade(7), off: shade(18), frame: shade(25) },
  flat: { body: "transparent", off: shade(15), frame: "transparent" },
};
const { body: BODY, off: OFF, frame: FRAME } = SURFACES.classic;

const FLOW_DEFAULT = {
  charging: "var(--success-color, #2ec13c)",
  discharging: "var(--error-color, #f44336)",
};

/** Farbe für die Richtung: `colors.pos` beim Steigen, `colors.neg` beim Fallen. */
export const flowColor = (dir, colors = {}) => {
  if (!dir) return "";
  const own = dir === "charging" ? colors.pos : colors.neg;
  return toCss(own ?? FLOW_DEFAULT[dir]);
};

const mono = (c) => ({ critical: c, low: c, medium: c, high: c, full: c });

/** Fertige Farbrampen. Einzelne Werte in `colors` schlagen die Voreinstellung. */
export const PRESETS = {
  standard: {},                          // die Defaults aus LEVELS
  "led-classic": { critical: "#e53522", low: "#ef8a2b", medium: "#e3d92b",
                   high: "#2ec13c", full: "#2ed0d8" },
  ampel: { critical: "#d32f2f", low: "#f57c00", medium: "#fbc02d",
           high: "#689f38", full: "#388e3c" },
  invers: { critical: "#2196f3", low: "#4caf50", medium: "#ffc107",
            high: "#ff9800", full: "#f44336" },
  mono: mono("var(--primary-color, #03a9f4)"),
  neon: { critical: "#ff1e56", low: "#ff8c00", medium: "#f9f871",
          high: "#5ddf6b", full: "#1de9d6" },
};

export const presetColors = (preset, colors = {}, surface) => ({
  ...(PRESETS[preset] ?? {}),
  ...(SURFACES[surface] ?? {}),
  ...colors,
});

/**
 * Farbwert aus der Config in einen CSS-Wert: Hex mit oder ohne `#` (auch 4- und 8-stellig
 * mit Alpha), CSS-Farbname, `rgb()`/`rgba()`/`hsl()`, `var(--x)` — oder `[r,g,b]` bzw.
 * `[r,g,b,a]` als Liste.
 */
export const toCss = (c) => {
  if (Array.isArray(c)) return c.length > 3 ? `rgba(${c.join(",")})` : `rgb(${c.join(",")})`;
  const v = String(c ?? "").trim();
  if (/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return `#${v}`;
  // Theme-Farbe wenn das Theme sie kennt, sonst der gleichnamige CSS-Wert:
  // "red" -> var(--red-color, red), "deep-purple" -> var(--deep-purple-color)
  if (/^[a-z]+$/.test(v)) return `var(--${v}-color, ${v})`;
  if (/^[a-z]+(?:-[a-z]+)+$/.test(v)) return `var(--${v}-color)`;
  return v;
};

export const levelColor = (pct, colors = {}, thresholds = {}) => {
  const [key, , def] = LEVELS.find(([k, max]) => pct < (thresholds[k] ?? max));
  return toCss(colors[key] ?? def);
};

/** Farbe eines einzelnen Segments — bewertet wird die Mitte des Bereichs, den es abdeckt. */
export const segmentColor = (i, segments, colors, thresholds) =>
  levelColor(((i + 0.5) / segments) * 100, colors, thresholds);

/**
 * Peak-Hold wie am Pegelmeter: die Marke springt sofort auf jeden neuen Höchstwert und
 * bleibt dort stehen; erst nach `holdMs` ohne neuen Höchstwert fällt sie auf den
 * aktuellen Wert zurück.
 */
export const peakStep = (prev, lvl, t, holdMs = 60000) => {
  if (lvl == null) return prev ?? null;
  if (!prev || lvl >= prev.v) return { v: lvl, t };
  return t - prev.t > holdMs ? { v: lvl, t } : prev;
};

/**
 * Zeitgerüst der Welle. `travel` ist die Zeit für einen kompletten Durchlauf über die ganze
 * Breite, `period` der Abstand zwischen zwei Durchläufen. Daraus folgt der Versatz je
 * Segment und die Dunkelphase: `width` Segmente sind gleichzeitig aus, das ergibt eine feste
 * Dauer in Sekunden. Erst zum Schluss wird sie in Prozent der Periode umgerechnet — sonst
 * würde eine längere Pause die Welle träger machen, statt nur den Abstand zu vergrößern.
 */
export const waveTiming = (segments, travel, period, width = 2) => {
  const step = travel / Math.max(1, segments);
  const dark = Math.max(0.08, width * step);
  const dip = Math.min(60, (dark / Math.max(0.1, period)) * 100);
  return { step: Number(step.toFixed(3)), dip: Number(dip.toFixed(2)) };
};

/**
 * Keyframes für die Füll-Animation: je Segment eine Regel, die es bis zu seinem Zeitpunkt
 * gedimmt lässt und danach voll leuchten. Rückwärts abgespielt ergibt dieselbe Regel das
 * Entladen — oben geht zuerst aus. `dim` ist die Grundhelligkeit, damit der Füllstand
 * jederzeit ablesbar bleibt. `span` ist der Anteil der Runde, in dem gefüllt wird; der Rest
 * ist Standzeit, damit die Periode nur den Abstand steuert und nicht das Tempo.
 */
export const fillKeyframes = (name, segments, dim = 0.3, span = 1) =>
  Array.from({ length: segments }, (_, i) => {
    const at = ((i / segments) * Math.min(1, span) * 100).toFixed(1);
    return `@keyframes ${name}-${i} {
      0%, ${at}% { opacity: ${dim}; }
      ${(Number(at) + 0.1).toFixed(1)}%, 100% { opacity: 1; }
    }`;
  }).join("\n");

/**
 * Das pulsierende Segment ist immer das letzte leuchtende — in beide Richtungen.
 * -1 wenn in dieser Betriebsart nichts pulsiert.
 */
export const pulseIndex = (mode, dir, on, segments) => {
  if (mode !== "blink" && mode !== "blink_always") return -1;
  if (mode === "blink" && !dir) return -1;
  if (!segments || on <= 0) return -1;
  return Math.min(segments - 1, on - 1);
};

/** Anzahl leuchtender Segmente. >0% leuchtet immer mindestens eins. */
export const filledSegments = (pct, segments) => {
  const p = Math.min(100, Math.max(0, pct));
  return p <= 0 ? 0 : Math.max(1, Math.round((p / 100) * segments));
};

export const DEFAULT_NAME_WIDTH = "30%";
export const DEFAULT_STATE_WIDTH = "3.2em";

/** Leeres Feld aus dem Editor zaehlt als "nicht gesetzt". */
export const normWidth = (w, def = DEFAULT_NAME_WIDTH) =>
  (typeof w === "string" && w.trim()) || def;

/** flex-Wert einer Textspalte. "auto" ist nur der Startwert, danach wird gemessen. */
export const nameFlex = (w, def) => `0 0 ${normWidth(w, def)}`;

/** Batteriestand aus einem hass-State, oder null wenn unbekannt. */
export const batteryLevel = (st) => {
  if (!st) return null;
  const v = Number(st.state);
  if (Number.isFinite(v)) return v;
  const a = Number(st.attributes?.battery_level);
  if (Number.isFinite(a)) return a;
  if (st.state === "on") return 0;   // binary_sensor battery: on == leer
  if (st.state === "off") return 100;
  return null;
};

/**
 * Beliebiger Zahlenwert auf 0..100 skaliert. min/max je Zeile, sonst je Karte, sonst 0/100.
 * Werte außerhalb bleiben außerhalb — das Clamping macht erst die Segmentrechnung.
 */
export const scaleValue = (st, item = {}, card = {}) => {
  if (!st) return null;
  const v = Number(st.state);
  if (!Number.isFinite(v)) return null;
  const min = item.min ?? card.min ?? 0;
  const max = item.max ?? card.max ?? 100;
  return max === min ? null : ((v - min) / (max - min)) * 100;
};

/**
 * Trend aus dem eigenen Verlauf: steigt der Wert, geht der Pfeil hoch. `rate` ist die
 * Änderung in Einheiten pro Minute. Nach `holdMs` ohne Änderung verschwindet der Pfeil.
 */
export const trendStep = (prev, v, t, holdMs = 300000, minDelta = 0) => {
  if (!prev) return { v, t, dir: null, rate: null };
  const delta = v - prev.v;
  // Änderungen unter der Schwelle zählen als Ruhe — sonst flattert der Pfeil im Rauschen
  if (Math.abs(delta) <= minDelta) {
    return t - prev.t > holdMs ? { v: prev.v, t: prev.t, dir: null, rate: null } : prev;
  }
  const dt = Math.max(1, (t - prev.t) / 60000);
  return { v, t, dir: delta > 0 ? "charging" : "discharging", rate: Math.abs(delta) / dt };
};

/**
 * Antwort von `history/history_during_period` in Trend-Startwerte übersetzen: der älteste
 * Messpunkt im Fenster wird zum "vorher". Die komprimierte Antwort nutzt `s` (state) und
 * `lu` (last_updated in Sekunden).
 */
export const trendSeeds = (history, items, card = {}) => {
  const out = [];
  for (const item of items) {
    const first = history?.[item.entity]?.[0];
    if (!first) continue;
    const v = scaleValue({ state: first.s ?? first.state, attributes: {} }, item, card);
    if (v === null || !first.lu) continue;
    out.push([item.entity, { v, t: first.lu * 1000, dir: null, rate: null }]);
  }
  return out;
};

/**
 * Ladefluss einer Zeile: "charging" | "discharging" | null (unbekannt/Ruhe).
 * Drei Quellen, in dieser Reihenfolge:
 *   charging            binary_sensor, on = lädt (off sagt nichts über Entladen aus)
 *   power               ein vorzeichenbehafteter Sensor, + = laden, - = entladen
 *   charge + discharge  zwei getrennte Sensoren, der größere gewinnt
 */
export const chargeFlow = (item, states = {}, deadband = 1) => {
  const num = (id) => {
    const v = Number(states[id]?.state);
    return Number.isFinite(v) ? v : null;
  };
  const none = { dir: null, rate: null };
  if (item.charging) {
    return states[item.charging]?.state === "on" ? { dir: "charging", rate: null } : none;
  }
  if (item.power) {
    const v = num(item.power);
    if (v === null) return none;
    if (v > deadband) return { dir: "charging", rate: v };
    if (v < -deadband) return { dir: "discharging", rate: -v };
    return { dir: null, rate: Math.abs(v) };
  }
  if (item.charge || item.discharge) {
    const c = Math.abs(num(item.charge) ?? 0);
    const d = Math.abs(num(item.discharge) ?? 0);
    if (c <= deadband && d <= deadband) return { dir: null, rate: Math.max(c, d) };
    return c >= d ? { dir: "charging", rate: c } : { dir: "discharging", rate: d };
  }
  return none;
};

/** Nur die Richtung — dünner Wrapper um chargeFlow. */
export const chargeState = (item, states, deadband) => chargeFlow(item, states, deadband).dir;

/**
 * Dauer eines Pfeil-Durchlaufs in Sekunden: je stärker der Fluss, desto schneller.
 * Ohne messbaren Wert (reiner Lade-Binärsensor) läuft es mit mittlerem Tempo.
 */
export const flowDuration = (rate, scale = 1000, slow = 2, fast = 0.5) => {
  const d = rate == null || !(scale > 0)
    ? (slow + fast) / 2
    : slow - (slow - fast) * Math.min(1, Math.abs(rate) / scale);
  return Number(d.toFixed(2));
};

const areaOf = (hass, id) => {
  const e = hass.entities?.[id];
  return e?.area_id ?? hass.devices?.[e?.device_id]?.area_id ?? null;
};

/** Alle Batterie-Entitäten einsammeln, optional auf Bereiche gefiltert. */
export const autoEntities = (hass, { area, exclude = [] } = {}) => {
  const areas = area?.length ? [].concat(area) : null;
  return Object.keys(hass.states)
    .filter(
      (id) =>
        hass.states[id].attributes.device_class === "battery" &&
        !exclude.includes(id) &&
        (!areas || areas.includes(areaOf(hass, id))),
    )
    .sort();
};

/**
 * Zahl mit fester Nachkommastellenzahl, in der Schreibweise der HA-Sprache (1.234,5).
 * Ohne `precision` bleibt der Wert so, wie die Entität ihn liefert.
 */
export const formatValue = (v, precision, locale = "de") => {
  if (precision == null) return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(n);
};

const UNITS = [[60, 1, "second"], [3600, 60, "minute"], [86400, 3600, "hour"], [Infinity, 86400, "day"]];

/** "vor 3 Stunden" — Intl statt Datums-Bibliothek. */
export const relTime = (iso, now = Date.now(), locale = "de") => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = (t - now) / 1000;
  const [, div, unit] = UNITS.find(([max]) => Math.abs(s) < max);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(s / div), unit);
};

const probe = globalThis.document?.createElement("span");

/** Beliebigen CSS-Farbwert in #rrggbb umrechnen — der Browser kann das, also lassen wir ihn. */
export const resolveHex = (css, fallback = "#000000") => {
  if (!probe || !document.body) return fallback;
  probe.style.color = "";
  probe.style.color = css;                    // ungültige Werte bleiben leer
  if (!probe.style.color) return fallback;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g);
  probe.remove();
  return rgb
    ? "#" + rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")
    : fallback;
};

const CSS = `
  ha-card { padding: 12px 14px; }
  .title { font-size: var(--ha-card-header-font-size, 1.1em);
           font-family: var(--ha-card-header-font-family, inherit);
           color: var(--ha-card-header-color, var(--primary-text-color, inherit));
           font-weight: 500; margin-bottom: 10px; }
  .grid { display: grid; gap: 2px 18px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer;
         min-width: 0; }
  .icon { flex: 0 0 auto; --mdc-icon-size: 20px; color: var(--state-icon-color, currentColor); }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: .95em; color: var(--primary-text-color, inherit); }
  .time { flex: 0 0 auto; font-size: .75em; white-space: nowrap;
          color: var(--secondary-text-color, inherit); }
  .pct { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
         overflow: hidden; text-overflow: ellipsis; font-size: .9em;
         color: var(--secondary-text-color, inherit); }
  .batt { flex: 2 1 60px; display: flex; align-items: center; min-width: 0; }
  .body { flex: 1 1 auto; display: flex; gap: 2px; padding: 2px; border-radius: 4px;
          border-style: solid; min-width: 0; }
  .cap { margin-left: 1px; border-radius: 0 3px 3px 0; }
  .seg { flex: 1 1 0; min-width: 1px; border-radius: 1px;
         transition: background .3s, box-shadow .3s; }
  .chev { flex: 0 0 18px; display: flex; justify-content: center; --mdc-icon-size: 18px; }
  .chev ha-icon.up { animation: bl-up var(--bl-dur, 1.2s) ease-in-out infinite; }
  .chev ha-icon.down { animation: bl-down var(--bl-dur, 1.2s) ease-in-out infinite; }
  @keyframes bl-up {
    0% { transform: translateY(4px); opacity: 0; }
    40% { opacity: 1; }
    100% { transform: translateY(-4px); opacity: 0; }
  }
  @keyframes bl-down {
    0% { transform: translateY(-4px); opacity: 0; }
    40% { opacity: 1; }
    100% { transform: translateY(4px); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev ha-icon, .row.warn .body, .seg.blink, .seg.wave, .seg.fill {
      animation: none !important; opacity: 1;
    }
  }
  .row.dead .name, .row.dead .pct { opacity: .6; font-style: italic; }
  .seg.blink { animation: bl-pulse var(--bl-dur, 1.1s) ease-in-out infinite; }
  .seg.wave { animation-duration: var(--bl-dur, 3s); animation-timing-function: linear;
              animation-iteration-count: infinite; }
  .seg.fill { animation-duration: var(--bl-dur, 3s); animation-timing-function: linear;
              animation-iteration-count: infinite; }
  /* Die Keyframes entstehen je Karte in _build — ihre Breite hängt von Tempo, Periode
     und Segmentzahl ab und lässt sich nicht statisch hinschreiben. */
  .row.warn .body { animation: bl-pulse 1.6s ease-in-out infinite; }
  .row.warn .pct { color: var(--error-color, #e53522); opacity: 1; font-weight: 600; }
  @keyframes bl-pulse { 50% { opacity: .35; } }
  .tools { display: flex; align-items: center; gap: 12px; padding: 10px 2px 4px; }
  .tools button { padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit;
    border: 1px solid var(--primary-color, #03a9f4); background: transparent;
    color: var(--primary-color, #03a9f4); }
  .tools button:hover { background: color-mix(in srgb, var(--primary-color, #03a9f4) 10%, transparent); }
  .tools .hint { font-size: .85em; opacity: .7; }
  .colorbox { margin-top: 8px; border-top: 1px solid var(--divider-color, #9e9e9e); }
  .colorbox summary { cursor: pointer; padding: 10px 2px; font-weight: 500; }
  .crow { display: flex; align-items: center; gap: 10px; padding: 4px 2px; }
  .crow label { flex: 1 1 auto; font-size: .95em; }
  .crow input[type=color] { flex: 0 0 38px; height: 30px; padding: 0; cursor: pointer;
    border: 1px solid var(--divider-color, #9e9e9e); border-radius: 4px; background: none; }
  .crow input[type=text] { flex: 0 0 10em; padding: 6px 8px; border-radius: 4px;
    border: 1px solid var(--divider-color, #9e9e9e); background: transparent;
    color: var(--primary-text-color, inherit); font-family: inherit; }
  .version { padding: 8px 4px 0; font-size: .8em; opacity: .55; text-align: right; }
`;

export const DEFAULTS = {
  segments: 12,
  columns: 1,
  bar_height: 22,
  row_gap: 8,
  name_width: DEFAULT_NAME_WIDTH,
  state_width: DEFAULT_STATE_WIDTH,
  show_icon: true,
  show_name: true,
  show_state: true,
  show_flow: true,
  flow_style: "arrow",
  animation: "none",
  pulse_travel: 1.5,
  pulse_period: 3,
  pulse_width: 2,
  blink_tip: false,
  peak: false,
  peak_hold: 60,
  color_state: true,
  color_mode: "level",
  animate_flow: true,
  flow_full_scale: 1000,
  cap: true,
  cap_size: 5,
  frame_width: 2,
  sort: false,
  deadband: 1,
  warn_below: 0,
  show_last_changed: false,
  colors: {},
  thresholds: {},
  auto: false,
  auto_area: [],
  auto_exclude: [],
  rebuild_delay: 5,
  min: 0,
  max: 100,
  trend_flow: false,    // nur die generische Karte schaltet das an, s. setConfig
  trend_hold: 300,
  trend_deadband: 0.5,
  trend_history: true,
  trend_full_scale: 5,
};

let WAVE_ID = 0;

const Base = globalThis.HTMLElement ?? class {};

export class BatteryLedCard extends Base {
  /** Der zweite Tag nutzt dieselbe Engine, nur ohne Batterie-Annahmen. */
  get _generic() {
    return this.localName === "led-gauge-card";
  }

  setConfig(config) {
    if (config.entities && !Array.isArray(config.entities))
      throw new Error("battery-led-card: 'entities' muss eine Liste sein");
    this._config = {
      ...DEFAULTS,
      // Verlaufspfeil ergibt nur bei frei skalierten Werten Sinn: eine Batterie, die um 1 %
      // fällt, braucht keinen Pfeil — ein Tank, der sich leert, schon.
      trend_flow: this._generic,
      ...config,
      name_width: normWidth(config.name_width),
      state_width: normWidth(config.state_width, DEFAULT_STATE_WIDTH),
      colors: presetColors(config.preset, config.colors, config.surface ?? "classic"),
      entities: (config.entities ?? []).map((e) => (typeof e === "string" ? { entity: e } : e)),
    };
    this._key = null;
    this._rows = null;
    this._trend = new Map();
    this._peak = new Map();
    this.innerHTML = "";
  }

  set hass(hass) {
    this._hass = hass;
    const items = this._resolve(hass);
    const key = items.map((i) => i.entity).join(",");
    if (key === this._key) {
      clearTimeout(this._timer);          // Liste wieder wie gebaut: Umbau abblasen
      this._timer = null;
    } else if (!this._rows) {
      this._rebuild(items, key);          // erster Aufbau sofort
    } else {
      this._schedule();                   // sonst gepuffert, gegen Flackern
    }
    this._update();
  }

  /**
   * Umbau erst wenn sich die Liste `rebuild_delay` Sekunden lang nicht mehr gelohnt hat.
   * Ein laufender Timer wird nicht neu gestartet, sonst schiebt ein flatternder Sensor
   * den Umbau endlos vor sich her.
   */
  _schedule() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._hass) return;
      const items = this._resolve(this._hass);
      const key = items.map((i) => i.entity).join(",");
      if (key === this._key) return;
      this._rebuild(items, key);
      this._update();
    }, Math.max(0, this._config.rebuild_delay) * 1000);
  }

  /** Ein Taktgeber für die ganze Karte, nur wenn der Wechselmodus läuft. */
  _tick() {
    const want = this._config.show_flow && this._config.flow_style === "alternate";
    if (want === !!this._alt) return;
    clearInterval(this._alt);
    this._alt = want
      ? setInterval(() => {
          this._altPhase = !this._altPhase;
          if (this._rows && this._hass) this._update();
        }, 2500)
      : null;
  }

  _rebuild(items, key) {
    this._key = key;
    this.innerHTML = "";
    this._build(items);
    this._tick();
    this._seedTrend(items);
  }

  /**
   * Ohne Verlauf zeigt der Trendpfeil erst nach der ersten beobachteten Änderung etwas an —
   * bei trägen Werten dauert das. Also einmal beim Aufbau fragen, wie es vorher aussah.
   * Scheitert der Aufruf (History-Integration aus, alte HA-Version), bleibt es beim alten
   * Verhalten.
   */
  async _seedTrend(items) {
    const c = this._config;
    const rows = items.filter(
      (i) => !(i.charging || i.power || i.charge || i.discharge),
    );
    if (!c.trend_flow || !c.trend_history || !rows.length || !this._hass?.callWS) return;
    let history;
    try {
      history = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - c.trend_hold * 1000).toISOString(),
        entity_ids: rows.map((i) => i.entity),
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
    } catch {
      return;
    }
    if (this._key !== items.map((i) => i.entity).join(",")) return;   // inzwischen umgebaut
    for (const [id, seed] of trendSeeds(history, rows, c)) this._trend.set(id, seed);
    if (this._rows && this._hass) this._update();
  }

  disconnectedCallback() {
    clearTimeout(this._timer);
    clearInterval(this._alt);
    this._timer = null;
    this._alt = null;
  }

  /** Manuelle Entitäten zuerst, danach die automatisch gefundenen ohne Dubletten. */
  _resolve(hass) {
    const c = this._config;
    const manual = c.entities;
    if (!c.auto) return manual;
    const seen = new Set(manual.map((m) => m.entity));
    const auto = autoEntities(hass, { area: c.auto_area, exclude: c.auto_exclude })
      .filter((id) => !seen.has(id))
      .map((entity) => ({ entity }));
    return [...manual, ...auto];
  }

  _build(items) {
    const c = this._config;
    const card = document.createElement("ha-card");
    const style = document.createElement("style");
    style.textContent = CSS;
    if (c.animation === "fill") {
      this._fill = `bl-fill-${++WAVE_ID}`;
      style.textContent += fillKeyframes(
        this._fill, c.segments, 0.3, c.pulse_travel / Math.max(0.1, c.pulse_period),
      );
    }
    if (c.animation === "pulse") {
      // eigener Name je Karte: das <style> liegt im Light DOM, Keyframes gelten global
      this._wave = `bl-wave-${++WAVE_ID}`;
      const { step, dip } = waveTiming(c.segments, c.pulse_travel, c.pulse_period, c.pulse_width);
      this._waveStep = step;
      style.textContent += `
        @keyframes ${this._wave} {
          0%, ${dip}%, 100% { background: var(--bl-col); box-shadow: 0 0 5px var(--bl-col); }
          ${(dip / 2).toFixed(1)}% { background: var(--bl-off); box-shadow: none; }
        }
        .seg.wave { animation-name: ${this._wave}; }`;
    }
    card.appendChild(style);
    if (c.title) {
      const t = document.createElement("div");
      t.className = "title";
      t.textContent = c.title;
      card.appendChild(t);
    }
    this._segColors = c.color_mode === "segment"
      ? Array.from({ length: c.segments }, (_, i) => segmentColor(i, c.segments, c.colors, c.thresholds))
      : null;
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, c.columns)}, minmax(0, 1fr))`;
    card.appendChild(grid);

    this._rows = items.map((item) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `${c.show_icon ? '<ha-state-icon class="icon"></ha-state-icon>' : ""}
        ${c.show_name ? '<div class="name"></div>' : ""}
        ${c.show_last_changed ? '<div class="time"></div>' : ""}
        <div class="batt"><div class="body"></div>${c.cap ? '<div class="cap"></div>' : ""}</div>
        ${c.show_flow && c.flow_style === "arrow"
          ? '<div class="chev"><ha-icon></ha-icon></div>' : ""}
        ${c.show_state ? '<div class="pct"></div>' : ""}`;
      row.style.gap = `${c.row_gap}px`;
      const body = row.querySelector(".body");
      body.style.height = `${c.bar_height}px`;
      body.style.background = toCss(c.colors.body ?? BODY);
      body.style.borderColor = toCss(c.colors.frame ?? FRAME);
      body.style.borderWidth = `${c.frame_width}px`;
      const capEl = row.querySelector(".cap");
      if (capEl) {
        // wächst mit dem Gehäuse mit, sonst verschwindet er bei hohen Balken
        capEl.style.flex = `0 0 ${c.cap_size}px`;
        capEl.style.background = toCss(c.colors.frame ?? FRAME);
        capEl.style.height =
          `${Math.max(9, Math.round(c.bar_height * 0.45), Math.round(c.cap_size * 1.8))}px`;
      }
      const nameEl = row.querySelector(".name");
      if (nameEl) nameEl.style.flex = nameFlex(c.name_width);
      const pctEl = row.querySelector(".pct");
      if (pctEl) pctEl.style.flex = nameFlex(c.state_width, DEFAULT_STATE_WIDTH);
      const segs = Array.from({ length: c.segments }, () => {
        const s = document.createElement("div");
        s.className = "seg";
        body.appendChild(s);
        return s;
      });
      row.addEventListener("click", () => {
        const ev = new Event("hass-more-info", { bubbles: true, composed: true });
        ev.detail = { entityId: item.entity };
        this.dispatchEvent(ev);
      });
      grid.appendChild(row);
      return {
        item, row, segs,
        icon: row.querySelector(".icon"),
        name: row.querySelector(".name"),
        pct: row.querySelector(".pct"),
        time: row.querySelector(".time"),
        chev: row.querySelector(".chev ha-icon"),
      };
    });
    this.appendChild(card);
  }

  _update() {
    const c = this._config;
    const off = toCss(c.colors.off ?? OFF);
    const locale = this._hass.locale?.language ?? "de";
    const data = this._rows.map((r) => {
      const st = this._hass.states[r.item.entity];
      return {
        ...r,
        st,
        lvl: this._generic ? scaleValue(st, r.item, c) : batteryLevel(st),
      };
    });
    if (c.sort) {
      data.sort((a, b) => (a.lvl ?? 999) - (b.lvl ?? 999));
      data.forEach((d) => d.row.parentNode.appendChild(d.row));
    }
    for (const { item, row, segs, icon, name, pct, time, chev, st, lvl } of data) {
      // Richtung wird immer berechnet — sie steuert auch das Pulsieren, das unabhängig
      // davon ist, ob ein Pfeil angezeigt wird.
      const flow = this._flow(item, lvl, c);
      const dir = flow.dir;
      if (icon) {
        // ha-state-icon kennt die Zustandslogik (Batteriestand, device_class) schon
        icon.hass = this._hass;
        icon.stateObj = st;
        icon.icon = item.icon || undefined;
      }
      if (name) name.textContent = item.name ?? st?.attributes?.friendly_name ?? item.entity;
      row.classList.toggle("dead", lvl === null);
      row.classList.toggle("warn", lvl !== null && c.warn_below > 0 && lvl < c.warn_below);
      if (pct) {
        // Platzsparmodus: die Wertespalte zeigt abwechselnd Wert und Richtung
        const swap = c.show_flow && c.flow_style === "alternate" && dir && this._altPhase;
        pct.textContent = swap
          ? (dir === "charging" ? "▲" : "▼")
          : this._stateText(st, lvl, item, c, locale);
        pct.style.color = swap || (c.color_state && dir) ? flowColor(dir, c.colors) : "";
      }
      if (time) time.textContent = st ? relTime(st.last_changed, Date.now(), locale) : "";

      if (chev) {
        chev.icon = dir === "charging" ? "mdi:chevron-up"
          : dir === "discharging" ? "mdi:chevron-down" : "";
        chev.style.color = flowColor(dir, c.colors);
        chev.className = c.animate_flow && dir ? (dir === "charging" ? "up" : "down") : "";
        const scale = flow.rate?.trend ? c.trend_full_scale : c.flow_full_scale;
        chev.style.setProperty("--bl-dur", `${flowDuration(flow.rate?.value, scale)}s`);
      }

      const color = lvl === null
        ? "var(--disabled-text-color, #555)"
        : levelColor(lvl, c.colors, c.thresholds);
      const on = lvl === null ? 0 : filledSegments(lvl, c.segments);
      // Peak-Hold: Marke oberhalb des Balkens, die dem Höchstwert nachläuft
      let peakAt = -1;
      if (c.peak && lvl !== null) {
        const pk = peakStep(this._peak.get(item.entity), lvl, Date.now(), c.peak_hold * 1000);
        this._peak.set(item.entity, pk);
        const idx = filledSegments(pk.v, c.segments) - 1;
        if (idx >= on) peakAt = idx;        // nur zeigen, wenn sie über dem Balken steht
      }

      // gleiche Kopplung wie beim Pfeil: mehr Leistung, schnelleres Blinken
      const pulseDur = flow.rate?.value == null
        ? 1.1
        : flowDuration(flow.rate.value,
            flow.rate.trend ? c.trend_full_scale : c.flow_full_scale, 1.8, 0.35);
      const pulse = pulseIndex(c.animation, dir, on, c.segments);
      const wave = c.animation === "pulse" && dir && on > 0;
      const fill = c.animation === "fill" && dir && on > 0;
      // zusätzlich zur gewählten Animation die Spitze blinken lassen
      const blinkAt = pulse >= 0
        ? pulse
        : c.blink_tip && dir && on > 0 ? Math.min(c.segments - 1, on - 1) : -1;
      segs.forEach((s, i) => {
        // Segmente behalten immer ihre Stufenfarbe; die Richtung sagt der Wert und der Pfeil
        const col = lvl === null ? color : this._segColors?.[i] ?? color;
        const lit = i < on || i === pulse || i === peakAt;
        s.style.background = lit ? col : off;
        s.style.boxShadow = lit ? `0 0 5px ${col}` : "none";
        // Welle: läuft beim Laden von 0 zur Spitze, beim Entladen von der Spitze nach 0
        const inWave = wave && i < on;
        const inFill = fill && i < on;
        s.classList.toggle("blink", i === blinkAt && !inFill);
        s.classList.toggle("wave", inWave);
        s.classList.toggle("fill", inFill);
        if (inFill) {
          // dieselbe Regel je Segment; Entladen ist der Rücklauf davon. Die Spitze bekommt
          // das Blinken als zweite Animation dazu — die gewinnt dort über die Füllung.
          const two = i === blinkAt;
          s.style.animationName = two ? `${this._fill}-${i}, bl-pulse` : `${this._fill}-${i}`;
          s.style.animationDuration = two
            ? `${c.pulse_period}s, ${pulseDur}s`
            : `${c.pulse_period}s`;
          s.style.animationDirection = dir === "charging" ? "normal" : "reverse";
          s.style.animationDelay = "";
        } else if (inWave) {
          // wanderndes dunkles Segment, beim Laden nach rechts, beim Entladen nach links.
          // Der Versatz hängt nur an der Segmentnummer, nicht am Füllstand — sonst würde
          // die Animation bei jeder Wertänderung neu anfangen.
          const k = dir === "charging" ? i : c.segments - 1 - i;
          s.style.setProperty("--bl-col", col);
          s.style.setProperty("--bl-off", off);
          s.style.setProperty("--bl-dur", `${c.pulse_period}s`);
          s.style.animationDelay = `${(k * this._waveStep).toFixed(2)}s`;
        } else {
          s.style.animationDelay = "";
          s.style.animationName = "";
          s.style.animationDuration = "";
          if (i === blinkAt) s.style.setProperty("--bl-dur", `${pulseDur}s`);
        }
      });
    }
    this._fitAuto();
  }

  /** Prozent bei Batterien, sonst der Rohwert mit seiner Einheit. */
  _stateText(st, lvl, item, c, locale) {
    if (lvl === null) return "n/a";
    const digits = item.precision ?? c.precision;
    if (!this._generic) return `${formatValue(lvl, digits ?? 0, locale)}%`;
    const unit = st.attributes.unit_of_measurement;
    const v = formatValue(st.state, digits, locale);
    return unit ? `${v} ${unit}` : v;
  }

  /**
   * Erst die angegebenen Ladefluss-Sensoren, sonst der eigene Verlauf der Entität.
   * `rate.trend` merkt sich, welcher Maßstab fürs Tempo gilt.
   */
  _flow(item, lvl, c) {
    const flow = chargeFlow(item, this._hass.states, item.deadband ?? c.deadband);
    if (flow.dir || item.charging || item.power || item.charge || item.discharge)
      return { dir: flow.dir, rate: { value: flow.rate, trend: false } };
    if (!c.trend_flow || lvl === null) return { dir: null, rate: null };
    const next = trendStep(
      this._trend.get(item.entity), lvl, Date.now(), c.trend_hold * 1000,
      item.trend_deadband ?? c.trend_deadband,
    );
    this._trend.set(item.entity, next);
    return { dir: next.dir, rate: { value: next.rate, trend: true } };
  }

  connectedCallback() {
    this._nameSig = null;                     // nach dem Einhängen neu messen
    if (this._rows) this._fitAuto();
  }

  /**
   * Spalten mit Breite "auto" auf ihren längsten Text ziehen, damit alles bündig steht.
   * Erst wenn die Schrift geladen ist, sonst misst man die Fallback-Schrift und schneidet
   * hinterher ab. Messen geht nur im eingehängten Zustand — sonst ist scrollWidth 0;
   * schlägt es fehl, bleibt die Signatur leer und der nächste Durchlauf probiert erneut.
   */
  _fitAuto() {
    const c = this._config;
    const cols = [];
    if (c.show_name && normWidth(c.name_width) === "auto") cols.push("name");
    if (c.show_state && normWidth(c.state_width, DEFAULT_STATE_WIDTH) === "auto") cols.push("pct");
    if (!cols.length || !this._rows.length) return;
    const sig = cols
      .map((k) => k + this._rows.map((r) => r[k]?.textContent).join("|"))
      .join("#");
    if (sig === this._nameSig || this._fitPending) return;
    this._fitPending = true;
    (document.fonts?.ready ?? Promise.resolve()).then(() =>
      requestAnimationFrame(() => {
        this._fitPending = false;
        if (!this.isConnected || !this._rows) return;
        let ok = true;
        for (const k of cols) {
          const els = this._rows.map((r) => r[k]).filter(Boolean);
          els.forEach((el) => { el.style.flex = "0 0 auto"; });
          const widest = Math.max(0, ...els.map((el) => el.scrollWidth));
          if (!widest) { ok = false; continue; }
          // +1px gegen Sub-Pixel-Rundung. shrink=1: erst wenn die Zeile wirklich zu eng
          // wird, gibt die Spalte nach — eine feste Obergrenze setzt man als Breitenwert.
          els.forEach((el) => { el.style.flex = `0 1 ${Math.ceil(widest) + 1}px`; });
        }
        if (ok) this._nameSig = sig;
      }),
    );
  }

  getCardSize() {
    return 1 + Math.ceil((this._rows?.length ?? 3) / Math.max(1, this._config.columns) / 2);
  }

  static getConfigElement() {
    return document.createElement("battery-led-card-editor");
  }

  static getStubConfig(hass) {
    return { title: "Batterien", entities: autoEntities(hass).slice(0, 4) };
  }
}

// ---------------------------------------------------------------- GUI-Editor

const LABELS = {
  title: "Titel",
  entities: "Entitäten",
  segments: "Segmente pro Balken",
  columns: "Spalten",
  bar_height: "Höhe der Balken (px)",
  row_gap: "Abstand zwischen den Spalten (px)",
  name_width: "Breite der Beschriftung (auto, 30%, 120px …)",
  state_width: "Breite des Werts (auto, 3.2em, 60px …)",
  precision: "Nachkommastellen (leer = wie die Entität)",
  show_icon: "Symbol anzeigen",
  show_name: "Name anzeigen",
  show_state: "Prozentwert anzeigen",
  show_flow: "Ladefluss-Pfeil anzeigen",
  animate_flow: "Pfeil animieren",
  flow_style: "Wo die Richtung steht",
  animation: "Animation",
  pulse_travel: "Puls: Dauer eines Durchlaufs (s)",
  pulse_period: "Puls: Abstand zwischen Durchläufen (s)",
  pulse_width: "Puls: Breite (Segmente gleichzeitig aus)",
  blink_tip: "Spitze zusätzlich blinken lassen",
  peak: "Peak-Hold-Marke",
  peak_hold: "Peak halten (s)",
  color_state: "Wert in Richtungsfarbe",
  flow_full_scale: "Voller Ladefluss bei … (Tempo-Maßstab)",
  color_mode: "Färbung",
  preset: "Farbvoreinstellung (Rampe)",
  surface: "Gehäuse-Voreinstellung",
  min: "Minimum (= 0 %)",
  max: "Maximum (= 100 %)",
  trend_flow: "Pfeil aus dem eigenen Verlauf",
  trend_hold: "Pfeil halten (s)",
  trend_deadband: "Trend-Schwelle (% Änderung, darunter = Ruhe)",
  trend_history: "Verlauf beim Laden abfragen",
  trend_full_scale: "Volles Tempo bei … %/min",
  cap: "Pluspol anzeigen",
  cap_size: "Pluspol-Größe (px)",
  frame_width: "Rahmenstärke (px, 0 = kein Rahmen)",
  sort: "Niedrigster Stand zuerst",
  warn_below: "Warnung blinkt unter … % (0 = aus)",
  show_last_changed: "Letzte Änderung anzeigen",
  deadband: "Ladefluss-Schwelle (leer = Karten-Standard)",
  auto: "Batterien automatisch einsammeln",
  auto_area: "… nur aus diesen Bereichen",
  auto_exclude: "… diese ausschließen",
  rebuild_delay: "Umbau-Verzögerung (s)",
  items: "Gewählte Entitäten",
  entity: "Entität (leeren = entfernen)",
  add: "＋ Entität hinzufügen",
  thresholds: "Schwellen (%)",
  colors: "Farben (Theme)",
  colors_custom: "Farben — eigene Werte (Hex, rgb(), var(…))",
  critical: "Kritisch",
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  full: "Voll",
  off: "Aus (dunkle Segmente)",
  body: "Gehäuse (Hintergrund der Balken)",
  frame: "Rahmen & Pluspol",
  pos: "Richtung positiv (lädt / steigt)",
  neg: "Richtung negativ (entlädt / fällt)",
  name: "Anzeigename",
  icon: "Symbol (leer = Symbol der Entität)",
  charging: "Lade-Sensor (binary_sensor)",
  power: "Leistung vorzeichenbehaftet (+laden / −entladen)",
  charge: "Ladeleistung",
  discharge: "Entladeleistung",
};

// Was auf der Gauge-Karte anders heißt — dort gibt es keinen "Ladefluss", nur einen Trend.
const GENERIC_LABELS = {
  show_flow: "Trend-Pfeil anzeigen",
  animate_flow: "Trend-Pfeil animieren",
  items: "Gewählte Entitäten",
};

/** Beschriftung eines Feldes. `??` würde ein `false` durchlassen — daher explizit. */
export const labelFor = (schema, generic, labels = LABELS, generic_labels = GENERIC_LABELS) =>
  schema.label ?? (generic ? generic_labels[schema.name] : undefined)
  ?? labels[schema.name] ?? schema.name;

const num = (min, max, step = 1) => ({ number: { min, max, step, mode: "box" } });
const ent = (filter) => ({ entity: filter ? { filter } : {} });

// Ladefluss-Sensoren gibt es nur bei Batterien (Hausspeicher); die Gauge-Karte leitet ihren
// Pfeil aus dem Verlauf des Werts ab und braucht die Felder nicht.
const itemFields = (generic) =>
  generic
    ? [
        { name: "entity", selector: ent() },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { type: "grid", schema: [
          { name: "min", selector: num(-1000000, 1000000, 0.01) },
          { name: "max", selector: num(-1000000, 1000000, 0.01) },
          { name: "precision", selector: num(0, 5) },
          { name: "trend_deadband", selector: num(0, 100, 0.1) },
        ] },
      ]
    : [
        { name: "entity", selector: ent({ device_class: "battery" }) },
        { name: "name", selector: { text: {} } },
        { name: "icon", selector: { icon: {} } },
        { name: "precision", selector: num(0, 5) },
        { name: "charging", selector: ent({ domain: "binary_sensor" }) },
        { name: "power", selector: ent({ domain: "sensor" }) },
        { name: "charge", selector: ent({ domain: "sensor" }) },
        { name: "discharge", selector: ent({ domain: "sensor" }) },
        { name: "deadband", selector: num(0, 10000, 0.1) },
      ];

const BASE_SCHEMA = [{ name: "title", selector: { text: {} } }];

const tailSchema = (generic) => [
  {
    type: "grid",
    schema: [
      { name: "segments", selector: num(1, 40) },
      { name: "columns", selector: num(1, 6) },
      { name: "bar_height", selector: num(8, 80) },
      { name: "row_gap", selector: num(0, 40) },
      { name: "name_width", selector: { text: {} } },
      { name: "state_width", selector: { text: {} } },
      { name: "precision", selector: num(0, 5) },
      { name: "warn_below", selector: num(0, 100) },
      { name: "show_icon", selector: { boolean: {} } },
      { name: "show_name", selector: { boolean: {} } },
      { name: "show_state", selector: { boolean: {} } },
      { name: "show_flow", selector: { boolean: {} } },
      { name: "animate_flow", selector: { boolean: {} } },
      { name: "peak", selector: { boolean: {} } },
      { name: "peak_hold", selector: num(1, 86400, 1) },
      { name: "color_state", selector: { boolean: {} } },
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "none", label: "Aus" },
              { value: "blink", label: "Blinken — führendes Segment, bei Fluss" },
              { value: "blink_always", label: "Blinken — führendes Segment, immer" },
              { value: "pulse", label: "Puls — eine LED wandert in Flussrichtung aus" },
              { value: "fill", label: "Füllen — läuft von 0 zum Stand hoch, entladen rückwärts" },
            ],
          },
        },
      },
      { name: "pulse_travel", selector: num(0.2, 20, 0.1) },
      { name: "pulse_period", selector: num(1, 60, 0.5) },
      { name: "pulse_width", selector: num(1, 8, 0.5) },
      { name: "blink_tip", selector: { boolean: {} } },
      {
        name: "flow_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "arrow", label: "Eigene Spalte neben dem Balken" },
              { value: "alternate", label: "Abwechselnd mit dem Wert (spart Platz)" },
            ],
          },
        },
      },
      ...(generic ? [] : [{ name: "flow_full_scale", selector: num(1, 100000, 1) }]),
      ...(generic
        ? [
            { name: "min", selector: num(-1000000, 1000000, 0.01) },
            { name: "max", selector: num(-1000000, 1000000, 0.01) },
            { name: "trend_flow", selector: { boolean: {} } },
            { name: "trend_hold", selector: num(10, 86400, 10) },
            { name: "trend_deadband", selector: num(0, 100, 0.1) },
            { name: "trend_history", selector: { boolean: {} } },
            { name: "trend_full_scale", selector: num(0.01, 100000, 0.01) },
          ]
        : []),
      { name: "cap", selector: { boolean: {} } },
      { name: "cap_size", selector: num(1, 20) },
      { name: "frame_width", selector: num(0, 6) },
      { name: "sort", selector: { boolean: {} } },
      {
        name: "preset",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "standard", label: "Standard (tomato → limegreen)" },
              { value: "led-classic", label: "LED klassisch (rot → cyan)" },
              { value: "ampel", label: "Ampel (gedeckt)" },
              { value: "neon", label: "Neon" },
              { value: "mono", label: "Einfarbig (Theme-Primärfarbe)" },
              { value: "invers", label: "Invers — voll = rot" },
            ],
          },
        },
      },
      {
        name: "surface",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "classic", label: "Klassisch — schwarzes Gehäuse wie led.jpg" },
              { value: "glass", label: "Durchscheinend — für Glas-/Verlaufs-Themes" },
              { value: "flat", label: "Ohne Gehäuse — nur Segmente" },
            ],
          },
        },
      },
      {
        name: "color_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "level", label: "Ganzer Balken in der Farbe der Stufe" },
              { value: "segment", label: "Jedes Segment nach eigener Schwelle" },
            ],
          },
        },
      },
      { name: "show_last_changed", selector: { boolean: {} } },
      ...(generic ? [] : [{ name: "deadband", selector: num(0, 10000, 0.1) }]),
    ],
  },
  {
    type: "expandable",
    name: "thresholds",
    title: LABELS.thresholds,
    schema: ["critical", "low", "medium", "high"].map((name) => ({ name, selector: num(0, 100) })),
  },
  {
    type: "expandable",
    name: "colors",
    title: LABELS.colors,
    schema: COLOR_KEYS.map(([name]) => ({ name, selector: { ui_color: {} } })),
  },
];

// Zusätzlich ein eigener Block für alles, was der Theme-Wähler nicht kann (Hex, Alpha, var()).
const COLOR_KEYS = [
  ...LEVELS.map(([key, , def]) => [key, def]),
  ["off", OFF],
  ["body", BODY],
  ["frame", FRAME],
  ["pos", FLOW_DEFAULT.charging],
  ["neg", FLOW_DEFAULT.discharging],
];

/**
 * Ein aufklappbarer Block je Entität — Auswahl, Name und Ladefluss an einer Stelle —
 * plus ein leerer Block am Ende zum Anhängen.
 */
const itemsSchema = (entities, hass, generic) => {
  const fields = itemFields(generic);
  return {
    type: "expandable",
    name: "items",
    title: LABELS.items,
    schema: [
      ...entities.map((e, i) => ({
        type: "expandable",
        name: `e${i}`,
        title: e.name || hass?.states[e.entity]?.attributes?.friendly_name || e.entity,
        schema: fields,
      })),
      { type: "expandable", name: "new", title: LABELS.add, schema: fields },
    ],
  };
};

/** Formularwerte -> Config-Entities. Ohne Zusatzangaben bleibt es ein blanker String. */
export const buildEntities = (items = []) =>
  items
    .filter((it) => it?.entity)                 // Entität geleert = Zeile weg
    .map((it) => {
      const extra = Object.fromEntries(
        Object.entries(it).filter(([k, v]) => k !== "entity" && v !== "" && v != null),
      );
      if (typeof extra.name === "string") extra.name = extra.name.trim();
      if (!extra.name) delete extra.name;
      return Object.keys(extra).length ? { entity: it.entity, ...extra } : it.entity;
    });

class BatteryLedCardEditor extends Base {
  get _generic() {
    return this.localName === "led-gauge-card-editor";
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  async _render() {
    if (!this._form) {
      // erzwingt das Nachladen der HA-Formularelemente, falls noch nicht registriert
      if (!customElements.get("ha-form")) {
        const helpers = await window.loadCardHelpers();
        await helpers.createCardElement({ type: "entities", entities: [] })
          .constructor.getConfigElement();
      }
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => labelFor(s, this._generic);
      this._form.addEventListener("value-changed", (ev) => this._valueChanged(ev));
      const style = document.createElement("style");
      style.textContent = CSS;
      const ver = document.createElement("div");
      ver.className = "version";
      ver.textContent = `Battery LED Card v${VERSION}`;
      this.append(style, this._form, ...(this._generic ? [] : [this._buildTools()]),
        this._buildColors(), ver);
    }
    const items = (this._config.entities ?? []).map((e) => (typeof e === "string" ? { entity: e } : e));
    this._items = items;
    this._form.hass = this._hass;
    this._form.schema = [
      ...BASE_SCHEMA,
      itemsSchema(items, this._hass, this._generic),
      ...tailSchema(this._generic),
    ];
    this._form.data = {
      ...DEFAULTS,                            // sonst stehen ungesetzte Schalter im Editor auf aus
      trend_flow: this._generic,
      ...this._config,
      entities: undefined,
      items: { ...Object.fromEntries(items.map((it, i) => [`e${i}`, it])), new: {} },
    };
    this._fillColors();
  }

  /** Knopf statt Automatik: einmal einsammeln, danach ist die Liste ganz normal editierbar. */
  _buildTools() {
    const box = document.createElement("div");
    box.className = "tools";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Batterien einsammeln";
    btn.addEventListener("click", () => this._collect());
    this._hint = document.createElement("span");
    this._hint.className = "hint";
    box.append(btn, this._hint);
    return box;
  }

  _collect() {
    const have = (this._config.entities ?? []).map((e) => e.entity ?? e);
    const found = autoEntities(this._hass, { exclude: have });
    this._hint.textContent = found.length
      ? `${found.length} hinzugefügt`
      : "nichts Neues gefunden";
    if (!found.length) return;
    this._emit({ ...this._config, entities: [...(this._config.entities ?? []), ...found] });
  }

  /** Je Stufe: Farbwähler + Freitext (Hex mit/ohne Raute, CSS-Name, rgb(), var()). */
  _buildColors() {
    const box = document.createElement("details");
    box.className = "colorbox";
    box.innerHTML = `<summary>${LABELS.colors_custom}</summary>`;
    this._colorRows = COLOR_KEYS.map(([key, def]) => {
      const row = document.createElement("div");
      row.className = "crow";
      row.innerHTML = `<label></label><input type="color"><input type="text" spellcheck="false">`;
      row.querySelector("label").textContent = LABELS[key];
      const [sw, tx] = row.querySelectorAll("input");
      tx.placeholder = def;                   // leer = Default, Platzhalter zeigt welchen
      tx.title = "Hex (#2ed0d8 oder 2ed0d8), CSS-Name (tomato), rgb(…), rgba(…), var(--x)";
      if (def.startsWith("color-mix") || def.startsWith("var(")) tx.placeholder = "aus dem Theme";
      sw.addEventListener("input", () => {
        tx.value = sw.value;
        this._colorChanged(key, sw.value);
      });
      tx.addEventListener("change", () => {
        sw.value = resolveHex(toCss(tx.value) || def, def);
        this._colorChanged(key, tx.value);
      });
      box.appendChild(row);
      return { key, def, sw, tx };
    });
    return box;
  }

  _fillColors() {
    const preset = presetColors(this._config.preset, {}, this._config.surface ?? "classic");
    for (const { key, def: fallback, sw, tx } of this._colorRows ?? []) {
      const def = preset[key] ?? fallback;
      tx.placeholder = def;
      const v = this._config.colors?.[key];
      tx.value = v == null ? "" : Array.isArray(v) ? toCss(v) : String(v);
      sw.value = resolveHex(toCss(v ?? def), def);
    }
  }

  _colorChanged(key, value) {
    const colors = { ...(this._config.colors ?? {}) };
    if (String(value).trim()) colors[key] = String(value).trim();
    else delete colors[key];                  // leer = Default
    this._emit({ ...this._config, colors });
  }

  _valueChanged(ev) {
    const { items = {}, entities: _drop, ...data } = ev.detail.value;
    const list = this._items.map((_, i) => items[`e${i}`] ?? {});
    if (items.new?.entity) list.push(items.new);
    this._emit({
      ...data,
      colors: Object.fromEntries(
        Object.entries(data.colors ?? {}).filter(([, v]) => String(v ?? "").trim()),
      ),
      entities: buildEntities(list),
    });
  }

  _emit(config) {
    if (!config.title) delete config.title;
    if (!Object.keys(config.colors ?? {}).length) delete config.colors;
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
    );
  }
}

if (globalThis.customElements && !customElements.get("battery-led-card")) {
  console.info(
    `%c BATTERY-LED-CARD %c v${VERSION} `,
    "color:#111;background:#2ed0d8;font-weight:700;border-radius:3px 0 0 3px",
    "color:#2ed0d8;background:#111;border-radius:0 3px 3px 0",
  );
  customElements.define("battery-led-card", BatteryLedCard);
  customElements.define("battery-led-card-editor", BatteryLedCardEditor);
  customElements.define("led-gauge-card", class extends BatteryLedCard {
    static getConfigElement() {
      return document.createElement("led-gauge-card-editor");
    }
    static getStubConfig() {
      return { title: "Werte", entities: [] };
    }
  });
  customElements.define("led-gauge-card-editor", class extends BatteryLedCardEditor {});
  (window.customCards = window.customCards || []).push({
    type: "battery-led-card",
    name: "Battery LED Card",
    description: `Batteriestände als quer liegendes LED-Balkenpanel (v${VERSION})`,
    preview: true,
  });
  window.customCards.push({
    type: "led-gauge-card",
    name: "LED Gauge Card",
    description: `Beliebige Zahlenwerte als LED-Balkenpanel, mit min/max je Zeile (v${VERSION})`,
    preview: true,
  });
}
