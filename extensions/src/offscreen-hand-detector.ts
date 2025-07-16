import {
  HandDetector,
  HandDetectionResult,
  HandLandmark,
} from "./hand-detector-interface";

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

export class OffscreenHandDetector implements HandDetector {
  public isLoaded: boolean = false;
  private isInitializing: boolean = false;

  async initialize(): Promise<void> {
    if (this.isLoaded || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    try {
      console.log("Initializing offscreen hand detector...");

      // Start camera in offscreen document
      const response = await chrome.runtime.sendMessage({
        command: "start-camera",
        target: "offscreen",
        settings: {
          width: 640,
          height: 480,
        } as CameraSettings,
      });

      if (!response.success) {
        throw new Error(
          response.error || "Failed to start camera in offscreen"
        );
      }

      this.isLoaded = true;
      console.log("Offscreen hand detector initialized successfully");
    } catch (error) {
      console.error("Failed to initialize offscreen hand detector:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  async detectHands(video: HTMLVideoElement): Promise<HandDetectionResult[]> {
    if (!this.isLoaded) {
      return [];
    }

    try {
      // Request hand detection from offscreen document
      const response = await chrome.runtime.sendMessage({
        command: "get-hand-detection",
        target: "offscreen",
      });

      if (!response.success) {
        console.error(
          "Failed to get hand detection from offscreen:",
          response.error
        );
        return [];
      }

      // Convert offscreen results to our interface format
      const offscreenResults: OffscreenHandDetectionResult[] =
        response.data || [];

      const handResults: HandDetectionResult[] = [];

      for (const result of offscreenResults) {
        const landmarks: HandLandmark[] = result.landmarks.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
        }));

        handResults.push({
          landmarks: landmarks,
          indexFingerTip: result.indexFingerTip,
          handedness: result.handedness,
          score: result.score,
        });
      }

      return handResults;
    } catch (error) {
      console.error("Offscreen hand detection error:", error);
      return [];
    }
  }

  dispose(): void {
    if (!this.isLoaded) {
      return;
    }

    try {
      // Stop camera in offscreen document
      chrome.runtime.sendMessage({
        command: "stop-camera",
        target: "offscreen",
      });

      this.isLoaded = false;
      console.log("Offscreen hand detector disposed");
    } catch (error) {
      console.error("Failed to dispose offscreen hand detector:", error);
    }
  }
}
