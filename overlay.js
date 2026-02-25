const overlayValue = document.getElementById("overlayHate");
const overlayName = document.getElementById("overlayName");
const overlayFluxCount = document.getElementById("overlayFluxCount");
const overlayFluxHate = document.getElementById("overlayFluxHate");
const overlayDamage = document.getElementById("overlayDamage");
const overlayProcCount = document.getElementById("overlayProcCount");
const overlayProcHate = document.getElementById("overlayProcHate");
const overlayEqualFluxNeeded = document.getElementById("overlayEqualFluxNeeded");
const overlayResetCountdown = document.getElementById("overlayResetCountdown");
const overlayPrimaryWeapon = document.getElementById("overlayPrimaryWeapon");
const overlaySecondaryWeapon = document.getElementById("overlaySecondaryWeapon");
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
    const warriorHate = Number(state.hate || 0);
    const wizardHate = Number(state.fluxHate || 0);
    overlayValue.textContent = String(warriorHate);
    overlayDamage.textContent = String(state.damage || 0);
    overlayFluxCount.textContent = String(state.fluxCount || 0);
    overlayFluxHate.textContent = String(wizardHate);
    overlayProcCount.textContent = String(state.procCount || 0);
    overlayProcHate.textContent = String(state.procHate || 0);
    const gap = Math.max(0, warriorHate - wizardHate);
    overlayEqualFluxNeeded.textContent = String(Math.ceil(gap / 50));
    overlayPrimaryWeapon.textContent = String(state.primaryWeapon || "Primary: Unknown");
    overlaySecondaryWeapon.textContent = String(state.secondaryWeapon || "Secondary: Unknown");
    overlayResetAtMs = Number(state.resetAtMs || 0);
    if (!overlayResetAtMs) {
      const fallbackRemaining = Number(state.resetCountdown || 0);
      overlayResetAtMs = fallbackRemaining > 0 ? Date.now() + fallbackRemaining * 1000 : 0;
    }
    renderOverlayCountdown();
  });
}

setInterval(renderOverlayCountdown, 250);
