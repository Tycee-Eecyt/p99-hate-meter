const overlayValue = document.getElementById("overlayHate");

if (window.agroApi && window.agroApi.onOverlayHate) {
  window.agroApi.onOverlayHate((value) => {
    overlayValue.textContent = String(value);
  });
}
