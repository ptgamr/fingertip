import {
  HandLandmarker,
  FilesetResolver,
  HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

interface OffscreenHandDetectionResult {
  landmarks: Array<{ x: number; y: number; z: number }>;
  indexFingerTip: { x: number; y: number; z: number };
  handedness?: string; // "Left" or "Right"
  score?: number; // Confidence score
}

interface CameraSettings {
  width?: number;
  height?: number;
  mirror?: boolean;
}

class OffscreenHandDetector {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private isLoaded: boolean = false;
  private isRunning: boolean = false;
  private animationId: number | null = null;

  constructor() {
    this.video = document.getElementById("offscreen-video") as HTMLVideoElement;
    this.canvas = document.getElementById(
      "offscreen-canvas"
    ) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;

    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.target !== "offscreen") {
        return;
      }
      switch (message.command) {
        case "start-camera":
          this.startCamera(message.settings)
            .then(() => sendResponse({ success: true }))
            .catch((error) =>
              sendResponse({ success: false, error: error.message })
            );
          return true; // Will respond asynchronously

        case "stop-camera":
          this.stopCamera();
          sendResponse({ success: true });
          break;

        case "get-hand-detection":
          console.log("Offscreen: Received hand detection request");
          this.detectHands()
            .then((results) => {
              console.log(
                `Offscreen: Returning ${results.length} hand detection results`
              );
              sendResponse({ success: true, data: results });
            })
            .catch((error) =>
              sendResponse({ success: false, error: error.message })
            );
          return true; // Will respond asynchronously

        case "get-video-frame":
          this.getVideoFrame()
            .then((frameData) =>
              sendResponse({ success: true, data: frameData })
            )
            .catch((error) =>
              sendResponse({ success: false, error: error.message })
            );
          return true; // Will respond asynchronously

        default:
          sendResponse({ success: false, error: "Unknown command" });
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log("Loading MediaPipe hand detection model in offscreen...");

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
      console.log(
        "MediaPipe hand detection model loaded successfully in offscreen"
      );
    } catch (error) {
      console.error(
        "Failed to load MediaPipe hand detection model in offscreen:",
        error
      );
      throw error;
    }
  }

  async startCamera(settings: CameraSettings = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error("Camera is already running");
    }

    try {
      // Initialize MediaPipe if not already loaded
      await this.initialize();

      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: settings.width || 640,
          height: settings.height || 480,
        },
      });

      // Setup video element
      this.video.srcObject = this.stream;

      return new Promise((resolve, reject) => {
        this.video.onloadedmetadata = () => {
          this.video
            .play()
            .then(() => {
              this.isRunning = true;

              // Setup canvas dimensions
              this.canvas.width = this.video.videoWidth;
              this.canvas.height = this.video.videoHeight;

              console.log("Camera started in offscreen document");
              resolve();
            })
            .catch(reject);
        };

        this.video.onerror = () => {
          reject(new Error("Failed to load video"));
        };
      });
    } catch (error) {
      console.error("Failed to start camera in offscreen:", error);
      throw error;
    }
  }

  stopCamera(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.video.srcObject = null;
    console.log("Camera stopped in offscreen document");
  }

  async getVideoFrame(): Promise<string | null> {
    if (!this.isRunning || this.video.readyState !== 4) {
      return null;
    }

    try {
      // Set canvas size to match video
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      // Draw current video frame to canvas
      this.ctx.drawImage(this.video, 0, 0);

      // Convert canvas to base64 data URL
      return this.canvas.toDataURL("image/jpeg", 0.8);
    } catch (error) {
      console.error("Failed to capture video frame:", error);
      return null;
    }
  }

  async detectHands(): Promise<OffscreenHandDetectionResult[]> {
    if (
      !this.handLandmarker ||
      !this.isLoaded ||
      !this.isRunning ||
      this.video.readyState !== 4
    ) {
      return [];
    }

    try {
      // Get current timestamp for video processing
      const timestamp = performance.now();

      // Detect hands
      const results: HandLandmarkerResult = this.handLandmarker.detectForVideo(
        this.video,
        timestamp
      );

      console.log("[Offscreen] MediaPipe detection results:", {
        numHands: results.landmarks?.length || 0,
        hasHandedness: !!results.handednesses,
        handedness: results.handednesses,
      });

      // Convert MediaPipe results to our interface format
      const handResults: OffscreenHandDetectionResult[] = [];

      if (results.landmarks) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];

          // IMPORTANT: Keep coordinates normalized (0-1) as expected by FingerTracker3
          // Do NOT convert to pixel coordinates here
          const normalizedLandmarks = landmarks.map((landmark) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
          }));

          // Index finger tip is landmark 8 in MediaPipe hand model
          const indexFingerTip = normalizedLandmarks[8];

          if (indexFingerTip) {
            // Get handedness information if available
            let handedness = "Right"; // Default
            let score = 1.0;

            if (results.handednesses && results.handednesses[i]) {
              const hand = results.handednesses[i][0]; // Get first classification
              handedness = hand.categoryName || "Right";
              score = hand.score || 1.0;
            }

            console.log(
              `[Offscreen] Hand ${i}: ${handedness} (score: ${score}), index tip:`,
              indexFingerTip
            );

            handResults.push({
              landmarks: normalizedLandmarks,
              indexFingerTip: indexFingerTip,
              handedness: handedness,
              score: score,
            });
          }
        }
      }

      return handResults;
    } catch (error) {
      console.error("MediaPipe hand detection error in offscreen:", error);
      return [];
    }
  }

  dispose(): void {
    this.stopCamera();

    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }

    this.isLoaded = false;
  }
}

// Initialize the offscreen hand detector
const offscreenDetector = new OffscreenHandDetector();

// Cleanup on window unload
window.addEventListener("beforeunload", () => {
  offscreenDetector.dispose();
});
