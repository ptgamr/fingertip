import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handpose from "@tensorflow-models/handpose";
import {
  HandDetector,
  HandDetectionResult,
  HandLandmark,
} from "./hand-detector-interface";

interface TensorFlowHandPose {
  annotations: {
    [key: string]: number[][];
  };
  landmarks: number[][];
}

export class OnscreenTensorFlowHandDetector implements HandDetector {
  private handposeModel: handpose.HandPose | null = null;
  public isLoaded: boolean = false;

  async initialize(): Promise<void> {
    try {
      console.log("Loading TensorFlow.js handpose model...");
      await tf.ready();
      this.handposeModel = await handpose.load();
      this.isLoaded = true;
      console.log("TensorFlow.js handpose model loaded successfully");
    } catch (error) {
      console.error("Failed to load TensorFlow.js handpose model:", error);
      throw error;
    }
  }

  async detectHands(video: HTMLVideoElement): Promise<HandDetectionResult[]> {
    if (!this.handposeModel || !this.isLoaded || video.readyState !== 4) {
      return [];
    }

    try {
      // Detect hands
      const predictions = await this.handposeModel.estimateHands(video);

      // Convert TensorFlow.js results to our interface format
      const handResults: HandDetectionResult[] = [];

      for (const prediction of predictions as TensorFlowHandPose[]) {
        if (prediction.landmarks && prediction.landmarks.length >= 21) {
          const landmarks: HandLandmark[] = prediction.landmarks.map(
            ([x, y, z]) => ({
              x,
              y,
              z,
            })
          );

          // Index finger tip is landmark 8 in MediaPipe hand model
          const indexFingerTip = landmarks[8];

          if (indexFingerTip) {
            handResults.push({
              landmarks,
              indexFingerTip,
            });
          }
        }
      }

      return handResults;
    } catch (error) {
      console.error("TensorFlow.js hand detection error:", error);
      return [];
    }
  }

  dispose(): void {
    // TensorFlow.js handpose model doesn't have a dispose method
    // The model will be garbage collected when the reference is removed
    this.handposeModel = null;
    this.isLoaded = false;
  }
}
