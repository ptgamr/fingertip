// Pinch gesture detector - migrated from PinchDetector
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class PinchGestureDetector extends BaseGestureDetector {
  readonly gestureType = "pinch" as const;

  private readonly PINCH_ENTER_THRESHOLD = 0.08;
  private readonly PINCH_EXIT_THRESHOLD = 0.1;
  private previousDistance: number | null = null;
  private smoothedDistance: number | null = null;
  private readonly EMA_ALPHA = 0.6;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Get thumb tip and index finger tip
    const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
    const indexTip = landmarks[FINGER_LANDMARKS.INDEX.TIP];

    // Check if other fingers (middle, ring, pinky) are extended
    const otherFingersExtended = this.areOtherFingersExtended(landmarks);

    // // Check if all fingers are folded (fist - not a valid pinch)
    // const allFingersFolded = this.areAllFingersFolded(landmarks);

    // Calculate pinch distance
    const pinchDistance = this.calculateDistance(thumbTip, indexTip);

    // Update smoothed distance
    this.updateSmoothedDistance(pinchDistance);

    // Determine if pinch is active using hysteresis
    const isPinchActive = this.detectPinchWithHysteresis();

    // Pinch is valid only if other fingers are extended and not all fingers are folded
    const isValidPinch = otherFingersExtended && isPinchActive;

    const confidence = isValidPinch ? this.calculateConfidence(landmarks) : 0;

    return {
      isActive: isValidPinch,
      confidence,
      referencePoint: indexTip,
      metadata: {
        pinchDistance,
        smoothedDistance: this.smoothedDistance,
        otherFingersExtended,
        // allFingersFolded,
        thresholds: {
          enter: this.PINCH_ENTER_THRESHOLD,
          exit: this.PINCH_EXIT_THRESHOLD,
        },
      },
    };
  }

  calculateConfidence(landmarks: HandLandmarks): number {
    if (!this.smoothedDistance) return 0;

    const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
    const indexTip = landmarks[FINGER_LANDMARKS.INDEX.TIP];

    // Base confidence from distance (closer = higher confidence)
    const maxDistance = 0.15;
    const distanceConfidence = Math.max(
      0,
      1 - this.smoothedDistance / maxDistance
    );

    // Finger position confidence
    const otherFingersExtended = this.areOtherFingersExtended(landmarks);
    const fingerPositionConfidence = otherFingersExtended ? 1.0 : 0.3;

    // Stability confidence (less change = higher confidence)
    const stabilityConfidence = this.previousDistance
      ? Math.max(
          0,
          1 - Math.abs(this.smoothedDistance - this.previousDistance) * 10
        )
      : 0.5;

    // Combined confidence
    const conditions = [
      { met: distanceConfidence > 0.5, weight: 0.5 },
      { met: fingerPositionConfidence > 0.8, weight: 0.3 },
      { met: stabilityConfidence > 0.7, weight: 0.2 },
    ];

    return this.calculateConditionConfidence(conditions);
  }

  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number } {
    // Use index finger tip as reference point for pinch gestures
    return landmarks[FINGER_LANDMARKS.INDEX.TIP];
  }

  /**
   * Check if other fingers (middle, ring, pinky) are extended
   * Made more lenient for better pinch detection
   */
  private areOtherFingersExtended(landmarks: HandLandmarks): boolean {
    const fingerConfigs = [
      {
        tipIndex: FINGER_LANDMARKS.MIDDLE.TIP,
        baseIndex: FINGER_LANDMARKS.MIDDLE.MCP, // Changed from PIP to MCP for more lenient detection
      },
      {
        tipIndex: FINGER_LANDMARKS.RING.TIP,
        baseIndex: FINGER_LANDMARKS.RING.MCP, // Changed from PIP to MCP for more lenient detection
      },
      {
        tipIndex: FINGER_LANDMARKS.PINKY.TIP,
        baseIndex: FINGER_LANDMARKS.PINKY.MCP, // Changed from PIP to MCP for more lenient detection
      },
    ];

    // Require at least 2 out of 3 fingers to be extended (more lenient)
    const extendedCount = fingerConfigs.filter((config) => {
      const tip = landmarks[config.tipIndex];
      const base = landmarks[config.baseIndex];
      return tip.y < base.y; // Tip is above base (extended)
    }).length;

    return extendedCount >= 3;
  }

  /**
   * Check if all fingers are folded (fist gesture)
   */
  private areAllFingersFolded(landmarks: HandLandmarks): boolean {
    const fingerConfigs = [
      {
        tipIndex: FINGER_LANDMARKS.INDEX.TIP,
        baseIndex: FINGER_LANDMARKS.INDEX.MCP,
      },
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
   * Update exponential moving average for pinch distance
   */
  private updateSmoothedDistance(distance: number): void {
    if (this.smoothedDistance === null) {
      this.smoothedDistance = distance;
    } else {
      this.smoothedDistance =
        this.EMA_ALPHA * distance +
        (1 - this.EMA_ALPHA) * this.smoothedDistance;
    }
    this.previousDistance = this.smoothedDistance;
  }

  /**
   * Detect pinch using hysteresis to prevent flickering
   */
  private detectPinchWithHysteresis(): boolean {
    if (!this.smoothedDistance) return false;

    // Use different thresholds for entering and exiting pinch state
    if (
      this.previousDistance === null ||
      this.previousDistance >= this.PINCH_EXIT_THRESHOLD
    ) {
      // Not currently pinching - use lower threshold to enter
      return this.smoothedDistance < this.PINCH_ENTER_THRESHOLD;
    } else {
      // Currently pinching - use higher threshold to exit (hysteresis)
      return this.smoothedDistance < this.PINCH_EXIT_THRESHOLD;
    }
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousDistance = null;
    this.smoothedDistance = null;
  }

  /**
   * Update thresholds for calibration
   */
  updateThresholds(enterThreshold: number, exitThreshold: number): void {
    (this as any).PINCH_ENTER_THRESHOLD = enterThreshold;
    (this as any).PINCH_EXIT_THRESHOLD = exitThreshold;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): { enter: number; exit: number } {
    return {
      enter: this.PINCH_ENTER_THRESHOLD,
      exit: this.PINCH_EXIT_THRESHOLD,
    };
  }
}
