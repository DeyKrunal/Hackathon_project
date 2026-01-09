// Privacy Shield AI - Background Service Worker
// Central controller for the extension

let isMonitoring = false;
let creatingOffscreen = null;

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    console.log('Offscreen document already exists.');
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.USER_MEDIA],
      justification: 'MediaPipe FaceLandmarker for AI engine operations and camera access.'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
    console.log('Offscreen document created successfully.');
  }
}

// Start monitoring process
async function startMonitoring() {
  try {
    // Check if user is registered
    const result = await chrome.storage.local.get(['isRegistered', 'enrolledFace']);

    if (!result.isRegistered || !result.enrolledFace) {
      // Open registration page
      chrome.tabs.create({ url: chrome.runtime.getURL('register.html') });
      return;
    }

    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Initialize FaceLandmarker in offscreen document
    await chrome.runtime.sendMessage({ type: 'INIT_FACELANDMARKER_IN_OFFSCREEN' });

    // Push enrolled face data to offscreen document
    await chrome.runtime.sendMessage({
      type: 'PUSH_DATA',
      payload: { enrolledFace: result.enrolledFace }
    });

    isMonitoring = true;
    console.log('Monitoring started successfully.');
  } catch (error) {
    console.error('Error starting monitoring:', error);
  }
}

// Stop monitoring process
async function stopMonitoring() {
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_MONITORING' });
    isMonitoring = false;
    console.log('Monitoring stopped.');
  } catch (error) {
    console.error('Error stopping monitoring:', error);
  }
}

// Check if current tab URL is in site list
async function shouldBlurCurrentTab(shouldBlur) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.url) return;

    const result = await chrome.storage.local.get(['siteList']);
    const siteList = result.siteList || [];

    // Extract domain from URL
    const url = new URL(activeTab.url);
    const domain = url.hostname.replace('www.', '');

    // Check if current domain is in site list
    const isProtectedSite = siteList.some(site => domain.includes(site));

    if (isProtectedSite) {
      // Send blur/unblur message to content script
      const action = shouldBlur ? 'BLUR' : 'UNBLUR';
      chrome.tabs.sendMessage(activeTab.id, { type: action }).catch(err => {
        console.log('Content script not ready yet:', err);
      });
    }
  } catch (error) {
    console.error('Error checking tab URL:', error);
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_MONITORING') {
    startMonitoring().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'STOP_MONITORING_REQUEST') {
    stopMonitoring().then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'DETECTION_RESULT') {
    if (isMonitoring && message.payload) {
      shouldBlurCurrentTab(message.payload.shouldBlur);
    }
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'GET_MONITORING_STATUS') {
    sendResponse({ isMonitoring });
    return true;
  }
});

// Listen for tab changes to re-evaluate blur status
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (isMonitoring) {
    // Trigger a detection result check for the new tab
    // The offscreen document will continue sending results
  }
});

// Listen for tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isMonitoring && changeInfo.url) {
    // Re-evaluate blur status when URL changes
  }
});

console.log('Privacy Shield AI - Background service worker loaded.');