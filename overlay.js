const overlayValue = document.getElementById("overlayHate");
const overlayName = document.getElementById("overlayName");

if (window.agroApi && window.agroApi.onOverlayState) {
  window.agroApi.onOverlayState((state) => {
    if (!state) return;
    overlayName.textContent = state.mobName ? state.mobName : "No Target";
    overlayValue.textContent = String(state.hate || 0);
  });
}
