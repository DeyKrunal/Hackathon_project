// Popup script: handles enrollment and saving enrolled face to chrome.storage.local
(async function () {
  const statusText = document.getElementById('statusText');
  const logArea = document.getElementById('logArea');
  const enrollBtn = document.getElementById('enrollBtn');
  const clearBtn = document.getElementById('clearBtn');
  const video = document.getElementById('videoPreview');
  const instructionBox = document.getElementById('instructionBox');
  const monitoringSection = document.getElementById('monitoringSection');
  const monitoringStatus = document.getElementById('monitoringStatus');
  const activeTabsList = document.getElementById('activeTabsList');

  function log(msg) {
    const time = new Date().toLocaleTimeString();
    logArea.innerHTML += `<div>[${time}] ${msg}</div>`;
    logArea.scrollTop = logArea.scrollHeight;
    console.log(msg);
  }

  function showInstructionBox() {
    instructionBox.style.display = 'block';
  }

  function hideInstructionBox() {
    instructionBox.style.display = 'none';
  }

  function showVideo() {
    video.classList.add('active');
  }

  function hideVideo() {
    video.classList.remove('active');
  }

  function updateMonitoringStatus() {
    chrome.tabs.query({}, (tabs) => {
      const monitorableTabs = tabs.filter(t =>
        t.url &&
        !t.url.startsWith('chrome://') &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.startsWith('about:') &&
        !t.url.startsWith('edge://') &&
        !t.url.startsWith('file://')
      );

      if (monitorableTabs.length === 0) {
        monitoringStatus.textContent = 'No active tabs to monitor. Open a webpage to start monitoring.';
        activeTabsList.innerHTML = '';
      } else {
        monitoringStatus.textContent = `Monitoring ${monitorableTabs.length} tab${monitorableTabs.length > 1 ? 's' : ''}:`;
        activeTabsList.innerHTML = monitorableTabs.slice(0, 5).map(t => {
          const title = t.title || 'Untitled';
          const shortTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
          return `<div class="tab-item"><div class="tab-status"></div>${shortTitle}</div>`;
        }).join('');

        if (monitorableTabs.length > 5) {
          activeTabsList.innerHTML += `<div style="padding: 4px 8px; font-size: 11px; color: #888;">...and ${monitorableTabs.length - 5} more</div>`;
        }
      }
    });
  }

  let faceLandmarker = null;
  let stream = null;

  async function initModel() {
    statusText.textContent = 'Loading model...';
    log('Initializing model...');

    try {
      // Load the ESM bundle from extension resources (requires vision_bundle.mjs in extension/lib)
      const base = chrome.runtime.getURL('lib/js-file');
      const bundleUrl = chrome.runtime.getURL('lib/vision_bundle.mjs');

      log(`Importing ESM bundle from ${bundleUrl}`);
      const mod = await import(bundleUrl);
      log('Bundle imported');

      const FilesetResolver = mod.FilesetResolver;
      const FaceLandmarker = mod.FaceLandmarker;

      if (!FilesetResolver || !FaceLandmarker) throw new Error('Bundle missing required exports (FilesetResolver/FaceLandmarker)');

      log(`Calling FilesetResolver.forVisionTasks('${base}')`);
      const vision = await FilesetResolver.forVisionTasks(base);
      log('FilesetResolver.forVisionTasks completed');

      // Preflight checks: verify loader and wasm binary are reachable
      try {
        const loaderUrl = base + '/vision_wasm_internal.js';
        const wasmUrl = base + '/vision_wasm_internal.wasm';
        const nosimdUrl = base + '/vision_wasm_nosimd_internal.js';
        log(`Preflight: checking loader ${loaderUrl}`);
        const loaderResp = await fetch(loaderUrl, { method: 'GET', cache: 'no-cache' });
        log(`Loader fetch status: ${loaderResp.status} ${loaderResp.statusText}`);

        log(`Preflight: checking wasm ${wasmUrl}`);
        const wasmResp = await fetch(wasmUrl, { method: 'GET', cache: 'no-cache' });
        log(`WASM fetch status: ${wasmResp.status} ${wasmResp.statusText}`);

        log(`Preflight: checking nosimd loader ${nosimdUrl}`);
        const nosimdResp = await fetch(nosimdUrl, { method: 'GET', cache: 'no-cache' });
        log(`Nosimd loader fetch status: ${nosimdResp.status} ${nosimdResp.statusText}`);

        // If available, fetch the wasm binary into memory now so we can pass it directly to the loader
        let wasmBuf = null;
        try {
          const wasmFetch = await fetch(wasmUrl);
          log(`WASM binary fetch status (binary fetch): ${wasmFetch.status} ${wasmFetch.statusText}`);
          if (wasmFetch.ok) {
            const wasmAb = await wasmFetch.arrayBuffer();
            wasmBuf = new Uint8Array(wasmAb);
            // Provide Module.wasmBinary and locateFile to the loader so it doesn't re-fetch
            try {
              self.Module = self.Module || {};
              self.Module.wasmBinary = wasmBuf;
              self.Module.locateFile = (path) => {
                // return absolute URL for any requested runtime file
                return base + '/' + path;
              };
              log('WASM binary loaded into Module.wasmBinary and locateFile set');
            } catch (mErr) {
              log('Failed to set Module.wasmBinary/locateFile: ' + (mErr && mErr.message || mErr));
              console.error('Module set error:', mErr);
            }
          } else {
            log('WASM binary fetch returned non-ok status');
          }
        } catch (wasmErr) {
          log('WASM binary fetch failed: ' + (wasmErr && (wasmErr.message || wasmErr.toString())));
          console.error('WASM binary fetch error detail:', wasmErr);
        }
      } catch (preErr) {
        log('Preflight fetch error: ' + (preErr && (preErr.message || preErr.toString())));
        console.error('Preflight error detail:', preErr);
      }

      // Fetch the model asset into memory and use modelAssetBuffer to avoid in-bundle fetch failures
      const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
      let modelBuf = null;
      try {
        log(`Fetching model asset from ${MODEL_URL}`);
        const modelResp = await fetch(MODEL_URL);
        log(`Model fetch status: ${modelResp.status} ${modelResp.statusText}`);
        if (!modelResp.ok) throw new Error(`Model fetch returned ${modelResp.status}`);
        const ab = await modelResp.arrayBuffer();
        modelBuf = new Uint8Array(ab);
        log(`Model asset loaded (${modelBuf.byteLength} bytes)`);
      } catch (modelErr) {
        log('Model fetch failed: ' + (modelErr && (modelErr.message || modelErr.toString())));
        console.error('Model fetch error detail:', modelErr);
        // Don't throw — we'll still try createFromOptions which may attempt its own fetch and show clearer errors
      }

      // Ensure ModuleFactory is present by injecting loader scripts and assigning it if available
      async function ensureModuleFactory() {
        const candidates = [base + '/vision_wasm_internal.js', base + '/vision_wasm_nosimd_internal.js'];
        for (const src of candidates) {
          try {
            if (!document.querySelector(`script[src="${src}"]`)) {
              await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.crossOrigin = 'anonymous';
                s.onload = () => resolve();
                s.onerror = (e) => reject(e);
                (document.head || document.documentElement).appendChild(s);
              });
              log('Injected loader script: ' + src);
            }
          } catch (injectErr) {
            console.warn('Loader injection failed for', src, injectErr);
          }

          if (typeof self.ModuleFactory !== 'function' && typeof window.ModuleFactory === 'function') {
            self.ModuleFactory = window.ModuleFactory;
            log('Assigned ModuleFactory from window.ModuleFactory');
          }

          if (typeof self.ModuleFactory === 'function') break;
        }

        if (typeof self.ModuleFactory !== 'function') {
          log('ModuleFactory still not set after loader injection', 'error');
        }
      }

      await ensureModuleFactory();

      // Try GPU delegate first, fallback to CPU if GPU fails
      async function tryCreate(delegate) {
        try {
          log(`Creating FaceLandmarker with delegate=${delegate}`);

          const baseOptionsObj = { delegate: delegate };
          if (modelBuf) {
            baseOptionsObj.modelAssetBuffer = modelBuf;
          } else {
            baseOptionsObj.modelAssetPath = MODEL_URL;
          }

          const fl = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: baseOptionsObj,
            runningMode: 'VIDEO',
            numFaces: 2
          });
          log(`FaceLandmarker created (delegate=${delegate})`);
          return fl;
        } catch (e) {
          // Detailed inspection for Event-type errors
          let details = '';
          try {
            if (e instanceof Event) {
              details = `Event type=${e.type} target=${e.target && e.target.src || e.target && e.target.href}`;
            } else if (e && (e.message || e.toString)) {
              details = e.message || e.toString();
            } else {
              details = JSON.stringify(e);
            }
          } catch (inspectErr) {
            details = 'Error inspecting exception: ' + inspectErr;
          }

          log(`Delegate ${delegate} failed: ${details}`);
          console.error('Delegate create error detail:', e);
          return null;
        }
      }

      faceLandmarker = await tryCreate('GPU');
      if (!faceLandmarker) {
        log('Retrying with CPU delegate...');
        faceLandmarker = await tryCreate('CPU');
      }

      if (!faceLandmarker) throw new Error('All delegate initializations failed');

      statusText.textContent = 'Model ready';
      log('Model ready');
      return true;
    } catch (err) {
      statusText.textContent = 'Model load failed';
      const msg = err && (err.message || err.toString()) || 'unknown error';
      log('Model load failed: ' + msg);
      console.error('Model init error:', err);
      return false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video.srcObject = stream;
      await video.play();
      return true;
    } catch (err) {
      log('Camera error: ' + err.message);
      return false;
    }
  }

  async function enroll() {
    hideInstructionBox(); // Hide instruction box during enrollment

    // Start camera first so user can see / allow video even if model load fails
    showVideo(); // Show video preview
    const camOk = await startCamera();
    if (!camOk) {
      hideVideo();
      return;
    }

    if (!faceLandmarker) {
      const ok = await initModel();
      if (!ok) {
        log('Model failed to load — enrollment cannot proceed. Please check console for errors.');
        statusText.textContent = 'Model load failed';
        hideVideo();
        // keep camera active for debugging, but abort enrollment
        return;
      }
    }

    statusText.textContent = 'Enrolling...';
    log('Starting multi-angle enrollment...');

    const captures = [];
    const total = 10;

    for (let i = 0; i < total; i++) {
      await new Promise(r => setTimeout(r, 500));
      const res = faceLandmarker.detectForVideo(video, performance.now());
      if (res.faceLandmarks.length === 1) {
        captures.push(res.faceLandmarks[0]);
        log(`Captured ${i + 1}/${total}`);
      } else {
        log(`Skipped frame ${i + 1} (${res.faceLandmarks.length} faces)`);
      }
    }

    if (captures.length < 5) {
      log(`Enrollment failed: only ${captures.length} captures. Try again.`);
      statusText.textContent = 'Enrollment failed';
      hideVideo();
      return;
    }

    // Save to chrome storage
    chrome.storage.local.set({ enrolledFace: captures }, () => {
      statusText.textContent = 'Enrolled ✓';
      log(`Enrolled ${captures.length} poses.`);

      // Hide video after enrollment
      hideVideo();

      // Show instruction box
      showInstructionBox();

      // Show monitoring section
      monitoringSection.style.display = 'block';
      updateMonitoringStatus();

      // notify content scripts
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { type: 'enrollment-updated' }, () => {
            // Suppress "Could not establish connection" errors for tabs without content script
            if (chrome.runtime.lastError) {
              // Silently ignore - tab doesn't have content script loaded
            }
          });
        }
      });
    });
  }

  enrollBtn.onclick = enroll;
  clearBtn.onclick = () => {
    chrome.storage.local.remove('enrolledFace', () => {
      statusText.textContent = 'Enrollment cleared';
      log('Enrollment cleared');

      // Hide instruction box and monitoring section
      hideInstructionBox();
      monitoringSection.style.display = 'none';

      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { type: 'enrollment-updated' }, () => {
            // Suppress "Could not establish connection" errors for tabs without content script
            if (chrome.runtime.lastError) {
              // Silently ignore - tab doesn't have content script loaded
            }
          });
        }
      });
    });
  };

  // Show current enrollment status and monitoring info on popup open
  chrome.storage.local.get(['enrolledFace'], (res) => {
    if (res.enrolledFace) {
      statusText.textContent = 'Enrolled ✓';
      log(`Enrolled with ${res.enrolledFace.length} poses`);

      // Show monitoring section and update status
      monitoringSection.style.display = 'block';
      updateMonitoringStatus();

      // Check if there are any monitorable tabs
      chrome.tabs.query({}, (tabs) => {
        const monitorableTabs = tabs.filter(t =>
          t.url &&
          !t.url.startsWith('chrome://') &&
          !t.url.startsWith('chrome-extension://') &&
          !t.url.startsWith('about:')
        );

        if (monitorableTabs.length === 0) {
          // No tabs to monitor, show instruction
          showInstructionBox();
        }
      });
    } else {
      statusText.textContent = 'Not Enrolled';
      hideInstructionBox();
      monitoringSection.style.display = 'none';
    }
  });
})();