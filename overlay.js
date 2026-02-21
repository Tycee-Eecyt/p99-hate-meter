const overlayValue = document.getElementById("overlayHate");
const overlayName = document.getElementById("overlayName");
const overlayFluxCount = document.getElementById("overlayFluxCount");
const overlayFluxHate = document.getElementById("overlayFluxHate");
const overlayResetBtn = document.getElementById("overlayResetBtn");

if (window.agroApi && window.agroApi.onOverlayState) {
  window.agroApi.onOverlayState((state) => {
    if (!state) return;
    overlayName.textContent = state.mobName ? state.mobName : "No Target";
    overlayValue.textContent = String(state.hate || 0);
    overlayFluxCount.textContent = String(state.fluxCount || 0);
    overlayFluxHate.textContent = String(state.fluxHate || 0);
  });
}

if (overlayResetBtn && window.agroApi && window.agroApi.requestResetHate) {
  overlayResetBtn.addEventListener("click", () => {
    window.agroApi.requestResetHate();
  });
}
