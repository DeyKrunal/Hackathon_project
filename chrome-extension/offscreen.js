// import { FaceLandmarker, FilesetResolver } from "./js-file/vision_bundle.js";

// let faceLandmarker;
// let video;
// let stream;
// let enrolledFaceData = null;

// chrome.runtime.onMessage.addListener((message) => {
//   if (message.action === "PUSH_ENROLLED_DATA") {
//     enrolledFaceData = message.enrolledFace;
//     console.log("Face data synced from background!");
    
//     // Only start the AI once we have the data
//     if (!faceLandmarker) initAI(); 
//   }
// });

// async function initAI() {
//   console.log("Initializing AI engine...");

//   try {
//     // Use the Promise-based await for cleaner execution
//     const data = await chrome.storage.local.get(["enrolledFace"]);
    
//     if (data && data.enrolledFace) {
//       enrolledFaceData = data.enrolledFace;
//       console.log("Authorized face data successfully loaded from storage.");
//     } else {
//       console.warn("No enrolled face found. AI will treat everyone as a stranger.");
//     }

//     const vision = await FilesetResolver.forVisionTasks("./js-file");
//     faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
//       baseOptions: {
//         modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
//         delegate: "GPU"
//       },
//       runningMode: "VIDEO",
//       numFaces: 2 
//     });

//     startCamera();
//   } catch (error) {
//     console.error("Critical error during AI initialization:", error);
//   }
// }

// // 2. Camera Management
// async function startCamera() {
//   video = document.getElementById('webcam');
//   try {
//     stream = await navigator.mediaDevices.getUserMedia({ video: true });
//     video.srcObject = stream;
//     video.addEventListener('loadeddata', predictWebcam);
//   } catch (err) {
//     console.error("Camera access denied in offscreen doc:", err);
//   }
// }

// function stopCamera() {
//   if (stream) {
//     stream.getTracks().forEach(track => track.stop());
//     video.srcObject = null;
//     console.log("Camera hardware released.");
//   }
// }

// // Listen for stop commands from background.js
// chrome.runtime.onMessage.addListener((message) => {
//   if (message.action === 'STOP_AI') {
//     stopCamera();
//   }
// });

// // 3. Face Comparison Logic (Identity Verification)
// function isAuthorizedUser(liveFace) {
//   if (!enrolledFaceData || !liveFace) return false;

//   let totalDistance = 0;
//   // We compare key landmarks (eyes, nose, mouth, jawline)
//   const pointsToCompare = [1, 4, 152, 33, 263, 61, 291]; 

//   pointsToCompare.forEach(index => {
//     const p1 = liveFace[index];
//     const p2 = enrolledFaceData[index];
//     // Calculate Euclidean distance in 3D space
//     const dist = Math.sqrt(
//       Math.pow(p1.x - p2.x, 2) + 
//       Math.pow(p1.y - p2.y, 2) + 
//       Math.pow(p1.z - p2.z, 2)
//     );
//     totalDistance += dist;
//   });

//   const averageDistance = totalDistance / pointsToCompare.length;
//   // Threshold: 0.07 is usually a good balance for head movement
//   return averageDistance < 0.07; 
// }

// // 4. The Detection Loop
// async function predictWebcam() {
//   if (!faceLandmarker || !video || !video.srcObject) return;

//   const results = faceLandmarker.detectForVideo(video, performance.now());
//   let shouldBlur = false;

//   if (results.faceLandmarks.length === 0) {
//     // Optional: Blur if no one is at the computer
//     shouldBlur = false; 
//   } 
//   else if (results.faceLandmarks.length > 1) {
//     // SNOOPER DETECTED: More than one face
//     shouldBlur = true;
//     console.log("Snooper detected: Multiple faces in frame.");
//   } 
//   else if (results.faceLandmarks.length === 1) {
//     // Check if the single person is the owner
//     const isOwner = isAuthorizedUser(results.faceLandmarks[0]);
//     if (!isOwner) {
//       shouldBlur = true;
//       console.log("Snooper detected: Unknown face.");
//     }
//   }

//   // Send result to background.js
//   chrome.runtime.sendMessage({
//     type: 'DETECTION_RESULT',
//     shouldBlur: shouldBlur
//   });

//   // Continue loop
//   window.requestAnimationFrame(predictWebcam);
// }

// if (document.readyState === 'complete') {
//     initAI();
// } else {
//     window.addEventListener('load', initAI);
// }



import { FaceLandmarker, FilesetResolver } from "./js-file/vision_bundle.js";

let faceLandmarker;
let video;
let stream;
let enrolledFaceData = null;

// -----------------------------
// 1. Listen for background messages
// -----------------------------
chrome.runtime.onMessage.addListener((message) => {
  switch (message.action) {
    case "PUSH_ENROLLED_DATA":
      // Receive enrolled face data from background
      enrolledFaceData = message.enrolledFace;
      console.log("Face data synced from background!");

      // Initialize AI only once
      if (!faceLandmarker) initAI();
      break;

    case "STOP_AI":
      stopCamera();
      break;
  }
});

// -----------------------------
// 2. Initialize AI
// -----------------------------
async function initAI() {
  if (!enrolledFaceData) {
    console.warn("No enrolled face data yet. Waiting for PUSH_ENROLLED_DATA...");
    return;
  }

  console.log("Initializing AI engine...");

  try {
    // Load MediaPipe vision tasks
    const vision = await FilesetResolver.forVisionTasks("./js-file");

    // Create FaceLandmarker
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 2
    });

    startCamera();
  } catch (error) {
    console.error("Critical error during AI initialization:", error);
  }
}

// -----------------------------
// 3. Camera Management
// -----------------------------
async function startCamera() {
  video = document.getElementById('webcam');
  if (!video) {
    // Create a hidden video element if not present
    video = document.createElement('video');
    video.id = 'webcam';
    video.autoplay = true;
    video.style.display = 'none';
    document.body.appendChild(video);
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.addEventListener('loadeddata', predictWebcam);
    console.log("Camera started successfully.");
  } catch (err) {
    console.error("Camera access denied in offscreen document:", err);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    console.log("Camera hardware released.");
  }
}

// -----------------------------
// 4. Face Comparison Logic
// -----------------------------
function isAuthorizedUser(liveFace) {
  if (!enrolledFaceData || !liveFace) return false;

  let totalDistance = 0;
  const pointsToCompare = [1, 4, 152, 33, 263, 61, 291]; // key landmarks

  pointsToCompare.forEach(index => {
    const p1 = liveFace[index];
    const p2 = enrolledFaceData[index];

    const dist = Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
      Math.pow(p1.y - p2.y, 2) +
      Math.pow(p1.z - p2.z, 2)
    );

    totalDistance += dist;
  });

  const averageDistance = totalDistance / pointsToCompare.length;

  // Threshold for face match
  return averageDistance < 0.07;
}

// -----------------------------
// 5. Detection Loop
// -----------------------------
async function predictWebcam() {
  if (!faceLandmarker || !video || !video.srcObject) return;

  const results = faceLandmarker.detectForVideo(video, performance.now());
  let shouldBlur = false;

  if (results.faceLandmarks.length === 0) {
    // No one detected
    shouldBlur = false;
  } else if (results.faceLandmarks.length > 1) {
    // Multiple faces detected
    shouldBlur = true;
    console.log("Snooper detected: Multiple faces in frame.");
  } else if (results.faceLandmarks.length === 1) {
    // Single face: check if authorized
    const isOwner = isAuthorizedUser(results.faceLandmarks[0]);
    if (!isOwner) {
      shouldBlur = true;
      console.log("Snooper detected: Unknown face.");

      chrome.runtime.sendMessage({
        type: 'SHOW_NOTIFICATION',
        title: 'Snooper Alert!',
        message: 'Unknown face detected.'
      });
    }

  }

  // Send result to background
  chrome.runtime.sendMessage({
    type: 'DETECTION_RESULT',
    shouldBlur: shouldBlur
  });

  // Continue loop
  window.requestAnimationFrame(predictWebcam);
}

// -----------------------------
// 6. Start AI if DOM already loaded (optional fallback)
// -----------------------------
if (document.readyState === 'complete') {
  // Wait for PUSH_ENROLLED_DATA message instead
} else {
  window.addEventListener('load', () => {
    // Wait for PUSH_ENROLLED_DATA message instead
  });
}
