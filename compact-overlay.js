const targetEl = document.getElementById("compactTarget");
const warriorEl = document.getElementById("compactWarrior");
const wizardEl = document.getElementById("compactWizard");
const warriorTpmEl = document.getElementById("compactWarriorTpm");
const wizardTpmEl = document.getElementById("compactWizardTpm");
const warriorFluxMinEl = document.getElementById("compactWarriorFluxMin");
const wizardFluxMinEl = document.getElementById("compactWizardFluxMin");
const canvas = document.getElementById("compactGraph");
const ctx = canvas.getContext("2d");

const WINDOW_MS = 120000;
const RATE_WINDOW_MS = 10000;
const history = [];

function xForTime(ms, minTime, maxTime, left, width) {
  const span = Math.max(1, maxTime - minTime);
  return left + ((ms - minTime) / span) * width;
}

function yForValue(value, minValue, maxValue, top, height) {
  const span = Math.max(1, maxValue - minValue);
  return top + height - ((value - minValue) / span) * height;
}

function pruneHistory(nowMs) {
  const minAllowed = nowMs - WINDOW_MS;
  while (history.length > 2 && history[0].t < minAllowed) history.shift();
}

function getCurrentRates(nowMs) {
  if (history.length < 2) return { warriorPerMinute: 0, wizardPerMinute: 0 };
  const latest = history[history.length - 1];
  const threshold = nowMs - RATE_WINDOW_MS;
  let anchor = history[0];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].t <= threshold) {
      anchor = history[i];
      break;
    }
  }
  const dt = (latest.t - anchor.t) / 1000;
  if (dt <= 0) return { warriorPerMinute: 0, wizardPerMinute: 0 };
  return {
    warriorPerMinute: Math.max(0, ((latest.warrior - anchor.warrior) / dt) * 60),
    wizardPerMinute: Math.max(0, ((latest.wizard - anchor.wizard) / dt) * 60),
  };
}

function drawGraph(nowMs) {
  const dpr = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
  const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const width = pixelWidth;
  const height = pixelHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padL = 8 * dpr;
  const padR = 8 * dpr;
  const padT = 7 * dpr;
  const padB = 8 * dpr;
  const graphW = Math.max(1, width - padL - padR);
  const graphH = Math.max(1, height - padT - padB);

  const minTime = nowMs - WINDOW_MS;
  const visible = history.filter((p) => p.t >= minTime);
  let maxValue = 1;
  for (const p of visible) {
    if (p.warrior > maxValue) maxValue = p.warrior;
    if (p.wizard > maxValue) maxValue = p.wizard;
  }
  maxValue = Math.ceil(maxValue / 50) * 50;

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i += 1) {
    const y = padT + (graphH / 2) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + graphW, y);
    ctx.stroke();
  }

  function drawLine(key, color) {
    if (!visible.length) return;
    ctx.beginPath();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = color;
    for (let i = 0; i < visible.length; i += 1) {
      const point = visible[i];
      const x = xForTime(point.t, minTime, nowMs, padL, graphW);
      const y = yForValue(point[key], 0, maxValue, padT, graphH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLine("warrior", "#ff9a4a");
  drawLine("wizard", "#5db8ff");
}

function appendPoint(state) {
  const nowMs = Date.now();
  const point = {
    t: nowMs,
    warrior: Number(state.hate || 0),
    wizard: Number(state.fluxHate || 0),
  };
  const last = history[history.length - 1];
  if (last && (point.warrior < last.warrior || point.wizard < last.wizard)) {
    history.length = 0;
  }
  const lastAfterReset = history[history.length - 1];
  if (lastAfterReset && nowMs - lastAfterReset.t < 400) history[history.length - 1] = point;
  else history.push(point);

  pruneHistory(nowMs);
  drawGraph(nowMs);

  const rates = getCurrentRates(nowMs);
  warriorTpmEl.textContent = String(Math.round(rates.warriorPerMinute));
  wizardTpmEl.textContent = String(Math.round(rates.wizardPerMinute));
  warriorFluxMinEl.textContent = (rates.warriorPerMinute / 50).toFixed(1);
  wizardFluxMinEl.textContent = (rates.wizardPerMinute / 50).toFixed(1);
}

if (window.agroApi && window.agroApi.onOverlayState) {
  window.agroApi.onOverlayState((state) => {
    if (!state) return;
    targetEl.textContent = state.mobName ? state.mobName : "No Target";
    warriorEl.textContent = String(state.hate || 0);
    wizardEl.textContent = String(state.fluxHate || 0);
    appendPoint(state);
  });
}

window.addEventListener("resize", () => drawGraph(Date.now()));
