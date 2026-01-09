// Shim to satisfy MediaPipe's nosimd loader path
// Load the available internal runtime which defines ModuleFactory
(function() {
	try {
		const s = document.createElement('script');
		s.src = chrome ? chrome.runtime.getURL('js-file/vision_wasm_internal.js') : 'vision_wasm_internal.js';
		s.onload = () => {};
		s.onerror = () => console.error('Failed to load vision_wasm_internal.js from nosimd shim');
		document.head.appendChild(s);
	} catch (e) {
		console.error('Error loading internal wasm runtime shim', e);
	}
})();

