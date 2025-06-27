import { HandDetector } from "./hand-detector-interface";
import { MediaPipeHandDetector } from "./mediapipe-hand-detector";
import { TensorFlowHandDetector } from "./tensorflow-hand-detector";

export type HandDetectorType = "mediapipe" | "tensorflow";

export class HandDetectorFactory {
  /**
   * Create a hand detector instance
   * @param type - The type of hand detector to create
   * @returns A hand detector instance
   */
  static create(type: HandDetectorType = "mediapipe"): HandDetector {
    switch (type) {
      case "mediapipe":
        return new MediaPipeHandDetector();
      case "tensorflow":
        return new TensorFlowHandDetector();
      default:
        throw new Error(`Unknown hand detector type: ${type}`);
    }
  }
}
