// Middle finger gesture detector
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class MiddleFingerGestureDetector extends BaseGestureDetector {
  readonly gestureType = "middle-finger-up" as const;

  private readonly MIDDLE_EXTENSION_THRESHOLD = 0.7;
  private readonly OTHER_FINGERS_FOLDED_THRESHOLD = 0.4;
  private previousMiddleStrength: number | null = null;
  private smoothedMiddleStrength: number | null = null;
  private readonly EMA_ALPHA = 0.5;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Calculate middle finger extension
    const middleExtension = this.calculateMiddleFingerExtension(landmarks);

    // Check if other fingers are folded
    const otherFingersFolded = this.areOtherFingersFolded(landmarks);

    // Update smoothed strength
    this.updateSmoothedStrength(middleExtension);

    // Gesture is active if middle finger is extended and others are folded
    const isActive =
      (this.smoothedMiddleStrength || 0) > this.MIDDLE_EXTENSION_THRESHOLD &&
      otherFingersFolded;

    const confidence = isActive ? this.calculateConfidence(landmarks) : 0;

    // Use middle finger tip as reference point
    const referencePoint = landmarks[FINGER_LANDMARKS.MIDDLE.TIP];

    return {
      isActive,
      confidence,
      referencePoint,
      metadata: {
        middleExtension,
        smoothedStrength: this.smoothedMiddleStrength,
        otherFingersFolded,
        extensionThreshold: this.MIDDLE_EXTENSION_THRESHOLD,
        foldedThreshold: this.OTHER_FINGERS_FOLDED_THRESHOLD,
      },
    };
  }

  calculateConfidence(landmarks: HandLandmarks): number {
    if (!this.smoothedMiddleStrength) return 0;

    // Base confidence from middle finger extension
    const extensionConfidence = Math.min(
      1,
      this.smoothedMiddleStrength / this.MIDDLE_EXTENSION_THRESHOLD
    );

    // Confidence from other fingers being folded
    const otherFingersFolded = this.areOtherFingersFolded(landmarks);
    const isolationConfidence = otherFingersFolded ? 1.0 : 0.3;

    // Stability confidence
    const stabilityConfidence = this.previousMiddleStrength
      ? Math.max(
          0,
          1 -
            Math.abs(
              this.smoothedMiddleStrength - this.previousMiddleStrength
            ) *
              2
        )
      : 0.5;

    // Combined confidence
    const conditions = [
      { met: extensionConfidence > 0.8, weight: 0.5 },
      { met: isolationConfidence > 0.8, weight: 0.3 },
      { met: stabilityConfidence > 0.7, weight: 0.2 },
    ];

    return this.calculateConditionConfidence(conditions);
  }

  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number } {
    return landmarks[FINGER_LANDMARKS.MIDDLE.TIP];
  }

  /**
   * Calculate middle finger extension
   */
  private calculateMiddleFingerExtension(landmarks: HandLandmarks): number {
    const tip = landmarks[FINGER_LANDMARKS.MIDDLE.TIP];
    const mcp = landmarks[FINGER_LANDMARKS.MIDDLE.MCP];
    const pip = landmarks[FINGER_LANDMARKS.MIDDLE.PIP];

    // Calculate extension based on distance and height
    const segmentLength = this.calculateDistance(mcp, pip);
    const expectedDistance = segmentLength * 2.5;
    const actualDistance = this.calculateDistance(tip, mcp);

    const distanceRatio = Math.min(1, actualDistance / expectedDistance);

    // Height factor (tip should be above MCP for extension)
    const heightDiff = mcp.y - tip.y;
    const heightFactor = Math.max(0, Math.min(1, heightDiff * 3));

    return distanceRatio * 0.6 + heightFactor * 0.4;
  }

  /**
   * Check if other fingers (index, ring, pinky) are folded
   */
  private areOtherFingersFolded(landmarks: HandLandmarks): boolean {
    const fingerConfigs = [
      {
        tipIndex: FINGER_LANDMARKS.INDEX.TIP,
        baseIndex: FINGER_LANDMARKS.INDEX.MCP,
      },
      {
        tipIndex: FINGER_LANDMARKS.RING.TIP,
        baseIndex: FINGER_LANDMARKS.RING.MCP,
      },
      {
        tipIndex: FINGER_LANDMARKS.PINKY.TIP,
        baseIndex: FINGER_LANDMARKS.PINKY.MCP,
      },
    ];

    return this.areFingersFolded(landmarks, fingerConfigs);
  }

  /**
   * Update smoothed strength
   */
  private updateSmoothedStrength(strength: number): void {
    if (this.smoothedMiddleStrength === null) {
      this.smoothedMiddleStrength = strength;
    } else {
      this.smoothedMiddleStrength =
        this.EMA_ALPHA * strength +
        (1 - this.EMA_ALPHA) * this.smoothedMiddleStrength;
    }
    this.previousMiddleStrength = this.smoothedMiddleStrength;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousMiddleStrength = null;
    this.smoothedMiddleStrength = null;
  }

  /**
   * Update thresholds for calibration
   */
  updateThresholds(extensionThreshold: number, foldedThreshold: number): void {
    (this as any).MIDDLE_EXTENSION_THRESHOLD = extensionThreshold;
    (this as any).OTHER_FINGERS_FOLDED_THRESHOLD = foldedThreshold;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): { extension: number; folded: number } {
    return {
      extension: this.MIDDLE_EXTENSION_THRESHOLD,
      folded: this.OTHER_FINGERS_FOLDED_THRESHOLD,
    };
  }
}
