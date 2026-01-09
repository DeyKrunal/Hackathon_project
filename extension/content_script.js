// Content script: injects an overlay and runs monitoring using the same model as the web app.
// NOTE: You must copy the project's `lib/js-file` folder into `extension/lib/js-file` before loading the extension.

(async function () {
  // UI: add blur overlay
  const overlayId = 'privacyshield-blur-overlay';
  if (!document.getElementById(overlayId)) {
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.right = 0;
    overlay.style.bottom = 0;
    overlay.style.background = 'rgba(255,255,255,0.4)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.zIndex = 999999999;
    overlay.style.display = 'none';
    overlay.style.transition = 'opacity 0.3s ease-in-out';
    overlay.style.opacity = 0;
    overlay.innerHTML = '<div style="position:absolute;top:20px;left:20px;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:6px;">PrivacyShield: Intruder detected</div>';
    document.documentElement.appendChild(overlay);
  }

  // UI: Status indicator widget
  const statusWidgetId = 'privacyshield-status-widget';
  if (!document.getElementById(statusWidgetId)) {
    const widget = document.createElement('div');
    widget.id = statusWidgetId;
    widget.innerHTML = `
      <div id="ps-widget-content" style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, rgba(30,30,30,0.95) 0%, rgba(50,50,50,0.95) 100%);
        color: #fff;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999998;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        min-width: 220px;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 1px solid rgba(255,255,255,0.1);
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #888;">🛡️ PrivacyShield</div>
          <div id="ps-minimize-btn" style="cursor: pointer; font-size: 16px; opacity: 0.7; padding: 0 4px;">−</div>
        </div>
        <div id="ps-status-text" style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">⚙️ Initializing...</div>
        <div id="ps-detail-text" style="font-size: 11px; opacity: 0.7; margin-top: 4px;"></div>
      </div>
      <div id="ps-widget-minimized" style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, rgba(30,30,30,0.95) 0%, rgba(50,50,50,0.95) 100%);
        color: #fff;
        padding: 10px 14px;
        border-radius: 50%;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999998;
        font-size: 18px;
        cursor: pointer;
        display: none;
        transition: all 0.3s ease;
        border: 1px solid rgba(255,255,255,0.1);
      ">🛡️</div>
    `;
    document.documentElement.appendChild(widget);
    console.log('[PrivacyShield] Status widget created');

    // Toggle minimize/maximize
    let isMinimized = false;
    const contentDiv = document.getElementById('ps-widget-content');
    const minimizedDiv = document.getElementById('ps-widget-minimized');
    const minimizeBtn = document.getElementById('ps-minimize-btn');

    const toggleMinimize = () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        contentDiv.style.display = 'none';
        minimizedDiv.style.display = 'block';
      } else {
        contentDiv.style.display = 'block';
        minimizedDiv.style.display = 'none';
      }
    };

    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMinimize();
    });
    minimizedDiv.addEventListener('click', toggleMinimize);
  }

  function updateStatusWidget(status, detail = '') {
    const statusText = document.getElementById('ps-status-text');
    const detailText = document.getElementById('ps-detail-text');
    if (!statusText) return;

    const statusConfig = {
      'initializing': { icon: '⚙️', text: 'Initializing...', color: '#888' },
      'not-enrolled': { icon: '⏸️', text: 'Not Enrolled', color: '#ff9800' },
      'monitoring': { icon: '👁️', text: 'Monitoring Active', color: '#4CAF50' },
      'authorized': { icon: '✅', text: 'Authorized', color: '#4CAF50' },
      'no-face': { icon: '🟡', text: 'No Face Detected', color: '#ffc107' },
      'intruder': { icon: '🚨', text: 'Intruder Detected', color: '#f44336' },
      'multiple': { icon: '👥', text: 'Multiple Faces', color: '#f44336' },
      'error': { icon: '⚠️', text: 'Error', color: '#ff5722' }
    };

    const config = statusConfig[status] || statusConfig['initializing'];
    statusText.innerHTML = `${config.icon} ${config.text}`;
    statusText.style.color = config.color;

    if (detailText) {
      detailText.textContent = detail;
      detailText.style.display = detail ? 'block' : 'none';
    }
  }

  function setBlur(active) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    if (active) {
      overlay.style.display = 'block';
      // Force reflow for transition
      overlay.offsetHeight;
      overlay.style.opacity = 1;
    } else {
      overlay.style.opacity = 0;
      setTimeout(() => {
        if (overlay.style.opacity === '0') {
          overlay.style.display = 'none';
        }
      }, 300);
    }
  }

  // Load enrolled face data from extension storage
  async function getEnrolledFace() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['enrolledFace'], (res) => resolve(res.enrolledFace || null));
      } catch (e) {
        // Fallback if chrome.storage isn't available (e.g., in some dev contexts)
        const raw = localStorage.getItem('enrolledFace');
        resolve(raw ? JSON.parse(raw) : null);
      }
    });
  }

  // Listen for enrollment updates from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'enrollment-updated') {
      // restart monitoring if needed
      startMonitoring();
    }
  });

  // Track tab visibility changes (for debugging - monitoring continues even when tab is hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      console.log('[PrivacyShield] ⚠️ Tab became INACTIVE - monitoring continues in background');
      updateStatusWidget('monitoring', 'Running in background...');
    } else {
      console.log('[PrivacyShield] ✓ Tab became ACTIVE - monitoring continues');
    }
  });


  // Attempt to load MediaPipe bundle by injecting it into the page as a module and assigning globals.
  function injectModuleAsGlobals(moduleUrl) {
    return new Promise((resolve, reject) => {
      // don't inject twice
      if (document.querySelector(`script[data-ps-module="${moduleUrl}"]`)) return resolve();

      const s = document.createElement('script');
      s.type = 'module';
      s.setAttribute('data-ps-module', moduleUrl);
      // inline module imports the ESM bundle and assigns exports to window for page scope access
      s.textContent = `import * as m from "${moduleUrl}"; window.FilesetResolver = m.FilesetResolver; window.FaceLandmarker = m.FaceLandmarker;`;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      (document.head || document.documentElement).appendChild(s);

      // Some browsers don't fire load for inline module; resolve shortly after injection
      setTimeout(() => resolve(), 300);
    });
  }

  // Main monitoring logic (mirrors the app.js logic but adapted for content script)
  let faceLandmarker = null;
  let videoEl = null;
  let stream = null;
  let monitoring = false;

  async function initModel() {
    updateStatusWidget('initializing', 'Loading AI model...');

    // Polyfill for MediaPipe WASM debugging (fixes ReferenceError: custom_dbg is not defined)
    self.custom_dbg = (x) => console.log('[WASM DBG]', x);
    self.custom_println = (x) => console.log('[WASM LOG]', x);
    self.custom_emscripten_dbgn = (x) => console.log('[WASM EM_DBG]', x);

    // Load the vision ESM bundle directly in content script context (not page context)
    const base = chrome.runtime.getURL('lib/js-file');
    const moduleUrl = chrome.runtime.getURL('lib/vision_bundle.mjs');

    try {
      console.log('[PrivacyShield] Importing module from:', moduleUrl);

      // Import the module directly - this works in content script isolated world
      const mod = await import(moduleUrl);

      console.log('[PrivacyShield] ✅ Module imported successfully');

      const FilesetResolver = mod.FilesetResolver;
      const FaceLandmarker = mod.FaceLandmarker;

      if (!FilesetResolver || !FaceLandmarker) {
        throw new Error('Bundle missing required exports (FilesetResolver/FaceLandmarker)');
      }

      console.log('[PrivacyShield] Creating vision fileset with base:', base);

      // Pass the base path as a string (MediaPipe will find WASM files there)
      const vision = await FilesetResolver.forVisionTasks(base);

      console.log('[PrivacyShield] ✅ Vision fileset created');

      // Preflight: check loader/wasm/nosimd availability
      try {
        const loaderUrl = base + '/vision_wasm_internal.js';
        const wasmUrl = base + '/vision_wasm_internal.wasm';
        const nosimdUrl = base + '/vision_wasm_nosimd_internal.js';
        console.log('Preflight loader:', loaderUrl);
        const l = await fetch(loaderUrl, { method: 'GET', cache: 'no-cache' });
        console.log('Loader status', l.status);

        // Also fetch the raw wasm binary and set it on Module so loader doesn't need to fetch it later
        try {
          const wb = await fetch(wasmUrl);
          console.log('WASM binary fetch status', wb.status);
          if (wb.ok) {
            const wasmAb = await wb.arrayBuffer();
            const wasmBuf = new Uint8Array(wasmAb);
            try {
              self.Module = self.Module || {};
              self.Module.wasmBinary = wasmBuf;
              self.Module.locateFile = (path) => base + '/' + path;
              console.log('Content script set Module.wasmBinary and locateFile');
            } catch (mErr) {
              console.warn('Failed to set Module in content script', mErr);
            }
          }
        } catch (wbErr) {
          console.warn('WASM fetch failed in content script', wbErr);
        }

        const w = await fetch(wasmUrl, { method: 'GET', cache: 'no-cache' });
        console.log('WASM status', w.status);
        const n = await fetch(nosimdUrl, { method: 'GET', cache: 'no-cache' });
        console.log('Nosimd status', n.status);
      } catch (pfErr) {
        console.warn('Content script preflight error', pfErr);
      }

      // Fetch model asset into memory to avoid remote fetch failures inside bundle
      updateStatusWidget('initializing', 'Downloading model...');
      const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
      let modelBuf = null;
      try {
        console.log('Content script fetching model...');
        const modelResp = await fetch(MODEL_URL);
        console.log('Model fetch status', modelResp.status);
        if (modelResp.ok) {
          const ab = await modelResp.arrayBuffer();
          modelBuf = new Uint8Array(ab);
          console.log('Model buffered', modelBuf.byteLength);
        } else {
          console.warn('Model fetch returned non-ok status', modelResp.status);
        }
      } catch (mErr) {
        console.warn('Model fetch failed in content script', mErr);
      }

      // Ensure ModuleFactory is present: import loader module directly
      updateStatusWidget('initializing', 'Preparing runtime...');
      async function ensureModuleFactory() {
        if (typeof self.ModuleFactory === 'function') return;

        const candidates = [base + '/vision_wasm_internal.mjs', base + '/vision_wasm_nosimd_internal.mjs'];
        for (const src of candidates) {
          try {
            console.log('Importing loader module:', src);
            const module = await import(src);
            if (module && typeof module.ModuleFactory === 'function') {
              self.ModuleFactory = module.ModuleFactory;
              console.log('ModuleFactory loaded successfully from', src);
              break;
            }
          } catch (e) {
            console.warn('Failed to import loader:', src, e);
          }
        }

        if (typeof self.ModuleFactory !== 'function') {
          console.warn('ModuleFactory still not set after module import');
          updateStatusWidget('error', 'Runtime load failed');
        }
      }

      await ensureModuleFactory();

      // try GPU first, then CPU fallback
      updateStatusWidget('initializing', 'Creating face detector...');
      async function tryCreate(delegate) {
        try {
          const baseOptionsObj = { delegate };
          if (modelBuf) baseOptionsObj.modelAssetBuffer = modelBuf;
          else baseOptionsObj.modelAssetPath = MODEL_URL;

          console.log('Creating FaceLandmarker delegate=', delegate);
          const fl = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: baseOptionsObj,
            runningMode: "VIDEO",
            numFaces: 2
          });
          console.log('FaceLandmarker created', delegate);
          return fl;
        } catch (e) {
          console.error('FaceLandmarker create error delegate=' + delegate, e);
          return null;
        }
      }

      faceLandmarker = await tryCreate('GPU');
      if (!faceLandmarker) faceLandmarker = await tryCreate('CPU');

      if (faceLandmarker) {
        console.log('[PrivacyShield] Model initialized successfully');
        updateStatusWidget('monitoring', 'Model ready');
      } else {
        updateStatusWidget('error', 'Failed to create detector');
      }

      return !!faceLandmarker;
    } catch (err) {
      console.error('Error initializing FaceLandmarker', err);
      updateStatusWidget('error', err.message || 'Initialization failed');
      return false;
    }
  }

  async function startCameraAndPredict(enrolledFace) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Camera API not available in this tab');
      return;
    }

    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.style.display = 'none';
      videoEl.setAttribute('playsinline', '');
      document.body.appendChild(videoEl);
    }

    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        videoEl.srcObject = stream;
        await videoEl.play();
      }
    } catch (err) {
      console.error('Camera access denied or not available', err);
      return;
    }

    monitoring = true;
    updateStatusWidget('monitoring', 'Scanning for faces...');
    console.log('[PrivacyShield] Monitoring started');

    // Use setInterval instead of setTimeout for more reliable background execution
    let monitoringInterval = setInterval(() => {
      if (!monitoring || !faceLandmarker || !videoEl || videoEl.readyState < 2) {
        // Don't stop the interval, just skip this iteration
        return;
      }

      try {
        const results = faceLandmarker.detectForVideo(videoEl, performance.now());
        let shouldBlur = false;
        let statusType = 'monitoring';
        let statusDetail = '';

        if (!enrolledFace) {
          // if not enrolled, don't blur
          shouldBlur = false;
          statusType = 'not-enrolled';
          statusDetail = 'Please enroll your face first';
        } else if (results.faceLandmarks.length === 0) {
          // optional: if no face, you could blur or not; current behavior is do NOT blur when no face
          shouldBlur = false;
          statusType = 'no-face';
          statusDetail = 'Looking for faces...';
        } else if (results.faceLandmarks.length > 1) {
          shouldBlur = true;
          statusType = 'multiple';
          statusDetail = `${results.faceLandmarks.length} people detected`;
          console.warn(`[PrivacyShield] ⚠️ BLUR TRIGGERED: Multiple faces detected (${results.faceLandmarks.length})`);
        } else if (results.faceLandmarks.length === 1) {
          const live = results.faceLandmarks[0];
          const authResult = isAuthorizedUser(live, enrolledFace);
          const authorized = authResult.authorized;
          const distance = authResult.distance;

          if (!authorized) {
            shouldBlur = true;
            statusType = 'intruder';
            statusDetail = `Distance: ${distance.toFixed(3)} (threshold: 0.05)`;
            console.warn(`[PrivacyShield] 🚨 BLUR TRIGGERED: Unauthorized face (distance: ${distance.toFixed(3)})`);
          } else {
            shouldBlur = false;
            statusType = 'authorized';
            statusDetail = `Distance: ${distance.toFixed(3)} ✓`;
            // Only log occasionally to reduce console spam
            if (Math.random() < 0.1) { // Log ~10% of the time
              console.log(`[PrivacyShield] ✅ Authorized user (distance: ${distance.toFixed(3)})`);
            }
          }
        }

        setBlur(shouldBlur);
        updateStatusWidget(statusType, statusDetail);
      } catch (err) {
        console.error('[PrivacyShield] Error in monitoring loop:', err);
      }
    }, 500); // Run every 500ms

    // Store interval ID so we can clear it later if needed
    window._psMonitoringInterval = monitoringInterval;

    console.log('[PrivacyShield] Monitoring interval started (runs every 500ms, even in background)');
  }

  function isAuthorizedUser(liveFace, enrolledFaceData) {
    if (!enrolledFaceData || !liveFace) return { authorized: false, distance: 999 };
    const descriptors = Array.isArray(enrolledFaceData) ? enrolledFaceData : [enrolledFaceData];
    const pointsToCompare = [1, 4, 152, 33, 263, 61, 291];

    let minDistance = 999;

    for (const enrolledPose of descriptors) {
      let totalDistance = 0;
      pointsToCompare.forEach(index => {
        const p1 = liveFace[index];
        const p2 = enrolledPose[index];
        const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
        totalDistance += dist;
      });

      const averageDistance = totalDistance / pointsToCompare.length;
      if (averageDistance < minDistance) {
        minDistance = averageDistance;
      }

      if (averageDistance < 0.05) {
        return { authorized: true, distance: averageDistance };
      }
    }

    return { authorized: false, distance: minDistance };
  }


  // Top-level control: initialize model and start monitoring if enrolled
  async function startMonitoring() {
    console.log('[PrivacyShield] 🚀 Content script loaded - starting monitoring...');

    const enrolledFace = await getEnrolledFace();

    if (!enrolledFace) {
      console.log('[PrivacyShield] ⚠️ No enrolled face found - waiting for enrollment');
      updateStatusWidget('not-enrolled', 'Please enroll your face first');
      return;
    }

    console.log(`[PrivacyShield] ✓ Enrolled face data found (${enrolledFace.length} poses)`);

    if (!faceLandmarker) {
      console.log('[PrivacyShield] Initializing face detection model...');
      const ok = await initModel();
      if (!ok) {
        console.error('[PrivacyShield] ❌ Model initialization failed - monitoring cannot start');
        updateStatusWidget('error', 'Model failed to load');
        return;
      }
    }

    console.log('[PrivacyShield] ✓ Model ready, starting camera...');
    await startCameraAndPredict(enrolledFace);
  }

  // Start immediately when content script loads
  console.log('[PrivacyShield] Content script injected into page:', window.location.href);
  startMonitoring();
})();
