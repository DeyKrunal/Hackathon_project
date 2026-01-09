// Privacy Shield AI - Face Registration Script

let faceLandmarker = null;
let videoStream = null;
let detectedFaceLandmarks = null;
let animationFrameId = null;
let tfModel = null;

const videoElement = document.getElementById('webcam');
const statusDiv = document.getElementById('status');
const enrollBtn = document.getElementById('enrollBtn');
const retryBtn = document.getElementById('retryBtn');

// Update status message
function updateStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// Load TensorFlow.js and BlazeFace (pure JS) model
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

async function loadTfAndModel() {
  updateStatus('Loading TensorFlow.js model...', 'info');

  // Try to load local bundled libs first (recommended for extensions).
  const localTf = chrome.runtime.getURL('libs/tf.min.js');
  const localBlaze = chrome.runtime.getURL('libs/blazeface.min.js');
  try {
    await loadScript(localTf);
    await loadScript(localBlaze);
  } catch (e) {
    // Fallback to CDN if local files aren't present (may be blocked by CSP on extension pages).
    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.12.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.8/dist/blazeface.min.js');
    } catch (err) {
      throw new Error('Failed to load TensorFlow.js or BlazeFace: ' + err.message);
    }
  }

  if (!window.blazeface) throw new Error('blazeface not available after loading scripts');

  tfModel = await blazeface.load();
}

// Initialize TF.js BlazeFace model and start camera
async function initializeModel() {
  try {
    await loadTfAndModel();
    updateStatus('Model loaded. Starting camera...', 'info');
    await startCamera();
  } catch (error) {
    console.error('Error initializing TF model:', error);
    updateStatus('Failed to initialize AI model. Please refresh the page.', 'error');
  }
}

// Start camera
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 }
    });
    videoElement.srcObject = videoStream;
    await videoElement.play();
    
    updateStatus('Camera ready. Position your face in the frame...', 'info');
    startDetection();
  } catch (error) {
    console.error('Error accessing camera:', error);
    updateStatus('Failed to access camera. Please grant camera permissions.', 'error');
  }
}

// Start face detection
function startDetection() {
  let lastVideoTime = -1;

  const detectFrame = async () => {
    if (tfModel && videoElement.readyState >= 2) {
      const currentTime = performance.now();

      if (currentTime !== lastVideoTime) {
        lastVideoTime = currentTime;
        try {
          const predictions = await tfModel.estimateFaces(videoElement, false);
          if (predictions && predictions.length === 1) {
            detectedFaceLandmarks = predictions[0];
            updateStatus('✓ Face detected! Click "Enroll Face" to save your profile.', 'success');
            enrollBtn.disabled = false;
          } else if (predictions && predictions.length > 1) {
            detectedFaceLandmarks = null;
            updateStatus('Multiple faces detected. Please ensure only one person is visible.', 'error');
            enrollBtn.disabled = true;
          } else {
            detectedFaceLandmarks = null;
            updateStatus('No face detected. Please position your face in the frame.', 'info');
            enrollBtn.disabled = true;
          }
        } catch (e) {
          console.error('Detection error:', e);
        }
      }
    }
    animationFrameId = requestAnimationFrame(detectFrame);
  };

  detectFrame();
}

// Stop detection
function stopDetection() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
}

// Enroll face
async function enrollFace() {
  if (!detectedFaceLandmarks) {
    updateStatus('No face detected. Please try again.', 'error');
    return;
  }

  try {
    updateStatus('Saving your face profile...', 'info');
    
    // Save enrolled face landmarks and registration status
    await chrome.storage.local.set({
      enrolledFace: detectedFaceLandmarks,
      isRegistered: true
    });

    updateStatus('✓ Face enrolled successfully! You can now close this tab.', 'success');
    enrollBtn.disabled = true;
    stopDetection();

    // Close tab after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
  } catch (error) {
    console.error('Error enrolling face:', error);
    updateStatus('Failed to save face profile. Please try again.', 'error');
    retryBtn.style.display = 'inline-block';
  }
}

// Retry enrollment
function retry() {
  retryBtn.style.display = 'none';
  enrollBtn.disabled = true;
  detectedFaceLandmarks = null;
  startDetection();
}

// Event listeners
enrollBtn.addEventListener('click', enrollFace);
retryBtn.addEventListener('click', retry);

// Initialize on page load
initializeModel();