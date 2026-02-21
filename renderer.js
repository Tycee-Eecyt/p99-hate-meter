const SPELL_HATE = {
  "You feel uncomfortable.": 50,
  "Someone looks uncomfortable.": 50,
};

const WEAR_OFF_LINES = {
  "Your vulnerability fades.": "Flux staff wears off",
};

const MELEE_HIT_RE = /\bYou (slash|pierce|crush|punch) (.+?) for (\d+) points of damage\./i;
const MELEE_MISS_RE = /\bYou try to (slash|pierce|crush|punch) (.+?), but .+?!\b/i;
const MELEE_MISS_SHORT_RE = /\bYou miss\b/i;
const RIPOSTE_PARRY_RE = /\bYou (riposte|parry)\b/i;
const TIMESTAMP_RE = /^\[(.+?)\]\s+/;
const FLUX_LOOKS_UNCOMFORTABLE_RE = /\blooks uncomfortable\.\s*$/i;
const RAGE_OF_VALLON_RE = /^(.+?) is weakened by the Rage of Vallon\.\s*$/i;

function parseLogTimestamp(line) {
  const match = line.match(TIMESTAMP_RE);
  if (!match) return { ts: null, text: line };
  const raw = match[1];
  const ts = new Date(raw);
  if (Number.isNaN(ts.getTime())) return { ts: null, text: line };
  return { ts, text: line.slice(match[0].length) };
}

function damageBonusForLevel(level) {
  if (level < 28) return 0;
  const table = [
    [28, 1],
    [31, 2],
    [34, 3],
    [37, 4],
    [40, 5],
    [43, 6],
    [46, 7],
    [49, 8],
    [52, 9],
    [55, 10],
    [58, 11],
  ];
  let bonus = 0;
  for (const [lvl, val] of table) {
    if (level >= lvl) bonus = val;
  }
  return bonus;
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
  total: 0,
  fluxCount: 0,
  fluxHate: 0,
  primaryHate: 0,
  secondaryHate: 0,
  primaryType: "slash",
  secondaryType: "pierce",
  handTracker: new SwingHandTracker(2.4, 1.8),
  mobs: new Map(),
  activeMobName: "",
  fightResetSeconds: 30,
};

const totalHate = document.getElementById("totalHate");
const fluxCountEl = document.getElementById("fluxCount");
const fluxHateEl = document.getElementById("fluxHate");
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
  totalHate.textContent = state.total.toString();
}

function updateFluxStats() {
  if (fluxCountEl) fluxCountEl.textContent = state.fluxCount.toString();
  if (fluxHateEl) fluxHateEl.textContent = state.fluxHate.toString();
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
  const level = Number(document.getElementById("level").value);
  updateFightReset();
  const primaryDmg = Number(document.getElementById("primaryDmg").value);
  const secondaryDmg = Number(document.getElementById("secondaryDmg").value);
  const primaryDelay = Number(document.getElementById("primaryDelay").value) / 10;
  const secondaryDelay = Number(document.getElementById("secondaryDelay").value) / 10;
  state.primaryType = document.getElementById("primaryType").value;
  state.secondaryType = document.getElementById("secondaryType").value;
  const bonus = damageBonusForLevel(level);
  state.primaryHate = primaryDmg + bonus;
  state.secondaryHate = secondaryDmg + bonus;
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
  if (match) return { type: match[1].toLowerCase(), mobName: normalizeMobName(match[2]) };
  match = text.match(MELEE_MISS_RE);
  if (match) return { type: match[1].toLowerCase(), mobName: normalizeMobName(match[2]) };
  return { type: "", mobName: "" };
}

function updateOverlayState() {
  if (!window.agroApi || !window.agroApi.setOverlayState) return;
  const mobName = state.activeMobName || "";
  // Overlay "Warrior Hate" should reflect cumulative melee hate, not per-mob hate.
  window.agroApi.setOverlayState({ mobName, hate: state.total, fluxCount: state.fluxCount, fluxHate: state.fluxHate });
}

function resetHateTracking(clearLog = false) {
  state.total = 0;
  state.fluxCount = 0;
  state.fluxHate = 0;
  updateTotal();
  updateFluxStats();
  state.mobs.clear();
  state.activeMobName = "";
  renderMobList();
  updateOverlayState();
  if (clearLog) {
    logBody.innerHTML = "";
  } else {
    addLine("[SYSTEM] Hate reset from overlay", "spell");
  }
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
    const rageHate = 500;
    const rageSpellDamageHate = 100;
    const totalRageHate = rageHate + rageSpellDamageHate;
    const mobName = rageMobName || state.activeMobName;
    state.total += totalRageHate;
    const entry = getMobEntry(mobName, ts);
    if (entry) {
      entry.hate += totalRageHate;
      state.activeMobName = mobName;
    }
    updateTotal();
    renderMobList();
    updateOverlayState();
    addLine(`[PROC] ${text} -> +${totalRageHate} hate (Rage of Vallon: 500 hate + 100 spell damage)`, "spell");
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
    let mobName = info.mobName;
    if (!mobName && state.activeMobName) mobName = state.activeMobName;
    const isUnknownMiss = !attackType && MELEE_MISS_SHORT_RE.test(text);
    const entry = getMobEntry(mobName, ts);
    if (singleWeapon) {
      if (attackType && attackType !== state.primaryType) return;
      state.total += state.primaryHate;
      if (entry) {
        entry.hate += state.primaryHate;
        state.activeMobName = mobName;
      }
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
      state.total += hate;
      if (entry) {
        entry.hate += hate;
        state.activeMobName = mobName;
      }
      updateTotal();
      addLine(`[SWING] ${hand} (unknown) -> +${hate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }

    const primaryMatches = !attackType || attackType === state.primaryType;
    const secondaryMatches = !attackType || attackType === state.secondaryType;

    if (primaryMatches && !secondaryMatches) {
      state.total += state.primaryHate;
      if (entry) {
        entry.hate += state.primaryHate;
        state.activeMobName = mobName;
      }
      updateTotal();
      state.handTracker.recordHand("primary", ts);
      addLine(`[SWING] primary (${attackType || "unknown"}) -> +${state.primaryHate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }
    if (secondaryMatches && !primaryMatches) {
      state.total += state.secondaryHate;
      if (entry) {
        entry.hate += state.secondaryHate;
        state.activeMobName = mobName;
      }
      updateTotal();
      state.handTracker.recordHand("secondary", ts);
      addLine(`[SWING] secondary (${attackType || "unknown"}) -> +${state.secondaryHate} hate`, "swing");
      renderMobList();
      updateOverlayState();
      return;
    }

    const hand = state.handTracker.pickHand(ts);
    const hate = hand === "primary" ? state.primaryHate : state.secondaryHate;
    state.total += hate;
    if (entry) {
      entry.hate += hate;
      state.activeMobName = mobName;
    }
    updateTotal();
    addLine(`[SWING] ${hand} (${attackType || "unknown"}) -> +${hate} hate`, "swing");
    renderMobList();
    updateOverlayState();
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
    resetHateTracking(false);
  });
}

loadSettings();
updateFightReset();
updateFluxStats();
["logFile", "level", "fightResetSeconds", "primaryDmg", "primaryDelay", "primaryType", "secondaryDmg", "secondaryDelay", "secondaryType", "singleWeapon", "overlayEnabled"].forEach(
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

const fightResetInput = document.getElementById("fightResetSeconds");
if (fightResetInput) {
  fightResetInput.addEventListener("change", () => {
    updateFightReset();
    renderMobList();
  });
}

renderMobList();
setInterval(renderMobList, 1000);

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
