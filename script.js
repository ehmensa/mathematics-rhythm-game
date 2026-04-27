(function () {
  const audio = document.getElementById("audio-player");
  const startBtn = document.getElementById("start-btn");
  const landingOverlay = document.getElementById("landing-overlay");
  const landingStartBtn = document.getElementById("landing-start-btn");
  const endOverlay = document.getElementById("end-overlay");
  const endFinalScoreEl = document.getElementById("end-final-score");
  const endCelebrationEl = document.getElementById("end-celebration");
  const endCelebrationLeadEl = document.getElementById("end-celebration-lead");
  const endPlayAgainBtn = document.getElementById("end-play-again-btn");
  const endStreamingLink = document.getElementById("end-streaming-link");
  const countdownOverlay = document.getElementById("countdown-overlay");
  const countdownDisplay = document.getElementById("countdown-display");
  const countdownInstructionEl = document.getElementById("countdown-instruction");
  const pauseBtn = document.getElementById("pause-btn");
  const stopBtn = document.getElementById("stop-btn");
  const currentTimeEl = document.getElementById("current-time");
  const songTimerEl = document.getElementById("song-timer");
  const songTimerArc = document.getElementById("song-timer-arc");
  const symbolRainCanvas = document.getElementById("symbol-rain-canvas");

  /** Matches `r` on `#song-timer-arc` in index.html (stroke circumference). */
  const TIMER_RING_R = 18.5;
  const TIMER_RING_C = 2 * Math.PI * TIMER_RING_R;
  const feedbackEl = document.getElementById("feedback");
  const scoreEl = document.getElementById("score-display");
  const lane = document.getElementById("lane");
  const hitLineEl = document.getElementById("hit-line");
  const hitTapZone = document.getElementById("hit-tap-zone");
  const notesLayer = document.getElementById("notes-layer");
  const appChromeEl = document.querySelector(".app-chrome");
  const DIFFICULTY_LEVELS = ["easy", "medium", "hard"];
  const DEFAULT_DIFFICULTY = "easy";
  const SYMBOL_SET = ["+", "−", "×", "÷", "=", "≈", "∑", "π", "∞", "√"];
  const SYMBOL_MIN = 72;
  const SYMBOL_MAX = 120;

  const symbolRainState = {
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    particles: [],
    rafId: 0,
    active: false,
    reducedMotion: false,
    lastTs: 0,
  };

  /** Last applied chart; radios on landing mirror this when opened. */
  let currentDifficulty = DEFAULT_DIFFICULTY;
  let loadingPlaybackPrep = false;
  /** After stop / end / reset-to-start, main Start opens welcome to pick difficulty. */
  let needsWelcomeBeforeTransportStart = false;

  function isValidDifficulty(s) {
    return DIFFICULTY_LEVELS.indexOf(s) !== -1;
  }

  function beatMapUrlForDifficulty(level) {
    const key = isValidDifficulty(level) ? level : DEFAULT_DIFFICULTY;
    return "assets/" + key + "-recorded-beat-map.json";
  }

  function getSelectedDifficulty() {
    const el = document.querySelector('input[name="difficulty"]:checked');
    if (el && isValidDifficulty(el.value)) {
      return el.value;
    }
    return currentDifficulty;
  }

  function syncDifficultyRadios(level) {
    const key = isValidDifficulty(level) ? level : DEFAULT_DIFFICULTY;
    const inputs = document.querySelectorAll('input[name="difficulty"]');
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].checked = inputs[i].value === key;
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function randomIn(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  function targetSymbolCount() {
    const area = window.innerWidth * window.innerHeight;
    const estimated = Math.round(area / 12000);
    return clamp(estimated, SYMBOL_MIN, SYMBOL_MAX);
  }

  function resetSymbolParticle(p, spawnAbove) {
    const w = symbolRainState.w || 1;
    const h = symbolRainState.h || 1;
    p.x = randomIn(0, w);
    p.y = spawnAbove ? randomIn(-h * 0.3, -20) : randomIn(0, h);
    p.vy = randomIn(36, 74);
    p.vx = randomIn(-14, 14);
    p.size = randomIn(16, 32);
    p.alphaMax = randomIn(0.3, 0.66);
    p.life = randomIn(8, 14);
    p.age = randomIn(0, p.life * 0.65);
    p.symbol = SYMBOL_SET[(Math.random() * SYMBOL_SET.length) | 0];
  }

  function ensureSymbolParticleCount() {
    const target = targetSymbolCount();
    while (symbolRainState.particles.length < target) {
      const p = {};
      resetSymbolParticle(p, false);
      symbolRainState.particles.push(p);
    }
    if (symbolRainState.particles.length > target) {
      symbolRainState.particles.length = target;
    }
  }

  function resizeSymbolRainCanvas() {
    if (!symbolRainCanvas || !symbolRainState.ctx) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    symbolRainState.dpr = dpr;
    symbolRainState.w = w;
    symbolRainState.h = h;
    symbolRainCanvas.width = Math.floor(w * dpr);
    symbolRainCanvas.height = Math.floor(h * dpr);
    symbolRainCanvas.style.width = w + "px";
    symbolRainCanvas.style.height = h + "px";
    symbolRainState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ensureSymbolParticleCount();
    if (symbolRainState.reducedMotion) {
      drawStaticSymbolRain();
    }
  }

  function drawSymbolRainFrame(ts) {
    if (!symbolRainState.active || !symbolRainState.ctx || !symbolRainCanvas) return;

    const ctx = symbolRainState.ctx;
    const w = symbolRainState.w;
    const h = symbolRainState.h;
    if (w <= 0 || h <= 0) return;

    if (!symbolRainState.lastTs) symbolRainState.lastTs = ts;
    const dt = clamp((ts - symbolRainState.lastTs) / 1000, 0, 0.05);
    symbolRainState.lastTs = ts;

    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245, 250, 255, 1)";

    const drift = Math.sin(ts * 0.00028) * 5.8;
    for (let i = 0; i < symbolRainState.particles.length; i++) {
      const p = symbolRainState.particles[i];
      p.age += dt;
      p.y += p.vy * dt;
      p.x += (p.vx + drift) * dt;

      if (p.y > h + 28 || p.age >= p.life || p.x < -24 || p.x > w + 24) {
        resetSymbolParticle(p, true);
      }

      const t = p.age / p.life;
      const fadeIn = clamp(t / 0.1, 0, 1);
      const fadeOut = clamp((1 - t) / 0.16, 0, 1);
      const a = Math.min(fadeIn, fadeOut) * p.alphaMax;
      if (a <= 0.002) continue;

      ctx.globalAlpha = a;
      ctx.font = "500 " + p.size.toFixed(1) + 'px "Tiro Devanagari Sanskrit", serif';
      ctx.fillText(p.symbol, p.x, p.y);
    }

    ctx.globalAlpha = 1;
    symbolRainState.rafId = requestAnimationFrame(drawSymbolRainFrame);
  }

  function drawStaticSymbolRain() {
    if (!symbolRainState.ctx || !symbolRainCanvas) return;
    const ctx = symbolRainState.ctx;
    const w = symbolRainState.w;
    const h = symbolRainState.h;
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245, 250, 255, 1)";
    for (let i = 0; i < symbolRainState.particles.length; i++) {
      const p = symbolRainState.particles[i];
      if (p.y < -20 || p.y > h + 20) continue;
      ctx.globalAlpha = 0.18;
      ctx.font = "500 " + p.size.toFixed(1) + 'px "Tiro Devanagari Sanskrit", serif';
      ctx.fillText(p.symbol, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function startSymbolRain() {
    if (!symbolRainCanvas || symbolRainState.reducedMotion || symbolRainState.active) return;
    symbolRainState.active = true;
    symbolRainState.lastTs = 0;
    symbolRainState.rafId = requestAnimationFrame(drawSymbolRainFrame);
  }

  function stopSymbolRain() {
    symbolRainState.active = false;
    if (symbolRainState.rafId) {
      cancelAnimationFrame(symbolRainState.rafId);
      symbolRainState.rafId = 0;
    }
  }

  function initSymbolRain() {
    if (!symbolRainCanvas) return;
    const ctx = symbolRainCanvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    symbolRainState.ctx = ctx;
    symbolRainState.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resizeSymbolRainCanvas();
    if (!symbolRainState.reducedMotion) {
      startSymbolRain();
    } else {
      drawStaticSymbolRain();
    }
  }


  /** Used only if fetch fails (e.g. opened as file://). Replace via JSON in normal use. */
  const FALLBACK_BEAT_MAP = [
    { time: 0.5 },
    { time: 1.0 },
    { time: 1.5 },
    { time: 2.0 },
    { time: 2.5 },
    { time: 3.0 },
    { time: 3.5 },
    { time: 4.0 },
    { time: 4.5 },
    { time: 5.0 },
    { time: 5.5 },
    { time: 6.0 },
  ];

  /**
   * Full chart (times only), rebuilt on load / reset. Not mutated when notes are removed during play.
   */
  let scheduledNotes = [];

  /**
   * Active notes: { time, el, exiting }.
   * `exiting` freezes JS-driven lane position while CSS handles hit/miss exit; timing still uses audio.currentTime only.
   */
  let activeNotes = [];

  /** Seconds before hit that a note is visible; movement is derived from note.time - audio.currentTime. */
  const NOTE_APPROACH_SEC = 1.5;

  /**
   * After the beat (delta < 0), opacity / glow shrink over this window while the note keeps falling.
   * Keeps motion kinetic; sync feel with `.note--hit-exit` / miss if you change duration.
   */
  const NOTE_POST_LINE_FADE_SEC = 0.22;

  /**
   * Judgment line at ~82% from top of lane; note centers align here at delta 0.
   * Keep in sync with `.hit-tap-zone`, `.hit-line`, and `--hit-line-from-top` in styles.css.
   */
  const HIT_LINE_FROM_TOP_PCT = 82;

  /**
   * Trapezoid lane insets (% of lane width). Must match --lane-trap-* in styles.css clip-path.
   */
  const LANE_TRAP_TOP_INSET_PCT = 30;
  const LANE_TRAP_BOTTOM_INSET_PCT = 0;

  const PERFECT_MAX = 0.05;
  const GOOD_MAX = 0.12;

  /** Keep in sync with `handleTap` — max possible run score = this × note count (all Perfect). */
  const SCORE_PERFECT = 100;
  const SCORE_GOOD = 50;

  /** Subtracted on each miss (late tap, stray tap, or note passed); score never below 0. */
  const MISS_PENALTY = 10;

  /** Stray taps farther than this from any unresolved note count as Miss with no note removed. */
  const TAP_BIND_MAX = 0.5;

  /** "What's next?" card at this playback time (1:38). Same for all difficulties; song keeps playing until EOF. */
  const END_CARD_AT_SEC = 60 + 38;

  /** Keep in sync with `--hit-line-hit-pulse-ms` / `--hit-line-miss-pulse-ms` in styles.css */
  const HIT_LINE_HIT_ANIM_MS = 340;
  const HIT_LINE_MISS_ANIM_MS = 260;

  /** Milliseconds per count for 3 → 2 → 1, then Yɛnkɔ beat before exit animation. */
  const COUNTDOWN_BEAT_MS = 964;

  /** Keep in sync with `countdownGoOut` keyframes in styles.css (fallback if no animationend). */
  const COUNTDOWN_GO_OUT_MS = 320;

  /** Web Audio context for short count-in ticks (separate from main `audio` element). */
  let countdownClickCtx = null;

  function resumeCountdownAudioIfNeeded() {
    const ctx = countdownClickCtx;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  /**
   * Short soft sine click on each count-in beat (no external asset).
   * @param {number} freqHz
   */
  function playCountdownTickSound(freqHz) {
    try {
      if (!countdownClickCtx) {
        countdownClickCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      resumeCountdownAudioIfNeeded();
      const ctx = countdownClickCtx;
      const t0 = ctx.currentTime;
      const dur = 0.075;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqHz, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) {
      /* Web Audio unavailable */
    }
  }

  function playCountdownBeatForDigit(digit) {
    const freqs = { 3: 392, 2: 466.16, 1: 523.25 };
    const f = freqs[digit] || 440;
    playCountdownTickSound(f);
  }

  /**
   * Final count-in tone: same pitch family as ticks but held ~one full beat so it
   * lasts alongside “Yɛnkɔ!” (see `COUNTDOWN_BEAT_MS` + `scheduleCountdownStep`).
   */
  function playCountdownGoSound() {
    try {
      if (!countdownClickCtx) {
        countdownClickCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      resumeCountdownAudioIfNeeded();
      const ctx = countdownClickCtx;
      const t0 = ctx.currentTime;
      const totalSec = COUNTDOWN_BEAT_MS / 1000;
      const releaseSec = 0.24;
      const holdEnd = t0 + Math.max(0.35, totalSec - releaseSec);
      const peak = 0.088;
      const sustain = 0.048;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(sustain, t0 + 0.11);
      g.gain.setValueAtTime(sustain, holdEnd);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + totalSec);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + totalSec + 0.04);
    } catch (err) {
      /* Web Audio unavailable */
    }
  }

  let countdownActive = false;
  let countdownTimeoutId = 0;
  let countdownStartRafId = 0;
  let countdownGoOutEndHandler = null;

  /** Hit exit duration — keep in sync with `.note.note--hit-exit` animation in CSS. */
  const NOTE_HIT_EXIT_MS = 220;
  /** Miss exit — sync with `.note.note--miss-exit` animation in CSS. */
  const NOTE_MISS_EXIT_MS = 240;

  /** Keep in sync with score/timer/chrome pulse keyframes and `--hud-score-pulse-ms` in styles.css (timer + transport pulse with score only). */
  const SCORE_HUD_PULSE_MS = 400;

  /** Lane runway bounce — keep in sync with `.lane.lane--react-*` animation duration in styles.css */
  const LANE_REACTION_MS = 480;

  let hitLineHitAnimTimer = 0;
  let hitLineMissAnimTimer = 0;

  let score = 0;
  /** Last value written to the HUD; used to pulse on real score changes only. */
  let lastHudScore = 0;
  let scoreHudPulseTimer = 0;
  let songTimerHudPulseTimer = 0;
  let chromeHudPulseTimer = 0;
  let laneReactionTimer = 0;

  /**
   * After a full-run end (time mark or natural `ended`), skip duplicate handling.
   * Reset when starting a new run, seeking, or stopping.
   */
  let fullRunEndHandled = false;

  /** Shown during count-in digits 3–2–1 (same idea as former on-screen hint). */
  const COUNTDOWN_INSTRUCTION_TEXT =
    "Tap your screen or spacebar when a note hits the line";

  /**
   * Parse beat map JSON (e.g. assets/recorded-beat-map.json). Supports:
   * - { "offsetSec": number, "bpm"?: number, "notes": [ { "time": 1.2 }, ... ] }
   * - [ 1.0, 1.5, ... ]
   * - [ { "time": 1.0 }, ... ]
   */
  function normalizeBeatMapData(raw) {
    let offsetSec = 0;
    let list;

    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === "object") {
      offsetSec = Number(raw.offsetSec);
      if (!Number.isFinite(offsetSec)) offsetSec = 0;
      list = raw.notes;
      if (!Array.isArray(list)) list = [];
    } else {
      list = [];
    }

    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const t =
        typeof item === "number"
          ? item
          : item && typeof item.time === "number"
            ? item.time
            : NaN;
      if (!Number.isFinite(t)) continue;
      out.push({ time: t + offsetSec });
    }

    out.sort(function (a, b) {
      return a.time - b.time;
    });
    return out;
  }

  /**
   * Optional root `bpm` (visual grid only). Returns normalized notes + explicit BPM if valid.
   */
  function parseBeatMapPayload(raw) {
    const notes = normalizeBeatMapData(raw);
    let explicitBpm;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const b = Number(raw.bpm);
      if (Number.isFinite(b) && b > 0) {
        explicitBpm = b;
      }
    }
    return { notes: notes, explicitBpm: explicitBpm };
  }

  /**
   * Rough BPM from note spacing when JSON omits `bpm`. Best-effort; syncopation can skew.
   */
  function estimateBpmFromNotes(noteList) {
    if (!noteList || noteList.length < 2) {
      return null;
    }
    const times = noteList
      .map(function (n) {
        return n.time;
      })
      .sort(function (a, b) {
        return a - b;
      });
    const iois = [];
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1];
      if (d >= 0.04) {
        iois.push(d);
      }
    }
    if (iois.length === 0) {
      return null;
    }
    iois.sort(function (a, b) {
      return a - b;
    });
    const med = iois[Math.floor(iois.length / 2)];
    let bpm = 60 / med;
    while (bpm > 220) {
      bpm /= 2;
    }
    while (bpm < 40) {
      bpm *= 2;
    }
    if (bpm < 40 || bpm > 220) {
      return null;
    }
    return bpm;
  }

  function resolveGridBpm(explicitBpm, noteList) {
    if (Number.isFinite(explicitBpm) && explicitBpm > 0) {
      return explicitBpm;
    }
    const est = estimateBpmFromNotes(noteList);
    if (est !== null) {
      return est;
    }
    return 120;
  }

  /**
   * Visual grid density vs chart BPM. Easy = one stripe per beat; medium/hard double the
   * line count (half-beat spacing) when charts feel like double-time.
   */
  function gridBpmMultiplierForDifficulty(difficultyKey) {
    if (difficultyKey === "medium" || difficultyKey === "hard") {
      return 2;
    }
    return 1;
  }

  function syncLaneGridDensityClass(multiplier) {
    if (!lane) return;
    lane.classList.toggle("lane--dense-grid", multiplier >= 2);
  }

  /** Horizontal grid stripe spacing: one beat in lane % (same mapping as note approach). */
  function applyLaneGridBpm(bpm) {
    if (!lane || !Number.isFinite(bpm) || bpm <= 0) {
      return;
    }
    const beatSec = 60 / bpm;
    const rowStepPct =
      (beatSec / NOTE_APPROACH_SEC) * HIT_LINE_FROM_TOP_PCT;
    const clamped = Math.min(100, Math.max(4, rowStepPct));
    lane.style.setProperty("--lane-grid-row-pct", clamped.toFixed(2) + "%");
  }

  async function loadBeatMapFromJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    const raw = await response.json();
    return parseBeatMapPayload(raw);
  }

  async function applyDifficultyBeatMap(difficulty) {
    const url = beatMapUrlForDifficulty(difficulty);
    let payload;
    try {
      payload = await loadBeatMapFromJson(url);
    } catch (err) {
      console.warn(
        "[beat map] Could not load",
        url,
        "— using embedded fallback. Serve the folder over HTTP (e.g. Live Preview).",
        err
      );
      payload = parseBeatMapPayload(FALLBACK_BEAT_MAP);
    }
    const notes = payload.notes;
    if (notes.length === 0) {
      console.warn("[beat map] No notes in", url);
    }
    applyBeatMap(notes);
    const difficultyKey = isValidDifficulty(difficulty) ? difficulty : DEFAULT_DIFFICULTY;
    const baseGridBpm = resolveGridBpm(payload.explicitBpm, notes);
    const gridMult = gridBpmMultiplierForDifficulty(difficultyKey);
    applyLaneGridBpm(baseGridBpm * gridMult);
    syncLaneGridDensityClass(gridMult);
    currentDifficulty = difficultyKey;
    console.log(
      "[beat map]",
      currentDifficulty,
      notes.length,
      "notes;",
      "grid BPM",
      Math.round(baseGridBpm * 100) / 100,
      "×",
      gridMult,
      "→",
      Math.round(baseGridBpm * gridMult * 100) / 100
    );
  }

  function rebuildActiveNotesFromSchedule() {
    notesLayer.replaceChildren();
    activeNotes = [];
    for (let i = 0; i < scheduledNotes.length; i++) {
      const time = scheduledNotes[i].time;
      const el = document.createElement("div");
      el.className = "note";
      el.setAttribute("data-note-time", String(time));
      notesLayer.appendChild(el);
      activeNotes.push({ time: time, el: el, exiting: false });
    }
  }

  function applyBeatMap(notes) {
    scheduledNotes = notes;
    rebuildActiveNotesFromSchedule();
  }

  /**
   * Lane Y from delta = note.time - audio.currentTime.
   * After the beat (delta < 0), keep moving downward at the same speed as the approach phase
   * (no freeze at the line). Hide if the orb would leave the lane.
   */
  function laneTopPctForNote(delta) {
    if (delta > NOTE_APPROACH_SEC) {
      return null;
    }
    if (delta > 0) {
      return (1 - delta / NOTE_APPROACH_SEC) * HIT_LINE_FROM_TOP_PCT;
    }
    const speed = HIT_LINE_FROM_TOP_PCT / NOTE_APPROACH_SEC;
    const topPct = HIT_LINE_FROM_TOP_PCT + -delta * speed;
    if (topPct > 100) {
      return null;
    }
    return topPct;
  }

  /**
   * Horizontal center of the trapezoid at a given height (topPct = % from lane top).
   * Keeps notes on the lane's axis of symmetry; timing uses top only (unchanged).
   */
  function trapezoidCenterLeftPct(topPct) {
    const y = Math.min(100, Math.max(0, topPct)) / 100;
    const xLeft =
      LANE_TRAP_TOP_INSET_PCT +
      (LANE_TRAP_BOTTOM_INSET_PCT - LANE_TRAP_TOP_INSET_PCT) * y;
    const xRight =
      100 -
      LANE_TRAP_TOP_INSET_PCT +
      (LANE_TRAP_TOP_INSET_PCT - LANE_TRAP_BOTTOM_INSET_PCT) * y;
    return (xLeft + xRight) / 2;
  }

  /** Visual-only scale from delta = note.time − audio.currentTime (does not affect hit timing). */
  const NOTE_SCALE_FAR = 0.6;
  const NOTE_SCALE_NEAR = 1.2;

  function noteVisualScaleForDelta(delta) {
    if (delta > NOTE_APPROACH_SEC) {
      return NOTE_SCALE_FAR;
    }
    if (delta > 0) {
      const u = 1 - delta / NOTE_APPROACH_SEC;
      const smooth = u * u * (3 - 2 * u);
      return NOTE_SCALE_FAR + (NOTE_SCALE_NEAR - NOTE_SCALE_FAR) * smooth;
    }
    const fade = Math.max(0, 1 - (-delta) / NOTE_POST_LINE_FADE_SEC);
    return NOTE_SCALE_NEAR * (0.86 + 0.14 * fade);
  }

  /** Visual-only opacity (far faint → near full). */
  const NOTE_OPACITY_FAR = 0.5;
  const NOTE_OPACITY_NEAR = 1;

  function noteVisualOpacityForDelta(delta) {
    if (delta > NOTE_APPROACH_SEC) {
      return NOTE_OPACITY_FAR;
    }
    if (delta > 0) {
      const u = 1 - delta / NOTE_APPROACH_SEC;
      const smooth = u * u * (3 - 2 * u);
      return NOTE_OPACITY_FAR + (NOTE_OPACITY_NEAR - NOTE_OPACITY_FAR) * smooth;
    }
    const fade = Math.max(0, 1 - (-delta) / NOTE_POST_LINE_FADE_SEC);
    return NOTE_OPACITY_NEAR * fade;
  }

  /** 0 = far / muted, 1 = at hit line; drives glow + saturation in CSS (visual only). */
  function noteVisualEmphasisForDelta(delta) {
    if (delta > NOTE_APPROACH_SEC) {
      return 0;
    }
    if (delta > 0) {
      const u = 1 - delta / NOTE_APPROACH_SEC;
      return u * u * (3 - 2 * u);
    }
    return Math.max(0, 1 - (-delta) / NOTE_POST_LINE_FADE_SEC);
  }

  function removeEntry(entry) {
    const idx = activeNotes.indexOf(entry);
    if (idx === -1) return;
    entry.el.remove();
    activeNotes.splice(idx, 1);
  }

  /**
   * Play CSS exit on the note, then remove from active list. Does not change schedule / chart timing.
   */
  function beginNoteExit(entry, className, durationMs) {
    if (!entry || entry.exiting) return;
    entry.exiting = true;
    entry.el.classList.add(className);
    window.setTimeout(function () {
      removeEntry(entry);
    }, durationMs);
  }

  /**
   * @param {"perfect"|"good"} [laneKind] — drives runway bounce; omit to skip lane reaction.
   */
  function triggerHitLineHit(laneKind) {
    if (hitLineEl) {
      hitLineEl.classList.remove("hit-line--miss");
      hitLineEl.classList.remove("hit-line--hit");
      void hitLineEl.offsetWidth;
      hitLineEl.classList.add("hit-line--hit");
      window.clearTimeout(hitLineHitAnimTimer);
      hitLineHitAnimTimer = window.setTimeout(function () {
        hitLineEl.classList.remove("hit-line--hit");
      }, HIT_LINE_HIT_ANIM_MS);
    }
    if (laneKind === "perfect" || laneKind === "good") {
      pulseLaneReaction(laneKind);
    }
  }

  function triggerHitLineMiss() {
    if (hitLineEl) {
      hitLineEl.classList.remove("hit-line--hit");
      hitLineEl.classList.remove("hit-line--miss");
      void hitLineEl.offsetWidth;
      hitLineEl.classList.add("hit-line--miss");
      window.clearTimeout(hitLineMissAnimTimer);
      hitLineMissAnimTimer = window.setTimeout(function () {
        hitLineEl.classList.remove("hit-line--miss");
      }, HIT_LINE_MISS_ANIM_MS);
    }
    pulseLaneReaction("miss");
  }

  /** Bounce the note runway (`#lane`) on Perfect / Good / Miss. */
  function pulseLaneReaction(kind) {
    if (!lane) return;
    window.clearTimeout(laneReactionTimer);
    lane.classList.remove("lane--react-perfect", "lane--react-good", "lane--react-miss");
    void lane.offsetWidth;
    if (kind === "perfect") {
      lane.classList.add("lane--react-perfect");
    } else if (kind === "good") {
      lane.classList.add("lane--react-good");
    } else {
      lane.classList.add("lane--react-miss");
    }
    laneReactionTimer = window.setTimeout(function () {
      laneReactionTimer = 0;
      if (!lane) return;
      lane.classList.remove("lane--react-perfect", "lane--react-good", "lane--react-miss");
    }, LANE_REACTION_MS);
  }

  function pulseScoreHud(direction) {
    if (!scoreEl) return;
    window.clearTimeout(scoreHudPulseTimer);
    scoreEl.classList.remove("hud-overlay__value--score-up", "hud-overlay__value--score-down");
    void scoreEl.offsetWidth;
    scoreEl.classList.add(
      direction === "up" ? "hud-overlay__value--score-up" : "hud-overlay__value--score-down"
    );
    scoreHudPulseTimer = window.setTimeout(function () {
      scoreHudPulseTimer = 0;
      if (!scoreEl) return;
      scoreEl.classList.remove("hud-overlay__value--score-up", "hud-overlay__value--score-down");
    }, SCORE_HUD_PULSE_MS);
  }

  function pulseSongTimerHud(direction) {
    if (!songTimerEl) return;
    window.clearTimeout(songTimerHudPulseTimer);
    songTimerEl.classList.remove("song-timer--pulse-up", "song-timer--pulse-down");
    void songTimerEl.offsetWidth;
    songTimerEl.classList.add(
      direction === "up" ? "song-timer--pulse-up" : "song-timer--pulse-down"
    );
    songTimerHudPulseTimer = window.setTimeout(function () {
      songTimerHudPulseTimer = 0;
      if (!songTimerEl) return;
      songTimerEl.classList.remove("song-timer--pulse-up", "song-timer--pulse-down");
    }, SCORE_HUD_PULSE_MS);
  }

  function pulseChromeHud(direction) {
    if (!appChromeEl) return;
    window.clearTimeout(chromeHudPulseTimer);
    appChromeEl.classList.remove("app-chrome--pulse-up", "app-chrome--pulse-down");
    void appChromeEl.offsetWidth;
    appChromeEl.classList.add(
      direction === "up" ? "app-chrome--pulse-up" : "app-chrome--pulse-down"
    );
    chromeHudPulseTimer = window.setTimeout(function () {
      chromeHudPulseTimer = 0;
      if (!appChromeEl) return;
      appChromeEl.classList.remove("app-chrome--pulse-up", "app-chrome--pulse-down");
    }, SCORE_HUD_PULSE_MS);
  }

  /**
   * @param {{ silent?: boolean }} [opts] — silent: no pulse (e.g. run reset to 0).
   */
  function syncScoreDisplay(opts) {
    opts = opts || {};
    const prev = lastHudScore;
    if (scoreEl) {
      scoreEl.textContent = String(score);
      if (!opts.silent && prev !== score) {
        if (score > prev) {
          pulseScoreHud("up");
          pulseSongTimerHud("up");
          pulseChromeHud("up");
        } else if (score < prev) {
          pulseScoreHud("down");
          pulseSongTimerHud("down");
          pulseChromeHud("down");
        }
      }
    }
    lastHudScore = score;
  }

  function applyMissPenalty() {
    score = Math.max(0, score - MISS_PENALTY);
    syncScoreDisplay();
  }

  function feedbackClassForLabel(label) {
    const key = String(label).toLowerCase();
    if (key.startsWith("perfect")) return "feedback--perfect";
    if (key.startsWith("good")) return "feedback--good";
    return "feedback--miss";
  }

  function showFeedback(label) {
    feedbackEl.textContent = label;
    feedbackEl.className = "feedback " + feedbackClassForLabel(label);
    feedbackEl.classList.remove("feedback--show");
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add("feedback--show");
  }

  function clearFeedback() {
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
  }

  /** Song position for UI: whole seconds as `m:ss` (e.g. 1:05). */
  function formatSongTime(sec) {
    if (!Number.isFinite(sec)) return "—";
    const s = Math.max(0, Math.floor(sec + 1e-9));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function updateSongTimerDisplay() {
    const t = audio.currentTime;
    const d = audio.duration;
    const tOk = Number.isFinite(t);
    const dOk = Number.isFinite(d) && d > 0;

    if (currentTimeEl) {
      currentTimeEl.textContent = tOk ? formatSongTime(t) : "—";
    }

    if (songTimerArc) {
      if (!dOk) {
        songTimerArc.style.strokeDashoffset = String(TIMER_RING_C);
      } else {
        const u = Math.min(1, Math.max(0, t / d));
        songTimerArc.style.strokeDashoffset = String(TIMER_RING_C * (1 - u));
      }
    }

    if (songTimerEl) {
      if (dOk) {
        songTimerEl.setAttribute(
          "aria-label",
          "Elapsed " + formatSongTime(t) + " of " + formatSongTime(d)
        );
      } else {
        songTimerEl.setAttribute(
          "aria-label",
          "Song timer" + (tOk ? ", " + formatSongTime(t) + " elapsed" : ", duration not loaded")
        );
      }
    }
  }

  /** Icon stays pause bars; label reflects action for screen readers. */
  function syncPauseButtonLabel() {
    if (!pauseBtn) return;
    if (!audio.paused) {
      pauseBtn.setAttribute("aria-label", "Pause");
      return;
    }
    const t = audio.currentTime;
    const atSongStart = !Number.isFinite(t) || t < 0.05;
    pauseBtn.setAttribute("aria-label", atSongStart ? "Play" : "Resume");
  }

  function expireMissedNotes() {
    const t = audio.currentTime;
    if (!Number.isFinite(t)) return;

    let missedAny = false;
    for (let i = activeNotes.length - 1; i >= 0; i--) {
      const entry = activeNotes[i];
      if (entry.exiting) continue;
      if (t > entry.time + GOOD_MAX) {
        beginNoteExit(entry, "note--miss-exit", NOTE_MISS_EXIT_MS);
        applyMissPenalty();
        missedAny = true;
      }
    }
    if (missedAny) {
      showFeedback("Missed");
      triggerHitLineMiss();
    }
  }

  function updateNotes() {
    const t = audio.currentTime;
    if (!Number.isFinite(t)) return;

    for (let i = 0; i < activeNotes.length; i++) {
      const entry = activeNotes[i];
      const el = entry.el;
      if (entry.exiting) continue;

      const delta = entry.time - t;
      const topPct = laneTopPctForNote(delta);

      if (topPct === null) {
        el.style.display = "none";
        continue;
      }

      el.style.display = "block";
      el.style.top = topPct + "%";
      el.style.left = trapezoidCenterLeftPct(topPct) + "%";
      el.style.right = "auto";
      const scale = noteVisualScaleForDelta(delta);
      el.style.transform =
        "translate(-50%, -50%) scale(" + scale.toFixed(4) + ")";
      el.style.opacity = String(noteVisualOpacityForDelta(delta));
      const emph = noteVisualEmphasisForDelta(delta);
      el.style.setProperty("--note-emphasis", emph.toFixed(4));
      const sat = 0.78 + 0.62 * emph;
      const br = 0.9 + 0.24 * emph;
      el.style.filter =
        "saturate(" + sat.toFixed(3) + ") brightness(" + br.toFixed(3) + ")";
    }
  }

  function findClosestActiveNoteIndex() {
    const t = audio.currentTime;
    if (!Number.isFinite(t)) return -1;

    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < activeNotes.length; i++) {
      if (activeNotes[i].exiting) continue;
      const diff = Math.abs(activeNotes[i].time - t);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  function handleTap() {
    if (fullRunEndHandled) return;
    if (audio.paused || activeNotes.length === 0) return;

    const t = audio.currentTime;
    if (!Number.isFinite(t)) return;

    const idx = findClosestActiveNoteIndex();
    if (idx === -1) {
      applyMissPenalty();
      showFeedback("Missed");
      triggerHitLineMiss();
      return;
    }

    const entry = activeNotes[idx];
    const diff = Math.abs(entry.time - t);

    if (diff > TAP_BIND_MAX) {
      applyMissPenalty();
      showFeedback("Missed");
      triggerHitLineMiss();
      return;
    }

    if (diff <= PERFECT_MAX) {
      score += 100;
      beginNoteExit(entry, "note--hit-exit", NOTE_HIT_EXIT_MS);
      triggerHitLineHit("perfect");
      syncScoreDisplay();
      showFeedback("Perfect!");
      return;
    }

    if (diff <= GOOD_MAX) {
      score += SCORE_GOOD;
      beginNoteExit(entry, "note--hit-exit", NOTE_HIT_EXIT_MS);
      triggerHitLineHit("good");
      syncScoreDisplay();
      showFeedback("Good");
      return;
    }

    applyMissPenalty();
    beginNoteExit(entry, "note--miss-exit", NOTE_MISS_EXIT_MS);
    triggerHitLineMiss();
    showFeedback("Missed");
  }

  function releaseFocusFromControls() {
    requestAnimationFrame(function () {
      startBtn.blur();
      pauseBtn.blur();
      stopBtn.blur();
      try {
        lane.focus({ preventScroll: true });
      } catch (err) {
        lane.focus();
      }
    });
  }

  /** After dismissing a full-screen overlay without starting, point keyboard at the main play control. */
  function focusMainPlayButton() {
    if (!startBtn) return;
    requestAnimationFrame(function () {
      try {
        startBtn.focus({ preventScroll: true });
      } catch (err) {
        startBtn.focus();
      }
    });
  }

  function showCountdownInstruction() {
    if (countdownInstructionEl) {
      countdownInstructionEl.hidden = false;
      countdownInstructionEl.removeAttribute("aria-hidden");
    }
  }

  function hideCountdownInstruction() {
    if (countdownInstructionEl) {
      countdownInstructionEl.hidden = true;
      countdownInstructionEl.setAttribute("aria-hidden", "true");
    }
  }

  function hideCountdown() {
    if (countdownOverlay) countdownOverlay.hidden = true;
    showCountdownInstruction();
    if (countdownDisplay) {
      countdownDisplay.textContent = "";
      countdownDisplay.classList.remove("countdown-display--tick");
      countdownDisplay.classList.remove("countdown-display--go");
      countdownDisplay.classList.remove("countdown-display--go-out");
    }
  }

  function abortCountdownGoOut() {
    if (countdownGoOutEndHandler && countdownDisplay) {
      countdownDisplay.removeEventListener(
        "animationend",
        countdownGoOutEndHandler
      );
      countdownGoOutEndHandler = null;
    }
    if (countdownDisplay) {
      countdownDisplay.classList.remove("countdown-display--go-out");
    }
  }

  function cancelCountdown() {
    if (!countdownActive) return;
    countdownActive = false;
    window.clearTimeout(countdownTimeoutId);
    countdownTimeoutId = 0;
    if (countdownStartRafId) {
      cancelAnimationFrame(countdownStartRafId);
      countdownStartRafId = 0;
    }
    abortCountdownGoOut();
    hideCountdown();
  }

  function showCountdownBeat(digit) {
    if (!countdownOverlay || !countdownDisplay) return;
    playCountdownBeatForDigit(digit);
    countdownOverlay.hidden = false;
    showCountdownInstruction();
    countdownDisplay.textContent = String(digit);
    countdownDisplay.classList.remove("countdown-display--tick");
    countdownDisplay.classList.remove("countdown-display--go");
    countdownDisplay.classList.remove("countdown-display--go-out");
    void countdownDisplay.offsetWidth;
    countdownDisplay.classList.add("countdown-display--tick");
  }

  /** Final beat after “1” before playback (was blank / lane-only). */
  function showCountdownGoPhrase() {
    if (!countdownOverlay || !countdownDisplay) return;
    playCountdownGoSound();
    countdownOverlay.hidden = false;
    hideCountdownInstruction();
    countdownDisplay.textContent = "Yɛnkɔ!";
    countdownDisplay.classList.remove("countdown-display--tick");
    countdownDisplay.classList.remove("countdown-display--go");
    countdownDisplay.classList.remove("countdown-display--go-out");
    void countdownDisplay.offsetWidth;
    countdownDisplay.classList.add("countdown-display--go");
    countdownDisplay.classList.add("countdown-display--tick");
  }

  function finishCountdownAfterGoOut() {
    abortCountdownGoOut();
    window.clearTimeout(countdownTimeoutId);
    countdownTimeoutId = 0;
    if (!countdownActive) {
      hideCountdown();
      return;
    }
    countdownActive = false;
    hideCountdown();
    fullRunEndHandled = false;
    audio.currentTime = 0;
    audio.play().catch(function () {});
    releaseFocusFromControls();
  }

  function beginCountdownGoExit() {
    if (!countdownActive || !countdownDisplay) return;
    countdownTimeoutId = 0;
    countdownDisplay.classList.remove("countdown-display--tick");
    void countdownDisplay.offsetWidth;
    let completed = false;
    function complete() {
      if (completed) return;
      completed = true;
      window.clearTimeout(countdownTimeoutId);
      countdownTimeoutId = 0;
      finishCountdownAfterGoOut();
    }
    countdownGoOutEndHandler = function (ev) {
      if (ev.target !== countdownDisplay) return;
      if (ev.animationName !== "countdownGoOut") return;
      countdownDisplay.removeEventListener(
        "animationend",
        countdownGoOutEndHandler
      );
      countdownGoOutEndHandler = null;
      complete();
    };
    countdownDisplay.addEventListener(
      "animationend",
      countdownGoOutEndHandler
    );
    countdownTimeoutId = window.setTimeout(function () {
      countdownTimeoutId = 0;
      if (countdownGoOutEndHandler && countdownDisplay) {
        countdownDisplay.removeEventListener(
          "animationend",
          countdownGoOutEndHandler
        );
        countdownGoOutEndHandler = null;
      }
      complete();
    }, COUNTDOWN_GO_OUT_MS + 80);
    countdownDisplay.classList.add("countdown-display--go-out");
  }

  function scheduleCountdownStep(beatIndex) {
    if (!countdownActive) return;
    if (beatIndex < 3) {
      showCountdownBeat(3 - beatIndex);
      countdownTimeoutId = window.setTimeout(function () {
        scheduleCountdownStep(beatIndex + 1);
      }, COUNTDOWN_BEAT_MS);
      return;
    }
    /* After “1”: show go phrase for one beat, exit animation, then play. */
    showCountdownGoPhrase();
    countdownTimeoutId = window.setTimeout(function () {
      countdownTimeoutId = 0;
      beginCountdownGoExit();
    }, COUNTDOWN_BEAT_MS);
  }

  function beginStartCountdown() {
    if (countdownActive) return;
    countdownActive = true;
    if (countdownOverlay) {
      countdownOverlay.hidden = false;
    }
    if (countdownDisplay) {
      countdownDisplay.textContent = "";
      countdownDisplay.classList.remove("countdown-display--tick");
      countdownDisplay.classList.remove("countdown-display--go");
      countdownDisplay.classList.remove("countdown-display--go-out");
    }
    hideCountdownInstruction();
    countdownStartRafId = requestAnimationFrame(function () {
      countdownStartRafId = 0;
      scheduleCountdownStep(0);
    });
  }

  function dismissLandingIfVisible() {
    if (landingOverlay && !landingOverlay.hidden) {
      landingOverlay.hidden = true;
    }
  }

  function showLandingOverlay() {
    if (!landingOverlay) return;
    landingOverlay.hidden = false;
    syncDifficultyRadios(currentDifficulty);
    requestAnimationFrame(function () {
      if (!landingStartBtn) return;
      try {
        landingStartBtn.focus({ preventScroll: true });
      } catch (err) {
        landingStartBtn.focus();
      }
    });
  }

  function dismissEndOverlayIfVisible() {
    if (endOverlay && !endOverlay.hidden) {
      endOverlay.hidden = true;
    }
  }

  function maxPossibleScoreForChart(noteCount) {
    return Math.max(0, noteCount) * SCORE_PERFECT;
  }

  /**
   * One-line celebration for a full run (`ended`). Empty string if the chart has no notes.
   * Max reference = SCORE_PERFECT × note count (all Perfects).
   */
  function buildFullRunCelebrationMessage(finalScore, noteCount, difficultyKey) {
    const maxPts = maxPossibleScoreForChart(noteCount);
    const safeScore = Math.max(
      0,
      Math.floor(Number.isFinite(finalScore) ? finalScore : 0)
    );
    const pct = maxPts > 0 ? Math.min(1, safeScore / maxPts) : 0;

    if (maxPts <= 0) {
      return "";
    }
    if (pct >= 0.98) {
      return difficultyKey === "hard"
        ? "Did you produce the song?! Your rhythm is flawless!"
        : difficultyKey === "easy"
          ? "Looks like that was too easy for you - ready for a higher difficulty?"
          : "Your rhythm is elite!";
    }
    if (pct >= 0.9) {
      return difficultyKey === "hard"
        ? "Your rhythm is elite!"
        : "You owned that beat!";
    }
    if (pct >= 0.75) {
      return difficultyKey === "hard"
        ? "Strong! That was incredible!"
        : "Great work!";
    }
    if (pct >= 0.55) {
      return "Solid finish! But I bet you can beat that score...";
    }
    if (pct >= 0.35) {
      return "You hung in there! Wanna take another swing?";
    }
    return "A few more runs, and you'll become elite.";
  }

  function showEndGameOverlay(finalScore, options) {
    options = options || {};
    const fullRun = options.fullRun === true;
    if (!endOverlay) return;
    if (endFinalScoreEl) {
      endFinalScoreEl.textContent = String(
        Number.isFinite(finalScore) ? Math.floor(finalScore) : 0
      );
    }
    if (endCelebrationEl && endCelebrationLeadEl) {
      if (fullRun) {
        const diff = isValidDifficulty(currentDifficulty)
          ? currentDifficulty
          : DEFAULT_DIFFICULTY;
        const noteCount = scheduledNotes.length;
        const msg = buildFullRunCelebrationMessage(
          finalScore,
          noteCount,
          diff
        );
        endCelebrationLeadEl.textContent = msg;
        endCelebrationEl.hidden = !msg;
      } else {
        endCelebrationLeadEl.textContent = "";
        endCelebrationEl.hidden = true;
      }
    }
    endOverlay.hidden = false;
    requestAnimationFrame(function () {
      const defaultEnd = endPlayAgainBtn || endStreamingLink;
      if (!defaultEnd) return;
      try {
        defaultEnd.focus({ preventScroll: true });
      } catch (err) {
        defaultEnd.focus();
      }
    });
  }

  /** Dismiss end menu, reset, show landing so player can pick difficulty, then Start. */
  function beginPlayAgainFromEndOverlay() {
    dismissEndOverlayIfVisible();
    try {
      audio.pause();
    } catch (err) {
      /* ignore */
    }
    resetRunState();
    audio.currentTime = 0;
    syncPauseButtonLabel();
    showLandingOverlay();
  }

  /** Load chart for selected difficulty, then dismiss overlays and count-in → play. */
  async function beginPlaybackFromUserGesture() {
    if (loadingPlaybackPrep) return;
    loadingPlaybackPrep = true;
    try {
      needsWelcomeBeforeTransportStart = false;
      await applyDifficultyBeatMap(getSelectedDifficulty());
      dismissLandingIfVisible();
      dismissEndOverlayIfVisible();
      startAfterGestureUnlock();
    } finally {
      loadingPlaybackPrep = false;
    }
  }

  /**
   * Unlock audio in the same user gesture (autoplay policy), then 3–2–1, go phrase, play.
   * Brief silent play advances currentTime — rewind to 0 so beat-map times match the file from the start.
   */
  function startAfterGestureUnlock() {
    if (!audio.paused || countdownActive) return;

    const prevVol = audio.volume;
    const prevMuted = audio.muted;
    audio.muted = true;
    audio.volume = 0;
    const attempt = audio.play();

    function restorePreUnlockAudioState() {
      audio.muted = prevMuted;
      audio.volume = prevVol;
    }

    function beginCountIn() {
      audio.pause();
      restorePreUnlockAudioState();
      audio.currentTime = 0;
      beginStartCountdown();
    }

    if (attempt !== undefined) {
      attempt.then(beginCountIn).catch(function () {
        restorePreUnlockAudioState();
        try {
          audio.pause();
        } catch (err) {
          /* ignore */
        }
        audio.currentTime = 0;
        beginStartCountdown();
      });
    } else {
      beginCountIn();
    }
  }

  function onKeyDown(e) {
    const tag = e.target && e.target.tagName;
    const inField =
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON";

    const isSpace =
      e.code === "Space" ||
      e.key === " " ||
      e.key === "Spacebar";
    if (!isSpace) return;
    if (e.repeat) return;
    if (inField) return;
    e.preventDefault();
    /* Paused (initial load, Stop, or Pause): Space matches Start → count-in → play. */
    if (audio.paused && !countdownActive) {
      if (needsWelcomeBeforeTransportStart) {
        showLandingOverlay();
        return;
      }
      void beginPlaybackFromUserGesture();
      return;
    }
    if (!audio.paused) {
      handleTap();
    }
  }

  function resetRunState() {
    rebuildActiveNotesFromSchedule();
    score = 0;
    syncScoreDisplay({ silent: true });
    clearFeedback();
  }

  function concludeFullRunEnd() {
    const runScore = score;
    needsWelcomeBeforeTransportStart = true;
    resetRunState();
    syncPauseButtonLabel();
    showEndGameOverlay(runScore, { fullRun: true });
  }

  /**
   * End card at END_CARD_AT_SEC: show "What's next?" with final score, stop gameplay (no more notes/taps),
   * but do not pause audio — the track continues to the end in the background.
   */
  function showChartEndCardAtPlaybackMark() {
    const runScore = score;
    needsWelcomeBeforeTransportStart = true;
    notesLayer.replaceChildren();
    activeNotes = [];
    clearFeedback();
    syncPauseButtonLabel();
    showEndGameOverlay(runScore, { fullRun: true });
  }

  /** When playback crosses END_CARD_AT_SEC, show the end card; audio keeps playing until natural `ended`. */
  function maybeEndGameAtChartMark() {
    if (fullRunEndHandled || audio.paused || countdownActive) return;
    const t = audio.currentTime;
    if (!Number.isFinite(t) || t < END_CARD_AT_SEC) return;
    fullRunEndHandled = true;
    showChartEndCardAtPlaybackMark();
  }

  function tick() {
    updateSongTimerDisplay();
    if (!audio.paused) {
      expireMissedNotes();
      maybeEndGameAtChartMark();
    }
    updateNotes();
    requestAnimationFrame(tick);
  }

  async function bootstrap() {
    initSymbolRain();
    await applyDifficultyBeatMap(DEFAULT_DIFFICULTY);
    syncDifficultyRadios(DEFAULT_DIFFICULTY);

    if (countdownInstructionEl) {
      countdownInstructionEl.textContent = COUNTDOWN_INSTRUCTION_TEXT;
    }

    if (songTimerArc) {
      songTimerArc.style.strokeDasharray = String(TIMER_RING_C);
      songTimerArc.style.strokeDashoffset = String(TIMER_RING_C);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resizeSymbolRainCanvas, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopSymbolRain();
        return;
      }
      if (!symbolRainState.reducedMotion) {
        startSymbolRain();
      }
    });

    try {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", function (e) {
        symbolRainState.reducedMotion = e.matches;
        if (symbolRainState.reducedMotion) {
          stopSymbolRain();
          drawStaticSymbolRain();
        } else if (!document.hidden) {
          startSymbolRain();
        }
      });
    } catch (err) {
      /* ignore media listener support gaps */
    }

    hitTapZone.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      handleTap();
    });

    audio.addEventListener("seeked", function () {
      fullRunEndHandled = false;
      updateSongTimerDisplay();
      resetRunState();
    });

    function refreshDurationUi() {
      updateSongTimerDisplay();
    }

    audio.addEventListener("loadedmetadata", refreshDurationUi);
    audio.addEventListener("durationchange", refreshDurationUi);

    audio.addEventListener("play", syncPauseButtonLabel);
    audio.addEventListener("pause", syncPauseButtonLabel);

    audio.addEventListener("ended", function () {
      if (fullRunEndHandled) return;
      fullRunEndHandled = true;
      concludeFullRunEnd();
    });

    startBtn.addEventListener("click", function () {
      if (needsWelcomeBeforeTransportStart) {
        showLandingOverlay();
        return;
      }
      void beginPlaybackFromUserGesture();
    });

    if (landingStartBtn) {
      landingStartBtn.addEventListener("click", function () {
        void beginPlaybackFromUserGesture().then(function () {
          releaseFocusFromControls();
        });
      });
    }

    if (landingOverlay) {
      landingOverlay.addEventListener("click", function (e) {
        if (landingOverlay.hidden) return;
        if (e.target.closest(".landing-overlay__stack")) return;
        dismissLandingIfVisible();
        focusMainPlayButton();
      });
    }

    if (endOverlay) {
      endOverlay.addEventListener("click", function (e) {
        if (endOverlay.hidden) return;
        if (e.target.closest(".end-overlay__card")) return;
        dismissEndOverlayIfVisible();
        try {
          audio.pause();
        } catch (err) {
          /* ignore */
        }
        audio.currentTime = 0;
        needsWelcomeBeforeTransportStart = true;
        syncPauseButtonLabel();
        focusMainPlayButton();
      });
    }

    pauseBtn.addEventListener("click", function () {
      if (countdownActive) {
        cancelCountdown();
        releaseFocusFromControls();
        return;
      }
      if (audio.paused) {
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
      releaseFocusFromControls();
    });

    stopBtn.addEventListener("click", function () {
      const runScore = score;
      cancelCountdown();
      audio.pause();
      resetRunState();
      audio.currentTime = 0;
      fullRunEndHandled = false;
      needsWelcomeBeforeTransportStart = true;
      syncPauseButtonLabel();
      releaseFocusFromControls();
      showEndGameOverlay(runScore, { fullRun: false });
    });

    if (endPlayAgainBtn) {
      endPlayAgainBtn.addEventListener("click", function () {
        beginPlayAgainFromEndOverlay();
      });
    }

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      refreshDurationUi();
    }

    requestAnimationFrame(tick);
    syncPauseButtonLabel();
  }

  bootstrap();
})();
