// Index finger gesture detector for pointing gestures
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class IndexFingerGestureDetector extends BaseGestureDetector {
  readonly gestureType = "index-finger-up" as const;

  private readonly INDEX_EXTENSION_THRESHOLD = 0.7;
  private readonly OTHER_FINGERS_FOLDED_THRESHOLD = 0.4;
  private previousIndexStrength: number | null = null;
  private smoothedIndexStrength: number | null = null;
  private readonly EMA_ALPHA = 0.5;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Calculate index finger extension
    const indexExtension = this.calculateIndexFingerExtension(landmarks);

    // Check if other fingers are folded
    const otherFingersFolded = this.areOtherFingersFolded(landmarks);

    // Update smoothed strength
    this.updateSmoothedStrength(indexExtension);

    // Gesture is active if index is extended and others are folded
    const isActive =
      (this.smoothedIndexStrength || 0) > this.INDEX_EXTENSION_THRESHOLD &&
      otherFingersFolded;

    const confidence = isActive ? this.calculateConfidence(landmarks) : 0;

    // Use index finger tip as reference point
    const referencePoint = landmarks[FINGER_LANDMARKS.INDEX.TIP];

    return {
      isActive,
      confidence,
      referencePoint,
      metadata: {
        indexExtension,
        smoothedStrength: this.smoothedIndexStrength,
        otherFingersFolded,
        extensionThreshold: this.INDEX_EXTENSION_THRESHOLD,
        foldedThreshold: this.OTHER_FINGERS_FOLDED_THRESHOLD,
      },
    };
  }

  calculateConfidence(landmarks: HandLandmarks): number {
    if (!this.smoothedIndexStrength) return 0;

    // Base confidence from index finger extension
    const extensionConfidence = Math.min(
      1,
      this.smoothedIndexStrength / this.INDEX_EXTENSION_THRESHOLD
    );

    // Confidence from other fingers being folded
    const otherFingersFolded = this.areOtherFingersFolded(landmarks);
    const isolationConfidence = otherFingersFolded ? 1.0 : 0.3;

    // Stability confidence
    const stabilityConfidence = this.previousIndexStrength
      ? Math.max(
          0,
          1 -
            Math.abs(this.smoothedIndexStrength - this.previousIndexStrength) *
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
    return landmarks[FINGER_LANDMARKS.INDEX.TIP];
  }

  /**
   * Calculate index finger extension
   */
  private calculateIndexFingerExtension(landmarks: HandLandmarks): number {
    const tip = landmarks[FINGER_LANDMARKS.INDEX.TIP];
    const mcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];
    const pip = landmarks[FINGER_LANDMARKS.INDEX.PIP];

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
   * Check if other fingers (middle, ring, pinky) are folded
   */
  private areOtherFingersFolded(landmarks: HandLandmarks): boolean {
    const fingerConfigs = [
      {
        tipIndex: FINGER_LANDMARKS.MIDDLE.TIP,
        baseIndex: FINGER_LANDMARKS.MIDDLE.MCP,
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
    if (this.smoothedIndexStrength === null) {
      this.smoothedIndexStrength = strength;
    } else {
      this.smoothedIndexStrength =
        this.EMA_ALPHA * strength +
        (1 - this.EMA_ALPHA) * this.smoothedIndexStrength;
    }
    this.previousIndexStrength = this.smoothedIndexStrength;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousIndexStrength = null;
    this.smoothedIndexStrength = null;
  }

  /**
   * Update thresholds for calibration
   */
  updateThresholds(extensionThreshold: number, foldedThreshold: number): void {
    (this as any).INDEX_EXTENSION_THRESHOLD = extensionThreshold;
    (this as any).OTHER_FINGERS_FOLDED_THRESHOLD = foldedThreshold;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): { extension: number; folded: number } {
    return {
      extension: this.INDEX_EXTENSION_THRESHOLD,
      folded: this.OTHER_FINGERS_FOLDED_THRESHOLD,
    };
  }
}
