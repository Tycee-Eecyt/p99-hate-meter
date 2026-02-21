const overlayValue = document.getElementById("overlayHate");
const overlayName = document.getElementById("overlayName");
const overlayFluxCount = document.getElementById("overlayFluxCount");
const overlayFluxHate = document.getElementById("overlayFluxHate");
const overlayResetBtn = document.getElementById("overlayResetBtn");
const overlayLoadInventoryBtn = document.getElementById("overlayLoadInventoryBtn");
const overlayProcCount = document.getElementById("overlayProcCount");
const overlayProcHate = document.getElementById("overlayProcHate");
const overlayResetCountdown = document.getElementById("overlayResetCountdown");
let overlayResetAtMs = 0;

function renderOverlayCountdown() {
  if (!overlayResetCountdown) return;
  if (!overlayResetAtMs) {
    overlayResetCountdown.textContent = "Ready";
    return;
  }
  const remaining = Math.max(0, Math.ceil((overlayResetAtMs - Date.now()) / 1000));
  overlayResetCountdown.textContent = remaining > 0 ? `${remaining}s` : "Ready";
}

if (window.agroApi && window.agroApi.onOverlayState) {
  window.agroApi.onOverlayState((state) => {
    if (!state) return;
    overlayName.textContent = state.mobName ? state.mobName : "No Target";
    overlayValue.textContent = String(state.hate || 0);
    overlayFluxCount.textContent = String(state.fluxCount || 0);
    overlayFluxHate.textContent = String(state.fluxHate || 0);
    overlayProcCount.textContent = String(state.procCount || 0);
    overlayProcHate.textContent = String(state.procHate || 0);
    overlayResetAtMs = Number(state.resetAtMs || 0);
    if (!overlayResetAtMs) {
      const fallbackRemaining = Number(state.resetCountdown || 0);
      overlayResetAtMs = fallbackRemaining > 0 ? Date.now() + fallbackRemaining * 1000 : 0;
    }
    renderOverlayCountdown();
  });
}

setInterval(renderOverlayCountdown, 250);

if (overlayResetBtn && window.agroApi && window.agroApi.requestResetHate) {
  overlayResetBtn.addEventListener("click", () => {
    window.agroApi.requestResetHate();
  });
}

if (overlayLoadInventoryBtn && window.agroApi && window.agroApi.requestLoadInventory) {
  overlayLoadInventoryBtn.addEventListener("click", () => {
    window.agroApi.requestLoadInventory();
  });
}
