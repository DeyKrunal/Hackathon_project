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

// Load MediaPipe from the local bundle
async function loadMediaPipe() {
    if (window.MediaPipeLoaded) return; // Already loaded

    const visionBundleUrl = chrome.runtime.getURL('js-file/vision_bundle.js');
    const module = await import(visionBundleUrl);
    window.FilesetResolver = module.FilesetResolver;
    window.FaceLandmarker = module.FaceLandmarker;
    window.MediaPipeLoaded = true;
    console.log('MediaPipe loaded successfully from local bundle.');
}

// Initialize MediaPipe Face Landmarker
async function initializeModel() {
  try {
    updateStatus('Loading AI model...', 'info');
    await loadMediaPipe();

    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('js-file')
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('js-file/face_landmarker.task'),
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 2
    });
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
    if (faceLandmarker && videoElement.readyState >= 2) {
      const currentTime = performance.now();

      if (currentTime !== lastVideoTime) {
        lastVideoTime = currentTime;
        const results = faceLandmarker.detectForVideo(videoElement, currentTime);

        if (results.faceLandmarks.length === 1) {
            detectedFaceLandmarks = results.faceLandmarks[0];
            updateStatus('✓ Face detected! Click "Enroll Face" to save your profile.', 'success');
            enrollBtn.disabled = false;
        } else if (results.faceLandmarks.length > 1) {
            detectedFaceLandmarks = null;
            updateStatus('Multiple faces detected. Please ensure only one person is visible.', 'error');
            enrollBtn.disabled = true;
        } else {
            detectedFaceLandmarks = null;
            updateStatus('No face detected. Please position your face in the frame.', 'info');
            enrollBtn.disabled = true;
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

    chrome.runtime.sendMessage({ type: 'ENROLLMENT_COMPLETE' });

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