PrivacyShield Extension

Overview
- This folder contains a Chrome/Edge extension scaffold that injects a content script into all tabs and can blur the page when an unauthorized face is detected.

Important setup steps (required before loading the extension)
1. Copy the MediaPipe/vision files from the main project into the extension folder:
   - Copy `lib/js-file/*` into `extension/lib/js-file/` (this includes `vision_wasm_internal.js`, `.wasm`, and other files the bundle needs).
   - Copy `lib/vision_bundle.mjs` into `extension/lib/vision_bundle.mjs` (the extension uses the ESM bundle to avoid ModuleFactory errors).

2. Load the extension in Chrome/Edge:
   - Open chrome://extensions, enable Developer mode, click "Load unpacked" and select the `PrivacyShieldStandalone/extension` folder.

3. Click the extension icon to open the popup and use "Enroll Face" to capture multi-angle poses.

Notes & Limitations
- The content script attempts to inject `lib/js-file/vision_bundle.js` from extension resources. For this to work the `lib/js-file` folder must be present inside the extension folder.
- Camera access permission is granted per tab when the content script requests `getUserMedia`; the extension does not declare a special camera permission.
- This is a prototype: performance optimizations, permission flows, and privacy/security audit should be done before deploying in production.

How it works (technical)
- `popup.html` runs enrollment: it opens the camera, captures multiple poses using the MediaPipe FaceLandmarker, and saves them to `chrome.storage.local`.
- `content_script.js` runs on every page: if enrollment data exists, it loads the face landmarker from extension resources, opens the camera in each tab, and blurs the page when an unknown face (or multiple faces) is detected.

If you want, I can:
- Copy the lib files into `extension/lib` for you (if you want me to) so you can load the extension immediately.
- Add a background service worker to centralize camera usage (reduce multi-tab camera requests).
- Add UI improvements and a settings page (sensitivity, blur style, auto-lock behavior).
