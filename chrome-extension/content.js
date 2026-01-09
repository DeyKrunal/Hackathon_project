// Privacy Shield AI - Content Script
// Applies blur effect to web pages based on detection results

// Listen for blur/unblur messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLUR') {
    // Apply blur effect
    document.documentElement.style.filter = 'blur(30px)';
    document.documentElement.style.transition = 'filter 0.3s ease';
    console.log('Privacy Shield AI: Page blurred - unauthorized viewer detected');
  } else if (message.type === 'UNBLUR') {
    // Remove blur effect
    document.documentElement.style.filter = 'none';
    console.log('Privacy Shield AI: Page unblurred - authorized user detected');
  }

  sendResponse({ success: true });
});

console.log('Privacy Shield AI - Content script loaded');