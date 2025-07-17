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

interface OffscreenFaceDetectionResult {
  translation: [number, number, number]; // x, y, z position
  rotation: [number, number, number]; // pitch, yaw, roll in radians
  morphTargets?: number[]; // Face expression morph targets
  isDetected: boolean;
}

// Declare Jeeliz global
declare global {
  interface Window {
    JEELIZFACEEXPRESSIONS: any;
  }
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

        case "start-face-tracking":
          console.log("Offscreen: Starting face tracking");
          ((window as any).faceDetector as OffscreenFaceDetector)
            .startFaceTracking()
            .then(() => sendResponse({ success: true }))
            .catch((error) =>
              sendResponse({ success: false, error: error.message })
            );
          return true; // Will respond asynchronously

        case "stop-face-tracking":
          console.log("Offscreen: Stopping face tracking");
          (
            (window as any).faceDetector as OffscreenFaceDetector
          ).stopFaceTracking();
          sendResponse({ success: true });
          break;

        case "get-face-detection":
          console.log("Offscreen: Received face detection request");
          ((window as any).faceDetector as OffscreenFaceDetector)
            .detectFace()
            .then((result) => {
              console.log(
                "Offscreen: Returning face detection result:",
                result
              );
              sendResponse({ success: true, data: result });
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

class OffscreenFaceDetector {
  private jeelizInstance: any = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isLoaded: boolean = false;
  private isRunning: boolean = false;
  private animationId: number | null = null;
  private currentFaceData: OffscreenFaceDetectionResult | null = null;

  constructor() {
    this.video = document.getElementById("offscreen-video") as HTMLVideoElement;
    this.canvas = document.getElementById("face-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
  }

  async initialize(): Promise<void> {
    if (this.isLoaded) return;

    try {
      console.log("Initializing Jeeliz face tracking...");

      // Wait for Jeeliz library to be available
      if (!window.JEELIZFACEEXPRESSIONS) {
        throw new Error("Jeeliz library not loaded");
      }

      // Setup canvas dimensions
      this.canvas.width = this.video.videoWidth || 640;
      this.canvas.height = this.video.videoHeight || 480;

      // Get the extension URL for local files
      const extensionUrl = chrome.runtime.getURL("");

      // Initialize Jeeliz with configuration
      const jeelizConfig = {
        canvasId: "face-canvas",
        NNCPath: `${extensionUrl}/models`, // Path to neural network models
        videoSettings: {
          videoElement: this.video,
        },
        callbackReady: (errCode: number, spec: any) => {
          if (errCode) {
            console.error("Jeeliz initialization failed:", errCode);
            return;
          }
          console.log("Jeeliz face tracking initialized successfully");
          this.isLoaded = true;
          this.startDetectionLoop();
        },
        callbackTrack: (detectState: any) => {
          this.processFaceData(detectState);
        },
      };

      // Initialize Jeeliz
      this.jeelizInstance = window.JEELIZFACEEXPRESSIONS.init(jeelizConfig);
    } catch (error) {
      console.error("Failed to initialize Jeeliz face tracking:", error);
      throw error;
    }
  }

  private processFaceData(detectState: any): void {
    if (!detectState || !detectState.detected) {
      this.currentFaceData = {
        translation: [0, 0, 0],
        rotation: [0, 0, 0],
        isDetected: false,
      };
      return;
    }

    // Extract face position and rotation from Jeeliz detect state
    const translation: [number, number, number] = [
      detectState.x || 0,
      detectState.y || 0,
      detectState.s || 0, // Scale as z-depth approximation
    ];

    const rotation: [number, number, number] = [
      detectState.rx || 0, // Pitch
      detectState.ry || 0, // Yaw
      detectState.rz || 0, // Roll
    ];

    this.currentFaceData = {
      translation,
      rotation,
      morphTargets: detectState.expressions || [],
      isDetected: true,
    };
  }

  private startDetectionLoop(): void {
    if (!this.isRunning) return;

    const loop = () => {
      if (this.isRunning && this.jeelizInstance) {
        // Jeeliz handles the detection automatically via callbackTrack
        this.animationId = requestAnimationFrame(loop);
      }
    };

    loop();
  }

  async startFaceTracking(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Face tracking is already running");
    }

    try {
      // Initialize if not already done
      await this.initialize();

      this.isRunning = true;
      console.log("Face tracking started");
    } catch (error) {
      console.error("Failed to start face tracking:", error);
      throw error;
    }
  }

  stopFaceTracking(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.jeelizInstance && this.jeelizInstance.destroy) {
      this.jeelizInstance.destroy();
      this.jeelizInstance = null;
    }

    this.currentFaceData = null;
    console.log("Face tracking stopped");
  }

  async detectFace(): Promise<OffscreenFaceDetectionResult | null> {
    if (!this.isLoaded || !this.isRunning) {
      return null;
    }

    // Return the latest face data processed by Jeeliz
    return this.currentFaceData;
  }

  dispose(): void {
    this.stopFaceTracking();
    this.isLoaded = false;
  }
}

// Initialize both detectors
const offscreenDetector = new OffscreenHandDetector();
const faceDetector = new OffscreenFaceDetector();

// Make face detector globally accessible for message handler
(window as any).faceDetector = faceDetector;

// Cleanup on window unload
window.addEventListener("beforeunload", () => {
  offscreenDetector.dispose();
  faceDetector.dispose();
});
