let isMonitoring = false;

// Unified message listener to handle all actions
chrome.runtime.onMessage.addListener(async (message) => {
  switch (message.type || message.action) {
    case 'DETECTION_RESULT':
      handleBlurLogic(message.shouldBlur);
      break;

    case 'START_MONITORING':
      const data = await chrome.storage.local.get(['isRegistered', 'enrolledFace']);
      if (!data.isRegistered || !data.enrolledFace) {
        console.log("Not registered. Redirecting...");
        chrome.tabs.create({ url: 'register.html' });
      } else {
        await startMonitoringFlow();
      }
      break;

    case 'STOP_MONITORING':
      await stopMonitoringFlow();
      break;

    case 'ENROLLMENT_COMPLETE':
      console.log("Enrollment success. Initializing AI...");
      chrome.notifications.create({
        type: 'basic',
        title: "Enrollment Successful",
        message: "Enrollment Successful Done! AI monitoring is starting."
      });
      await startMonitoringFlow(); // Now it starts the camera
      break;

    case 'SHOW_NOTIFICATION':
      chrome.notifications.create({
        type: 'basic',
        title: message.title,
        message: message.message
      });
      break;
  }
});

// 2. Filter Blur Commands by Site List
async function handleBlurLogic(shouldBlur) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url.startsWith('chrome://')) return;

    // Get the user's protected site list from storage
    const { siteList = [] } = await chrome.storage.local.get('siteList');

    // Check if the current tab URL matches any site in the user's list
    const isProtectedSite = siteList.some(site => tab.url.includes(site));

    // Only send the blur/unblur command if the site is in the list
    if (isProtectedSite) {
      chrome.tabs.sendMessage(tab.id, { action: shouldBlur ? "BLUR" : "UNBLUR" })
        .catch(() => console.warn("Content script not ready."));
    } else {
      // Force unblur if user navigates away from a protected site
      chrome.tabs.sendMessage(tab.id, { action: "UNBLUR" }).catch(() => {});
    }
  } catch (err) {
    console.error("Filtering error:", err);
  }
}

// ... (Your existing startMonitoringFlow and ensureOffscreenDocument functions)

async function startMonitoringFlow() {
  // Prime camera permission: Check if already granted
  // Service Workers can't call getUserMedia, so we check status via Permissions API
  const permissionStatus = await navigator.permissions.query({ name: 'camera' });

  if (permissionStatus.state !== 'granted') {
    console.log("Camera permission not granted. Opening setup page...");
    // Create a visible tab to ask the user for camera access
    chrome.tabs.create({ url: 'setup.html' });
  } else {
    // Permission is already granted, create the offscreen document
    await ensureOffscreenDocument();
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Real-time face detection for screen privacy'
  });

  // WAIT for the document to load, then push the data
  const data = await chrome.storage.local.get('enrolledFace');
  // Small delay to ensure offscreen.js is listening
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: "PUSH_ENROLLED_DATA",
      enrolledFace: data.enrolledFace
    });
  }, 1000);
}

async function stopMonitoringFlow() {
  // 1. Tell offscreen to stop camera tracks immediately
  chrome.runtime.sendMessage({ action: 'STOP_AI' }).catch(() => {
    // Catch error if offscreen is already closed
  });

  // 2. Close the offscreen context entirely
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
    console.log("Offscreen document closed.");
  }

  // 3. Force unblur on all tabs when stopping
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    chrome.tabs.sendMessage(tab.id, { action: "UNBLUR" }).catch(() => {});
  });
}