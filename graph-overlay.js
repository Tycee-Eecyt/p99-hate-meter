const targetEl = document.getElementById("graphTarget");
const warriorEl = document.getElementById("graphWarrior");
const wizardEl = document.getElementById("graphWizard");
const intersectionInfoEl = document.getElementById("intersectionInfo");
const canvas = document.getElementById("hateGraph");
const ctx = canvas.getContext("2d");

const WINDOW_MS = 120000;
const RATE_WINDOW_MS = 10000;
const history = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
  while (history.length > 2 && history[0].t < minAllowed) {
    history.shift();
  }
}

function getProjectedIntersection(nowMs) {
  if (history.length < 2) return { text: "No projected intersection yet", seconds: null };
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
  if (dt <= 0) return { text: "No projected intersection yet", seconds: null };

  const warriorRate = (latest.warrior - anchor.warrior) / dt;
  const wizardRate = (latest.wizard - anchor.wizard) / dt;
  const diff = latest.warrior - latest.wizard;
  if (diff === 0) return { text: "Warrior and Wizard hate are intersecting now", seconds: 0 };

  const relativeRate = warriorRate - wizardRate;
  if (Math.abs(relativeRate) < 0.001) return { text: "No projected intersection (gain rates are equal)", seconds: null };
  const secondsToIntersect = -diff / relativeRate;
  if (!Number.isFinite(secondsToIntersect) || secondsToIntersect < 0) {
    return { text: "No projected intersection from current rates", seconds: null };
  }
  return { text: `Projected intersection in ${Math.ceil(secondsToIntersect)}s`, seconds: secondsToIntersect };
}

function findHistoricalIntersections(nowMs) {
  const points = [];
  const minTime = nowMs - WINDOW_MS;
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1];
    const curr = history[i];
    const prevDiff = prev.warrior - prev.wizard;
    const currDiff = curr.warrior - curr.wizard;
    if (prev.t < minTime && curr.t < minTime) continue;
    if (prevDiff === 0) {
      points.push({ t: prev.t, v: prev.warrior });
      continue;
    }
    if (currDiff === 0) {
      points.push({ t: curr.t, v: curr.warrior });
      continue;
    }
    if (prevDiff * currDiff < 0) {
      const ratio = Math.abs(prevDiff) / (Math.abs(prevDiff) + Math.abs(currDiff));
      const t = prev.t + (curr.t - prev.t) * ratio;
      const v = prev.warrior + (curr.warrior - prev.warrior) * ratio;
      points.push({ t, v });
    }
  }
  return points;
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

  const padL = 36 * dpr;
  const padR = 10 * dpr;
  const padT = 10 * dpr;
  const padB = 22 * dpr;
  const graphW = Math.max(1, width - padL - padR);
  const graphH = Math.max(1, height - padT - padB);

  const minTime = nowMs - WINDOW_MS;
  const maxTime = nowMs;
  const visible = history.filter((p) => p.t >= minTime);
  let maxValue = 1;
  for (const p of visible) {
    if (p.warrior > maxValue) maxValue = p.warrior;
    if (p.wizard > maxValue) maxValue = p.wizard;
  }
  maxValue = Math.ceil(maxValue / 50) * 50;

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padT + (graphH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + graphW, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `${10 * dpr}px "Space Grotesk", "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 2; i += 1) {
    const v = (maxValue / 2) * i;
    const y = yForValue(v, 0, maxValue, padT, graphH);
    ctx.fillText(String(Math.round(v)), padL - 6 * dpr, y);
  }

  function drawLine(key, color) {
    if (!visible.length) return;
    ctx.beginPath();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = color;
    for (let i = 0; i < visible.length; i += 1) {
      const point = visible[i];
      const x = xForTime(point.t, minTime, maxTime, padL, graphW);
      const y = yForValue(point[key], 0, maxValue, padT, graphH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLine("warrior", "#ff8c42");
  drawLine("wizard", "#46b0ff");

  const intersections = findHistoricalIntersections(nowMs);
  ctx.fillStyle = "#ffffff";
  for (const cross of intersections) {
    const x = xForTime(clamp(cross.t, minTime, maxTime), minTime, maxTime, padL, graphW);
    const y = yForValue(cross.v, 0, maxValue, padT, graphH);
    ctx.beginPath();
    ctx.arc(x, y, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("-120s", padL, padT + graphH + 4 * dpr);
  ctx.textAlign = "right";
  ctx.fillText("now", padL + graphW, padT + graphH + 4 * dpr);
}

function appendPoint(state) {
  const nowMs = Date.now();
  const point = {
    t: nowMs,
    warrior: Number(state.hate || 0),
    wizard: Number(state.fluxHate || 0),
  };
  const last = history[history.length - 1];
  if (last && nowMs - last.t < 400) {
    history[history.length - 1] = point;
  } else {
    history.push(point);
  }
  pruneHistory(nowMs);
  drawGraph(nowMs);

  const projection = getProjectedIntersection(nowMs);
  intersectionInfoEl.textContent = projection.text;
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

window.addEventListener("resize", () => {
  drawGraph(Date.now());
});
