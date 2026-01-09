document.getElementById('toggleBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'START_MONITORING' });
  document.getElementById('statusText').innerText = "On";
});