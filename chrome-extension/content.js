chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "BLUR") {
    document.body.style.filter = "blur(20px) brightness(0.7)";
    document.body.style.transition = "filter 0.3s ease";
  } else if (request.action === "UNBLUR") {
    document.body.style.filter = "none";
  }
});