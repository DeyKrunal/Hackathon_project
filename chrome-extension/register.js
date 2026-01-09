import { FaceLandmarker, FilesetResolver } from "./js-file/vision_bundle.js";

let faceLandmarker;
let video = document.getElementById('regVideo');

async function init() {
    const vision = await FilesetResolver.forVisionTasks("./js-file");
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" },
        runningMode: "VIDEO"
    });
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    document.getElementById('enrollBtn').disabled = false;
}

document.getElementById('enrollBtn').onclick = async () => {
    const results = faceLandmarker.detectForVideo(video, performance.now());
    if (results.faceLandmarks.length === 1) {
        // 1. Save the data
        // await chrome.storage.local.set({ 
        //     "enrolledFace": results.faceLandmarks[0],
        //     "isRegistered": true 
        // });
        console.log("Face enrolled:", results.faceLandmarks[0]);
         const faceData = results.faceLandmarks[0].map(point => ({
                x: point.x,
                y: point.y,
                z: point.z
            }));

        await chrome.storage.local.set({
            enrolledFace: faceData,
            isRegistered: true
        });
        
        // 2. Alert the user
        alert("Face enrolled! Refresh your target websites to start protection.");
        
        // 3. Notify background to start the AI properly
        chrome.runtime.sendMessage({ action: 'ENROLLMENT_COMPLETE' });
        
        // window.close();    
    }
};
init();