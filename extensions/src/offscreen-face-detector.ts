import { FaceDetector, FaceDetectionResult } from "./face-detector-interface";

interface CameraSettings {
  width?: number;
  height?: number;
  mirror?: boolean;
}

export class OffscreenFaceDetector implements FaceDetector {
  private isTracking: boolean = false;
  isLoaded: boolean = true;

  async initialize(): Promise<void> {}

  async startTracking(): Promise<boolean> {
    if (this.isTracking) {
      return true;
    }

    try {
      console.log("Starting face tracking in offscreen...");

      // Start camera in offscreen document if not already started
      const response = await chrome.runtime.sendMessage({
        command: "start-camera",
        target: "offscreen",
        mode: "face",
        settings: {
          width: 640,
          height: 480,
        } as CameraSettings,
      });

      if (!response.success) {
        throw new Error(
          response.error || "Failed to start face tracking in offscreen"
        );
      }

      this.isTracking = true;
      console.log("Face tracking started successfully");
    } catch (error) {
      console.error("Failed to start face tracking:", error);
      throw error;
    }

    return true;
  }

  stopTracking(): void {
    if (!this.isTracking) {
      return;
    }

    try {
      chrome.runtime.sendMessage({
        command: "stop-face-tracking",
        target: "offscreen",
      });

      this.isTracking = false;
      console.log("Face tracking stopped");
    } catch (error) {
      console.error("Failed to stop face tracking:", error);
    }
  }

  async detectFace(
    video: HTMLVideoElement
  ): Promise<FaceDetectionResult | null> {
    if (!this.isLoaded) {
      return null;
    }

    try {
      // Request face detection from offscreen document
      const response = await chrome.runtime.sendMessage({
        command: "get-face-detection",
        target: "offscreen",
      });

      if (!response.success) {
        console.error(
          "Failed to get face detection from offscreen:",
          response.error
        );
        return null;
      }

      // Convert offscreen result to our interface format
      const offscreenResult: FaceDetectionResult = response.data;

      if (!offscreenResult) {
        return null;
      }

      const faceResult: FaceDetectionResult = {
        translation: offscreenResult.translation,
        rotation: offscreenResult.rotation,
        morphTargets: offscreenResult.morphTargets,
        isDetected: offscreenResult.isDetected,
        score: 1.0, // Jeeliz doesn't provide confidence scores
      };

      return faceResult;
    } catch (error) {
      console.error("Offscreen face detection error:", error);
      return null;
    }
  }

  dispose(): void {
    if (!this.isLoaded) {
      return;
    }

    try {
      // Stop face tracking if running
      this.stopTracking();

      // Stop camera in offscreen document
      chrome.runtime.sendMessage({
        command: "stop-camera",
        mode: "face",
        target: "offscreen",
      });

      this.isLoaded = false;
      console.log("Offscreen face detector disposed");
    } catch (error) {
      console.error("Failed to dispose offscreen face detector:", error);
    }
  }
}
