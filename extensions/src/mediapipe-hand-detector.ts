import {
  HandLandmarker,
  FilesetResolver,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  HandDetector,
  HandDetectionResult,
  HandLandmark,
} from "./hand-detector-interface";

export class MediaPipeHandDetector implements HandDetector {
  private handLandmarker: HandLandmarker | null = null;
  public isLoaded: boolean = false;

  async initialize(): Promise<void> {
    try {
      console.log("Loading MediaPipe hand detection model...");

      // Get the extension URL for local files
      const extensionUrl = chrome.runtime.getURL("");

      // Initialize MediaPipe FilesetResolver with local WASM files
      const vision = await FilesetResolver.forVisionTasks(
        `${extensionUrl}mediapipe/wasm`
      );

      // Create HandLandmarker with local model file
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${extensionUrl}models/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isLoaded = true;
      console.log("MediaPipe hand detection model loaded successfully");
    } catch (error) {
      console.error("Failed to load MediaPipe hand detection model:", error);
      throw error;
    }
  }

  async detectHands(video: HTMLVideoElement): Promise<HandDetectionResult[]> {
    if (!this.handLandmarker || !this.isLoaded || video.readyState !== 4) {
      return [];
    }

    try {
      // Get current timestamp for video processing
      const timestamp = performance.now();

      // Detect hands
      const results: HandLandmarkerResult = this.handLandmarker.detectForVideo(
        video,
        timestamp
      );

      // Convert MediaPipe results to our interface format
      const handResults: HandDetectionResult[] = [];

      if (results.landmarks) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];

          // Convert normalized coordinates to pixel coordinates
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          const convertedLandmarks: HandLandmark[] = landmarks.map(
            (landmark) => ({
              x: landmark.x * videoWidth,
              y: landmark.y * videoHeight,
              z: landmark.z,
            })
          );

          // Index finger tip is landmark 8 in MediaPipe hand model
          const indexFingerTip = convertedLandmarks[8];

          if (indexFingerTip) {
            handResults.push({
              landmarks: convertedLandmarks,
              indexFingerTip: indexFingerTip,
            });
          }
        }
      }

      return handResults;
    } catch (error) {
      console.error("MediaPipe hand detection error:", error);
      return [];
    }
  }

  dispose(): void {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    this.isLoaded = false;
  }
}
