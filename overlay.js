const overlayValue = document.getElementById("overlayHate");
const overlayName = document.getElementById("overlayName");
const overlayFluxCount = document.getElementById("overlayFluxCount");
const overlayFluxHate = document.getElementById("overlayFluxHate");
const overlayResetBtn = document.getElementById("overlayResetBtn");
const overlayProcCount = document.getElementById("overlayProcCount");
const overlayProcHate = document.getElementById("overlayProcHate");
const overlayResetCountdown = document.getElementById("overlayResetCountdown");

if (window.agroApi && window.agroApi.onOverlayState) {
  window.agroApi.onOverlayState((state) => {
    if (!state) return;
    overlayName.textContent = state.mobName ? state.mobName : "No Target";
    overlayValue.textContent = String(state.hate || 0);
    overlayFluxCount.textContent = String(state.fluxCount || 0);
    overlayFluxHate.textContent = String(state.fluxHate || 0);
    overlayProcCount.textContent = String(state.procCount || 0);
    overlayProcHate.textContent = String(state.procHate || 0);
    const remaining = Number(state.resetCountdown || 0);
    overlayResetCountdown.textContent = remaining > 0 ? `${remaining}s` : "Ready";
  });
}

if (overlayResetBtn && window.agroApi && window.agroApi.requestResetHate) {
  overlayResetBtn.addEventListener("click", () => {
    window.agroApi.requestResetHate();
  });
}
