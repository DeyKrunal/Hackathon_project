document.getElementById('enableCam').addEventListener('click', async () => {
  try {
    // This triggers the ACTUAL browser permission dialog
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop()); // Stop it immediately
    alert("Permission granted! You can close this tab.");
    window.close();
  } catch (err) {
    console.error("Permission denied", err);
  }
});