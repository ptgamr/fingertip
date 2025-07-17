import { HandDetector } from "./hand-detector-interface";
import { FaceDetector } from "./face-detector-interface";
import { OnscreenMediaPipeHandDetector } from "./onscreen-mediapipe-hand-detector";
import { OnscreenTensorFlowHandDetector } from "./onscreen-tensorflow-hand-detector";
import { OffscreenHandDetector } from "./offscreen-hand-detector";
import { OffscreenFaceDetector } from "./offscreen-face-detector";
import { OnscreenWebojiFaceDetector } from "./onscreen-weboji-face-detector";

export type HandDetectorType = "mediapipe" | "tensorflow" | "offscreen";
export type FaceDetectorType = "offscreen" | "onscreen";
export type DetectorType = "hand" | "face";

export class DetectorFactory {
  /**
   * Create a hand detector instance
   * @param type - The type of hand detector to create
   * @returns A hand detector instance
   */
  static createHandDetector(
    type: HandDetectorType = "mediapipe"
  ): HandDetector {
    switch (type) {
      case "mediapipe":
        return new OnscreenMediaPipeHandDetector();
      case "tensorflow":
        return new OnscreenTensorFlowHandDetector();
      case "offscreen":
        return new OffscreenHandDetector();
      default:
        throw new Error(`Unknown hand detector type: ${type}`);
    }
  }

  /**
   * Create a face detector instance
   * @param type - The type of face detector to create
   * @returns A face detector instance
   */
  static createFaceDetector(
    type: FaceDetectorType = "offscreen",
    canvas?: HTMLCanvasElement
  ): FaceDetector {
    switch (type) {
      case "offscreen":
        return new OffscreenFaceDetector();
      case "onscreen":
        if (!canvas) {
          throw new Error("Canvas is required for onscreen face detector");
        }
        return new OnscreenWebojiFaceDetector(canvas);
      default:
        throw new Error(`Unknown face detector type: ${type}`);
    }
  }
}

// Maintain backward compatibility with existing HandDetectorFactory
export class HandDetectorFactory {
  /**
   * Create a hand detector instance
   * @param type - The type of hand detector to create
   * @returns A hand detector instance
   */
  static create(type: HandDetectorType = "mediapipe"): HandDetector {
    return DetectorFactory.createHandDetector(type);
  }
}

// HandDetectorType is already exported above, no need to re-export
