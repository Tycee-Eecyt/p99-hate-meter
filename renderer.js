const SPELL_HATE = {
  "You feel uncomfortable.": 50,
  "Someone looks uncomfortable.": 50,
};

const WEAR_OFF_LINES = {
  "Your vulnerability fades.": "Flux staff wears off",
};

const MELEE_HIT_RE = /\bYou (slash|pierce|crush|punch) (.+?) for (\d+) points of damage\./i;
const MELEE_MISS_RE = /\bYou try to (slash|pierce|crush|punch) (.+?), but .+?[.!]?\s*$/i;
const MELEE_MISS_SHORT_RE = /\bYou miss\b/i;
const RIPOSTE_PARRY_RE = /\bYou (riposte|parry)\b/i;
const KICK_HIT_RE = /\bYou kick (.+?) for \d+ points of damage\./i;
const KICK_MISS_RE = /\bYou try to kick (.+?), but .+?[.!]?\s*$/i;
const BASH_HIT_RE = /\bYou bash (.+?) for \d+ points of damage\./i;
const BASH_MISS_RE = /\bYou try to bash (.+?), but .+?[.!]?\s*$/i;
const DISARM_HIT_RE = /\bYou disarmed (.+?)!/i;
const DISARM_MISS_RE = /\bYour attempt to disarm failed\./i;
const TIMESTAMP_RE = /^\[(.+?)\]\s+/;
const FLUX_LOOKS_UNCOMFORTABLE_RE = /\blooks uncomfortable\.\s*$/i;
const RAGE_OF_VALLON_RE = /^(.+?) is weakened by the Rage of Vallon\.\s*$/i;
const MAIN_HAND_HATE_BONUS = 11;
const OFF_HAND_HATE_BONUS = 12;

function parseLogTimestamp(line) {
  const match = line.match(TIMESTAMP_RE);
  if (!match) return { ts: null, text: line };
  const raw = match[1];
  const ts = new Date(raw);
  if (Number.isNaN(ts.getTime())) return { ts: null, text: line };
  return { ts, text: line.slice(match[0].length) };
}

class SwingHandTracker {
  constructor(primaryDelay, secondaryDelay) {
    this.primaryDelay = primaryDelay;
    this.secondaryDelay = secondaryDelay;
    this.nextPrimary = null;
    this.nextSecondary = null;
    this.lastHand = "secondary";
  }

  recordHand(hand, ts) {
    this.lastHand = hand;
    if (!ts) return;
    if (hand === "primary") {
      this.nextPrimary = new Date(ts.getTime() + this.primaryDelay * 1000);
      if (!this.nextSecondary) this.nextSecondary = ts;
      return;
    }
    this.nextSecondary = new Date(ts.getTime() + this.secondaryDelay * 1000);
    if (!this.nextPrimary) this.nextPrimary = ts;
  }

  pickHand(ts) {
    if (!ts) {
      this.lastHand = this.lastHand === "secondary" ? "primary" : "secondary";
      return this.lastHand;
    }

    if (!this.nextPrimary) this.nextPrimary = ts;
    if (!this.nextSecondary) this.nextSecondary = ts;

    if (this.nextPrimary <= this.nextSecondary) {
      const hand = "primary";
      this.nextPrimary = new Date(ts.getTime() + this.primaryDelay * 1000);
      return hand;
    }
    const hand = "secondary";
    this.nextSecondary = new Date(ts.getTime() + this.secondaryDelay * 1000);
    return hand;
  }
}

const state = {
  warriorHate: 0,
  warriorDamage: 0,
  fluxCount: 0,
  fluxHate: 0,
  procCount: 0,
  procHate: 0,
  primaryHate: 0,
  secondaryHate: 0,
  primaryType: "slash",
  secondaryType: "pierce",
  handTracker: new SwingHandTracker(2.4, 1.8),
  mobs: new Map(),
  activeMobName: "",
  fightResetSeconds: 30,
  lastCombatAt: null,
};

const totalHate = document.getElementById("totalHate");
const fluxCountEl = document.getElementById("fluxCount");
const fluxHateEl = document.getElementById("fluxHate");
const procCountEl = document.getElementById("procCount");
const procHateEl = document.getElementById("procHate");
const fightResetCountdownEl = document.getElementById("fightResetCountdown");
const logBody = document.getElementById("logBody");
const statusEl = document.getElementById("status");
const mobHateList = document.getElementById("mobHateList");
const SETTINGS_KEY = "agroMeterSettings";

function readFormSettings() {
  return {
    logFile: document.getElementById("logFile").value,
    level: document.getElementById("level").value,
    fightResetSeconds: document.getElementById("fightResetSeconds").value,
    primaryDmg: document.getElementById("primaryDmg").value,
    primaryDelay: document.getElementById("primaryDelay").value,
    primaryType: document.getElementById("primaryType").value,
    secondaryDmg: document.getElementById("secondaryDmg").value,
    secondaryDelay: document.getElementById("secondaryDelay").value,
    secondaryType: document.getElementById("secondaryType").value,
    singleWeapon: document.getElementById("singleWeapon").checked,
    overlayEnabled: document.getElementById("overlayEnabled").checked,
    graphOverlayEnabled: document.getElementById("graphOverlayEnabled").checked,
  };
}

function applyFormSettings(settings) {
  if (!settings) return;
  if (settings.logFile !== undefined) document.getElementById("logFile").value = settings.logFile;
  if (settings.level !== undefined) document.getElementById("level").value = settings.level;
  if (settings.fightResetSeconds !== undefined) document.getElementById("fightResetSeconds").value = settings.fightResetSeconds;
  if (settings.primaryDmg !== undefined) document.getElementById("primaryDmg").value = settings.primaryDmg;
  if (settings.primaryDelay !== undefined) document.getElementById("primaryDelay").value = settings.primaryDelay;
  if (settings.primaryType !== undefined) document.getElementById("primaryType").value = settings.primaryType;
  if (settings.secondaryDmg !== undefined) document.getElementById("secondaryDmg").value = settings.secondaryDmg;
  if (settings.secondaryDelay !== undefined) document.getElementById("secondaryDelay").value = settings.secondaryDelay;
  if (settings.secondaryType !== undefined) document.getElementById("secondaryType").value = settings.secondaryType;
  if (settings.singleWeapon !== undefined) document.getElementById("singleWeapon").checked = !!settings.singleWeapon;
  if (settings.overlayEnabled !== undefined) document.getElementById("overlayEnabled").checked = !!settings.overlayEnabled;
  if (settings.graphOverlayEnabled !== undefined) document.getElementById("graphOverlayEnabled").checked = !!settings.graphOverlayEnabled;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    applyFormSettings(parsed);
  } catch {
    // Ignore bad storage data.
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(readFormSettings()));
  } catch {
    // Ignore storage failures.
  }
}

function addLine(text, kind) {
  const div = document.createElement("div");
  div.className = `log-line ${kind || ""}`;
  div.textContent = text;
  logBody.appendChild(div);
  logBody.scrollTop = logBody.scrollHeight;
}

function updateTotal() {
  totalHate.textContent = state.warriorHate.toString();
}

function updateFluxStats() {
  if (fluxCountEl) fluxCountEl.textContent = state.fluxCount.toString();
  if (fluxHateEl) fluxHateEl.textContent = state.fluxHate.toString();
}

function updateProcStats() {
  if (procCountEl) procCountEl.textContent = state.procCount.toString();
  if (procHateEl) procHateEl.textContent = state.procHate.toString();
}

function getFightResetRemainingSeconds() {
  if (!state.lastCombatAt) return 0;
  const resetMs = state.fightResetSeconds * 1000;
  if (resetMs <= 0) return 0;
  const elapsedMs = Date.now() - state.lastCombatAt.getTime();
  return Math.max(0, Math.ceil((resetMs - elapsedMs) / 1000));
}

function getFightResetAtMs() {
  if (!state.lastCombatAt) return 0;
  const resetMs = state.fightResetSeconds * 1000;
  if (resetMs <= 0) return 0;
  return state.lastCombatAt.getTime() + resetMs;
}

function updateFightResetCountdown() {
  if (!fightResetCountdownEl) return;
  const remaining = getFightResetRemainingSeconds();
  fightResetCountdownEl.textContent = remaining > 0 ? `${remaining}s` : "Ready";
}

function markCombatActivity(ts) {
  state.lastCombatAt = ts || new Date();
  updateFightResetCountdown();
}

function spellHateForLine(text) {
  if (SPELL_HATE[text]) return SPELL_HATE[text];
  if (FLUX_LOOKS_UNCOMFORTABLE_RE.test(text)) return 50;
  return 0;
}

function rageOfVallonMobName(text) {
  const match = text.match(RAGE_OF_VALLON_RE);
  if (!match) return "";
  return normalizeMobName(match[1]);
}

function updateWeaponStats() {
  updateFightReset();
  const primaryDmg = Number(document.getElementById("primaryDmg").value);
  const secondaryDmg = Number(document.getElementById("secondaryDmg").value);
  const primaryDelay = Number(document.getElementById("primaryDelay").value) / 10;
  const secondaryDelay = Number(document.getElementById("secondaryDelay").value) / 10;
  state.primaryType = document.getElementById("primaryType").value;
  state.secondaryType = document.getElementById("secondaryType").value;
  state.primaryHate = primaryDmg + MAIN_HAND_HATE_BONUS;
  state.secondaryHate = secondaryDmg + OFF_HAND_HATE_BONUS;
  state.handTracker = new SwingHandTracker(primaryDelay, secondaryDelay);
}

function updateFightReset() {
  const raw = Number(document.getElementById("fightResetSeconds").value);
  if (Number.isFinite(raw) && raw > 0) {
    state.fightResetSeconds = raw;
  }
}

function normalizeMobName(name) {
  return name.replace(/^(a|an|the)\s+/i, "").trim();
}

function getAttackInfo(text) {
  let match = text.match(MELEE_HIT_RE);
  if (match) return { type: match[1].toLowerCase(), mobName: normalizeMobName(match[2]), damage: Number(match[3]) || 0 };
  match = text.match(MELEE_MISS_RE);
  if (match) return { type: match[1].toLowerCase(), mobName: normalizeMobName(match[2]), damage: 0 };
  return { type: "", mobName: "", damage: 0 };
}

function getSkillHateInfo(text) {
  let match = text.match(KICK_HIT_RE);
  if (match) return { mobName: normalizeMobName(match[1]), hate: 5 };
  match = text.match(KICK_MISS_RE);
  if (match) return { mobName: normalizeMobName(match[1]), hate: 5 };
  match = text.match(BASH_HIT_RE);
  if (match) return { mobName: normalizeMobName(match[1]), hate: 7 };
  match = text.match(BASH_MISS_RE);
  if (match) return { mobName: normalizeMobName(match[1]), hate: 7 };
  match = text.match(DISARM_HIT_RE);
  if (match) return { mobName: normalizeMobName(match[1]), hate: 20 };
  if (DISARM_MISS_RE.test(text)) return { mobName: state.activeMobName || "", hate: 20 };
  return null;
}

function updateOverlayState() {
  if (!window.agroApi || !window.agroApi.setOverlayState) return;
  const mobName = state.activeMobName || "";
  window.agroApi.setOverlayState({
    mobName,
    hate: state.warriorHate,
    damage: state.warriorDamage,
    fluxCount: state.fluxCount,
    fluxHate: state.fluxHate,
    procCount: state.procCount,
    procHate: state.procHate,
    resetCountdown: getFightResetRemainingSeconds(),
    resetAtMs: getFightResetAtMs(),
  });
}

function resetHateTracking(clearLog = false, reason = "manual") {
  state.warriorHate = 0;
  state.warriorDamage = 0;
  state.fluxCount = 0;
  state.fluxHate = 0;
  state.procCount = 0;
  state.procHate = 0;
  state.lastCombatAt = null;
  updateTotal();
  updateFluxStats();
  updateProcStats();
  updateFightResetCountdown();
  state.mobs.clear();
  state.activeMobName = "";
  renderMobList();
  updateOverlayState();
  if (clearLog) {
    logBody.innerHTML = "";
  } else if (reason === "overlay") {
    addLine("[SYSTEM] Hate reset from overlay", "spell");
  } else if (reason === "inactivity") {
    addLine(`[SYSTEM] Fight reset after ${state.fightResetSeconds}s inactivity`, "spell");
  }
}

function maybeResetFightOnInactivity() {
  if (!state.lastCombatAt) return;
  const resetMs = state.fightResetSeconds * 1000;
  if (resetMs <= 0) return;
  const elapsedMs = Date.now() - state.lastCombatAt.getTime();
  if (elapsedMs < resetMs) return;
  resetHateTracking(false, "inactivity");
}

function getMobEntry(mobName, ts) {
  if (!mobName) return null;
  const now = ts || new Date();
  const existing = state.mobs.get(mobName);
  if (!existing) {
    const entry = { hate: 0, lastSeen: now };
    state.mobs.set(mobName, entry);
    return entry;
  }
  const resetMs = state.fightResetSeconds * 1000;
  if (resetMs > 0 && now - existing.lastSeen > resetMs) {
    existing.hate = 0;
  }
  existing.lastSeen = now;
  return existing;
}

function renderMobList() {
  if (!mobHateList) return;
  const now = new Date();
  const resetMs = state.fightResetSeconds * 1000;
  const entries = Array.from(state.mobs.entries()).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  mobHateList.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "mob-card";
    empty.textContent = "No mob hate yet.";
    mobHateList.appendChild(empty);
    return;
  }

  for (const [name, entry] of entries) {
    const elapsedMs = now - entry.lastSeen;
    const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const remainingSec = resetMs > 0 ? Math.max(0, Math.ceil((resetMs - elapsedMs) / 1000)) : 0;
    const card = document.createElement("div");
    card.className = "mob-card";

    const title = document.createElement("div");
    title.className = "mob-card-name";
    title.textContent = name;

    const hate = document.createElement("div");
    hate.className = "mob-card-hate";
    hate.textContent = entry.hate.toString();

    const meta = document.createElement("div");
    meta.className = "mob-card-meta";
    const lastSeen = document.createElement("span");
    lastSeen.textContent = `last ${elapsedSec}s`;
    const reset = document.createElement("span");
    reset.textContent = remainingSec > 0 ? `reset in ${remainingSec}s` : "reset ready";
    meta.appendChild(lastSeen);
    meta.appendChild(reset);

    card.appendChild(title);
    card.appendChild(hate);
    card.appendChild(meta);
    mobHateList.appendChild(card);
  }
}

function handleLine(rawLine) {
  const { ts, text } = parseLogTimestamp(rawLine);

  const spellHate = spellHateForLine(text);
  if (spellHate > 0) {
    state.fluxCount += 1;
    state.fluxHate += spellHate;
    updateFluxStats();
    updateOverlayState();
    addLine(`[SPELL] ${text} -> +${spellHate} hate`, "spell");
    return;
  }

  const rageMobName = rageOfVallonMobName(text);
  if (rageMobName || RAGE_OF_VALLON_RE.test(text)) {
    const totalRageHate = 600;
    const mobName = rageMobName || state.activeMobName;
    state.procCount += 1;
    state.procHate += totalRageHate;
    const entry = getMobEntry(mobName, ts);
    if (entry) {
      entry.hate += totalRageHate;
      state.activeMobName = mobName;
    }
    state.warriorHate += totalRageHate;
    markCombatActivity(ts);
    updateTotal();
    updateProcStats();
    renderMobList();
    updateOverlayState();
    addLine(`[PROC] ${text} -> +${totalRageHate} hate (Rage of Vallon)`, "spell");
    return;
  }

  if (WEAR_OFF_LINES[text]) {
    addLine(`[SPELL] ${WEAR_OFF_LINES[text]}`, "spell");
    return;
  }
  if (RIPOSTE_PARRY_RE.test(text)) return;

  if (MELEE_HIT_RE.test(text) || MELEE_MISS_RE.test(text) || MELEE_MISS_SHORT_RE.test(text)) {
    const singleWeapon = document.getElementById("singleWeapon").checked;
    const info = getAttackInfo(text);
    const attackType = info.type;
    const hitDamage = info.damage || 0;
    if (hitDamage > 0) {
      state.warriorDamage += hitDamage;
    }
    let mobName = info.mobName;
    if (!mobName && state.activeMobName) mobName = state.activeMobName;
    const isUnknownMiss = !attackType && MELEE_MISS_SHORT_RE.test(text);
    const entry = getMobEntry(mobName, ts);
    if (singleWeapon) {
      if (attackType && attackType !== state.primaryType) return;
      state.warriorHate += state.primaryHate;
      if (entry) {
        entry.hate += state.primaryHate;
        state.activeMobName = mobName;
      }
      markCombatActivity(ts);
      updateTotal();
      state.handTracker.recordHand("primary", ts);
      addLine(`[SWING] primary (${attackType || "unknown"}) -> +${state.primaryHate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }

    if (isUnknownMiss) {
      const hand = state.handTracker.pickHand(ts);
      const hate = hand === "primary" ? state.primaryHate : state.secondaryHate;
      state.warriorHate += hate;
      if (entry) {
        entry.hate += hate;
        state.activeMobName = mobName;
      }
      markCombatActivity(ts);
      updateTotal();
      addLine(`[SWING] ${hand} (unknown) -> +${hate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }

    const primaryMatches = !attackType || attackType === state.primaryType;
    const secondaryMatches = !attackType || attackType === state.secondaryType;

    if (primaryMatches && !secondaryMatches) {
      state.warriorHate += state.primaryHate;
      if (entry) {
        entry.hate += state.primaryHate;
        state.activeMobName = mobName;
      }
      markCombatActivity(ts);
      updateTotal();
      state.handTracker.recordHand("primary", ts);
      addLine(`[SWING] primary (${attackType || "unknown"}) -> +${state.primaryHate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }
    if (secondaryMatches && !primaryMatches) {
      state.warriorHate += state.secondaryHate;
      if (entry) {
        entry.hate += state.secondaryHate;
        state.activeMobName = mobName;
      }
      markCombatActivity(ts);
      updateTotal();
      state.handTracker.recordHand("secondary", ts);
      addLine(`[SWING] secondary (${attackType || "unknown"}) -> +${state.secondaryHate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }

    const hand = state.handTracker.pickHand(ts);
    const hate = hand === "primary" ? state.primaryHate : state.secondaryHate;
    state.warriorHate += hate;
    if (entry) {
      entry.hate += hate;
      state.activeMobName = mobName;
    }
    markCombatActivity(ts);
    updateTotal();
    addLine(`[SWING] ${hand} (${attackType || "unknown"}) -> +${hate} hate`, "swing");
    renderMobList();
    updateOverlayState();
  }

  const skillInfo = getSkillHateInfo(text);
  if (skillInfo) {
    const mobName = skillInfo.mobName || state.activeMobName;
    const entry = getMobEntry(mobName, ts);
    state.warriorHate += skillInfo.hate;
    if (entry) {
      entry.hate += skillInfo.hate;
      state.activeMobName = mobName;
    }
    markCombatActivity(ts);
    updateTotal();
    renderMobList();
    updateOverlayState();
    addLine(`[SKILL] ${text} -> +${skillInfo.hate} hate`, "swing");
  }
}

document.getElementById("pickFile").addEventListener("click", async () => {
  const file = await window.agroApi.pickLogFile();
  if (file) {
    document.getElementById("logFile").value = file;
    saveSettings();
  }
});

async function loadWeaponStatsFromInventory(logFilePath, { silent = false } = {}) {
  if (!window.agroApi || !window.agroApi.loadInventoryWeaponStats) return false;
  const file = (logFilePath || "").trim();
  if (!file) {
    if (!silent) statusEl.textContent = "Select log file first";
    return false;
  }

  const result = await window.agroApi.loadInventoryWeaponStats(file);
  if (!result || !result.ok) {
    if (!silent) statusEl.textContent = result?.error || "Failed inventory lookup";
    if (!silent && result?.error) addLine(`[SYSTEM] ${result.error}`, "spell");
    return false;
  }

  let updated = false;
  if (result.primary && result.primary.foundStats && !result.primary.isEmpty) {
    document.getElementById("primaryDmg").value = String(result.primary.damage);
    document.getElementById("primaryDelay").value = String(result.primary.delay);
    updated = true;
  }

  if (result.secondary && result.secondary.foundStats) {
    if (result.secondary.isEmpty) {
      document.getElementById("singleWeapon").checked = true;
      if (!silent) addLine("[SYSTEM] Secondary slot is Empty in inventory. Enabled Single Weapon Only.", "spell");
      updated = true;
    } else {
      document.getElementById("secondaryDmg").value = String(result.secondary.damage);
      document.getElementById("secondaryDelay").value = String(result.secondary.delay);
      document.getElementById("singleWeapon").checked = false;
      updated = true;
    }
  }

  if (!silent) {
    if (result.inventoryPath) addLine(`[SYSTEM] Inventory loaded: ${result.inventoryPath}`, "spell");
    if (result.primary && result.primary.foundStats && !result.primary.isEmpty) {
      addLine(`[SYSTEM] Primary ${result.primary.name}: ${result.primary.damage}/${result.primary.delay}`, "spell");
    } else if (result.primary && !result.primary.isEmpty) {
      addLine(`[SYSTEM] Primary ${result.primary.name}: missing DMG/Delay lookup`, "spell");
    }

    if (result.secondary && result.secondary.foundStats && !result.secondary.isEmpty) {
      addLine(`[SYSTEM] Secondary ${result.secondary.name}: ${result.secondary.damage}/${result.secondary.delay}`, "spell");
    } else if (result.secondary && !result.secondary.isEmpty) {
      addLine(`[SYSTEM] Secondary ${result.secondary.name}: missing DMG/Delay lookup`, "spell");
    }
  }

  if (!updated && !silent) statusEl.textContent = "No weapon stats updated";
  if (updated) {
    updateWeaponStats();
    saveSettings();
    if (!silent) statusEl.textContent = "Inventory weapon stats loaded";
  }
  return updated;
}

const loadInventoryBtn = document.getElementById("loadInventory");
if (loadInventoryBtn) {
  loadInventoryBtn.addEventListener("click", async () => {
    const file = document.getElementById("logFile").value.trim();
    await loadWeaponStatsFromInventory(file, { silent: false });
  });
}

async function startReading(file, fromStart = false, statusText = "Reading") {
  if (!file) {
    statusEl.textContent = "Missing log file";
    return false;
  }

  resetHateTracking(true);
  statusEl.textContent = statusText;
  const started = await window.agroApi.startTail(file, fromStart);
  if (!started) {
    statusEl.textContent = "Failed to read log";
    return false;
  }
  saveSettings();
  return true;
}

document.getElementById("start").addEventListener("click", async () => {
  const file = document.getElementById("logFile").value.trim();
  await loadWeaponStatsFromInventory(file, { silent: true });
  updateWeaponStats();
  await startReading(file, false, "Reading");
});

document.getElementById("stop").addEventListener("click", async () => {
  await window.agroApi.stopTail();
  statusEl.textContent = "Stopped";
});

window.agroApi.onLogLine((line) => handleLine(line));
if (window.agroApi.onResetHate) {
  window.agroApi.onResetHate(() => {
    resetHateTracking(false, "overlay");
  });
}
if (window.agroApi.onRequestLoadInventory) {
  window.agroApi.onRequestLoadInventory(async () => {
    const file = document.getElementById("logFile").value.trim();
    await loadWeaponStatsFromInventory(file, { silent: false });
  });
}

loadSettings();
updateFightReset();
updateFluxStats();
updateProcStats();
updateFightResetCountdown();
[
  "logFile",
  "level",
  "fightResetSeconds",
  "primaryDmg",
  "primaryDelay",
  "primaryType",
  "secondaryDmg",
  "secondaryDelay",
  "secondaryType",
  "singleWeapon",
  "overlayEnabled",
  "graphOverlayEnabled",
].forEach(
  (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", saveSettings);
    el.addEventListener("input", saveSettings);
  }
);

const overlayToggle = document.getElementById("overlayEnabled");
if (overlayToggle) {
  const syncOverlay = (enabled) => {
    if (window.agroApi && window.agroApi.toggleOverlay) window.agroApi.toggleOverlay(enabled);
  };
  syncOverlay(overlayToggle.checked);
  overlayToggle.addEventListener("change", () => syncOverlay(overlayToggle.checked));
}

const graphOverlayToggle = document.getElementById("graphOverlayEnabled");
if (graphOverlayToggle) {
  const syncGraphOverlay = (enabled) => {
    if (window.agroApi && window.agroApi.toggleGraphOverlay) window.agroApi.toggleGraphOverlay(enabled);
  };
  syncGraphOverlay(graphOverlayToggle.checked);
  graphOverlayToggle.addEventListener("change", () => syncGraphOverlay(graphOverlayToggle.checked));
}

const fightResetInput = document.getElementById("fightResetSeconds");
if (fightResetInput) {
  fightResetInput.addEventListener("change", () => {
    updateFightReset();
    renderMobList();
    updateFightResetCountdown();
    updateOverlayState();
  });
}

renderMobList();
setInterval(() => {
  maybeResetFightOnInactivity();
  updateFightResetCountdown();
  renderMobList();
  updateOverlayState();
}, 1000);

async function autoStartLogReading() {
  const logFileInput = document.getElementById("logFile");
  let file = logFileInput.value.trim();

  if (!file && window.agroApi.findDefaultLatestLog) {
    const found = await window.agroApi.findDefaultLatestLog();
    if (found) {
      file = found;
      logFileInput.value = file;
      saveSettings();
    }
  }

  if (!file) return;
  await loadWeaponStatsFromInventory(file, { silent: true });
  updateWeaponStats();
  await startReading(file, false, "Auto-reading");
}

autoStartLogReading();
