// Privacy Shield AI - Offscreen Document (AI Engine)
// Handles MediaPipe Face Landmarker and identity verification

let faceLandmarker = null;
let enrolledFaceLandmarks = null;
let videoStream = null;
let animationFrameId = null;
let lastVideoTime = -1;

// Import MediaPipe (using CDN for now, will be replaced with local files)
// Note: In production, these should be loaded from local js-file/ directory
const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';



// Load MediaPipe library dynamically
async function loadMediaPipe() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { FaceLandmarker, FilesetResolver } from '${MEDIAPIPE_CDN}';
      window.MediaPipeVision = { FaceLandmarker, FilesetResolver };
    `;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load MediaPipe'));
    document.head.appendChild(script);
  });
}

// Initialize MediaPipe Face Landmarker
async function initializeFaceLandmarker() {
  if (faceLandmarker) {
    console.log('FaceLandmarker already initialized.');
    return;
  }

  try {
    // Load MediaPipe library
    await loadMediaPipe();
    
    const { FaceLandmarker, FilesetResolver } = window.MediaPipeVision;

    // For local WASM files (uncomment when files are available):
    // const wasmFilesetPath = chrome.runtime.getURL('js-file/');
    // const modelPath = chrome.runtime.getURL('js-file/face_landmarker.task');
    // const vision = await FilesetResolver.forVisionTasks(wasmFilesetPath);

    // Using CDN for now (replace with local files in production)
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 2, // Detect up to 2 faces to handle >1 face scenario
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });

    console.log('MediaPipe FaceLandmarker initialized in offscreen document.');
  } catch (error) {
    console.error('Error initializing MediaPipe FaceLandmarker:', error);
    chrome.runtime.sendMessage({ 
      type: 'FACELANDMARKER_INIT_ERROR', 
      error: error.message 
    });
  }
}

// Calculate Euclidean distance between two landmark sets
function calculateEuclideanDistance(landmarksA, landmarksB) {
  if (!landmarksA || !landmarksB || landmarksA.length !== landmarksB.length) {
    return Infinity;
  }

  let sumOfSquaredDifferences = 0;
  for (let i = 0; i < landmarksA.length; i++) {
    sumOfSquaredDifferences += Math.pow(landmarksA[i].x - landmarksB[i].x, 2);
    sumOfSquaredDifferences += Math.pow(landmarksA[i].y - landmarksB[i].y, 2);
    sumOfSquaredDifferences += Math.pow(landmarksA[i].z - landmarksB[i].z, 2);
  }
  return Math.sqrt(sumOfSquaredDifferences);
}

// Process face detection results
function processFaceLandmarkerResult(result) {
  let shouldBlur = false;

  if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
    // No faces detected - no blur needed
    shouldBlur = false;
  } else if (result.faceLandmarks.length > 1) {
    // More than one face detected - blur for privacy
    shouldBlur = true;
  } else {
    // Exactly one face detected - compare with enrolled face
    if (enrolledFaceLandmarks) {
      const liveLandmarks = result.faceLandmarks[0];
      const distance = calculateEuclideanDistance(liveLandmarks, enrolledFaceLandmarks);
      const BLUR_THRESHOLD = 0.07;

      if (distance > BLUR_THRESHOLD) {
        shouldBlur = true; // Unrecognized face
      } else {
        shouldBlur = false; // Recognized face (enrolled user)
      }
    } else {
      // No enrolled face data - blur by default
      console.warn('No enrolled face data available for comparison. Blurring by default.');
      shouldBlur = true;
    }
  }

  // Send result to background service worker
  chrome.runtime.sendMessage({
    type: 'DETECTION_RESULT',
    payload: { shouldBlur }
  });
}

// Start continuous face detection
async function startContinuousDetection() {
  const videoElement = document.getElementById('webcam');

  if (!videoElement) {
    console.error('Video element not found.');
    return;
  }

  try {
    // Get user media if not already available
    if (!videoStream) {
      videoStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      videoElement.srcObject = videoStream;
      await videoElement.play();
    }

    // Detection loop using requestAnimationFrame
    const detectFrame = async () => {
      if (faceLandmarker && videoElement.readyState >= 2) {
        const currentTime = performance.now();
        
        // Only process if enough time has passed (avoid processing same frame)
        if (currentTime !== lastVideoTime) {
          lastVideoTime = currentTime;
          const result = await faceLandmarker.detectForVideo(videoElement, currentTime);
          processFaceLandmarkerResult(result);
        }
      }
      animationFrameId = requestAnimationFrame(detectFrame);
    };

    detectFrame();
    console.log('Continuous face detection started.');
  } catch (error) {
    console.error('Error setting up video stream for continuous detection:', error);
  }
}

// Stop continuous detection and cleanup
function stopContinuousDetection() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    console.log('Continuous detection loop stopped.');
  }

  // Stop camera tracks
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
    console.log('Camera tracks stopped.');
  }

  // Clear video element
  const videoElement = document.getElementById('webcam');
  if (videoElement) {
    videoElement.srcObject = null;
  }
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INIT_FACELANDMARKER_IN_OFFSCREEN') {
    initializeFaceLandmarker()
      .then(() => startContinuousDetection())
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.type === 'PUSH_DATA' && message.payload && message.payload.enrolledFace) {
    enrolledFaceLandmarks = message.payload.enrolledFace;
    console.log('Enrolled face data received in offscreen document.');
    sendResponse({ success: true, message: 'Enrolled face received' });
  } else if (message.type === 'STOP_MONITORING') {
    stopContinuousDetection();
    sendResponse({ success: true, message: 'Monitoring stopped and resources cleaned.' });
  }
});

console.log('Privacy Shield AI - Offscreen document loaded.');