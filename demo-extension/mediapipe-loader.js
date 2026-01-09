// MediaPipe Loader for Chrome Extension
// Loads MediaPipe as a module and exposes globals

(async function() {
  try {
    const wasmDir = chrome.runtime.getURL('js-file/');

    // Patch fetch to remap missing nosimd filenames to the available internal files
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try {
        let url = typeof input === 'string' ? input : input && input.url ? input.url : '';

        if (url && (url.includes('vision_wasm_nosimd') || url.includes('vision_wasm_simd') || url.endsWith('vision_wasm_internal.wasm') === false && url.endsWith('.wasm') && url.includes('vision_wasm'))) {
          // Redirect any requested vision_wasm_* file to the bundled internal wasm
          const mappedWasm = wasmDir + 'vision_wasm_internal.wasm';
          return originalFetch(mappedWasm, init);
        }

        if (url && url.includes('vision_wasm_nosimd_internal.js')) {
          // Map nosimd js loader to the available internal js
          const mappedJs = wasmDir + 'vision_wasm_internal.js';
          return originalFetch(mappedJs, init);
        }

        return originalFetch(input, init);
      } catch (e) {
        return originalFetch(input, init);
      }
    };

    // Preload the wasm binary as ArrayBuffer and set a global Module.wasmBinary
    // so Emscripten-style glue can avoid streaming paths that may trigger CSP.
    try {
      const wasmUrl = wasmDir + 'vision_wasm_internal.wasm';
      const resp = await fetch(wasmUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        window.Module = window.Module || {};
        try {
          // Emscripten checks Module.wasmBinary (Uint8Array) in some builds
          window.Module.wasmBinary = new Uint8Array(buf);
        } catch (e) {
          window.Module.wasmBinary = buf;
        }
      } else {
        console.warn('Failed to preload wasm binary, status', resp.status);
      }
    } catch (e) {
      console.warn('Error preloading wasm binary', e);
    }

    // Ensure wasm internal JS (defines ModuleFactory) is loaded next
    const wasmLoaderUrl = chrome.runtime.getURL('js-file/vision_wasm_internal.js');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = wasmLoaderUrl;
      s.onload = () => resolve();
      s.onerror = (e) => reject(new Error('Failed to load vision_wasm_internal.js'));
      document.head.appendChild(s);
    });

    const visionBundleUrl = chrome.runtime.getURL('js-file/vision_bundle.js');
    const module = await import(visionBundleUrl);

    window.FilesetResolver = module.FilesetResolver;
    window.FaceLandmarker = module.FaceLandmarker;
    window.MediaPipeLoaded = true;

    console.log('MediaPipe loaded successfully');
    window.dispatchEvent(new CustomEvent('mediapipe-ready'));
  } catch (error) {
    console.error('Failed to load MediaPipe:', error);
    window.dispatchEvent(new CustomEvent('mediapipe-error', { detail: error }));
  }
})();
