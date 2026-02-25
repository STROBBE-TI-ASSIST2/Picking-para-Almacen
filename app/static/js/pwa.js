document.addEventListener("DOMContentLoaded", async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    console.log("SW registrado ✅");
  } catch (e) {
    console.error("SW error ❌", e);
  }
});
