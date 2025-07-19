// Grab gesture detector - migrated from GestureDetector
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class GrabGestureDetector extends BaseGestureDetector {
  readonly gestureType = "grab" as const;

  private readonly GRAB_THRESHOLD = 0.7; // Threshold for grab detection
  private previousGrabStrength: number | null = null;
  private smoothedGrabStrength: number | null = null;
  private readonly EMA_ALPHA = 0.3;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Calculate grab strength based on finger curl
    const grabStrength = this.calculateGrabStrength(landmarks);

    // Update smoothed grab strength
    this.updateSmoothedGrabStrength(grabStrength);

    // Determine if grab is active
    const isGrabActive = (this.smoothedGrabStrength || 0) > this.GRAB_THRESHOLD;

    const confidence = isGrabActive ? this.calculateConfidence(landmarks) : 0;

    // Use palm center as reference point for grab gestures
    const referencePoint = this.calculatePalmCenter(landmarks);

    return {
      isActive: isGrabActive,
      confidence,
      referencePoint,
      metadata: {
        grabStrength,
        smoothedGrabStrength: this.smoothedGrabStrength,
        threshold: this.GRAB_THRESHOLD,
        fingerCurls: this.calculateFingerCurls(landmarks),
      },
    };
  }

  calculateConfidence(landmarks: HandLandmarks): number {
    if (!this.smoothedGrabStrength) return 0;

    // Base confidence from grab strength
    const strengthConfidence = Math.min(
      1,
      this.smoothedGrabStrength / this.GRAB_THRESHOLD
    );

    // Stability confidence (less change = higher confidence)
    const stabilityConfidence = this.previousGrabStrength
      ? Math.max(
          0,
          1 -
            Math.abs(this.smoothedGrabStrength - this.previousGrabStrength) * 2
        )
      : 0.5;

    // Finger consistency confidence (all fingers should be curled similarly)
    const fingerCurls = this.calculateFingerCurls(landmarks);
    const curlVariance = this.calculateVariance(Object.values(fingerCurls));
    const consistencyConfidence = Math.max(0, 1 - curlVariance * 2);

    // Combined confidence
    const conditions = [
      { met: strengthConfidence > 0.8, weight: 0.5 },
      { met: stabilityConfidence > 0.7, weight: 0.3 },
      { met: consistencyConfidence > 0.6, weight: 0.2 },
    ];

    return this.calculateConditionConfidence(conditions);
  }

  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number } {
    // Use palm center as reference point for grab gestures
    return this.calculatePalmCenter(landmarks);
  }

  /**
   * Calculate overall grab strength based on finger curl
   */
  private calculateGrabStrength(landmarks: HandLandmarks): number {
    const fingerCurls = this.calculateFingerCurls(landmarks);

    // Weight different fingers differently (thumb less important for grab)
    const weights = {
      thumb: 0.1,
      index: 0.25,
      middle: 0.25,
      ring: 0.25,
      pinky: 0.15,
    };

    const weightedSum =
      fingerCurls.thumb * weights.thumb +
      fingerCurls.index * weights.index +
      fingerCurls.middle * weights.middle +
      fingerCurls.ring * weights.ring +
      fingerCurls.pinky * weights.pinky;

    return Math.min(1, weightedSum);
  }

  /**
   * Calculate curl amount for each finger
   */
  private calculateFingerCurls(landmarks: HandLandmarks): {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  } {
    return {
      thumb: this.calculateFingerCurl(landmarks, "thumb"),
      index: this.calculateFingerCurl(landmarks, "index"),
      middle: this.calculateFingerCurl(landmarks, "middle"),
      ring: this.calculateFingerCurl(landmarks, "ring"),
      pinky: this.calculateFingerCurl(landmarks, "pinky"),
    };
  }

  /**
   * Calculate curl amount for a specific finger
   */
  private calculateFingerCurl(
    landmarks: HandLandmarks,
    finger: "thumb" | "index" | "middle" | "ring" | "pinky"
  ): number {
    if (finger === "thumb") {
      // Thumb curl is measured differently (across palm)
      return this.calculateThumbCurl(landmarks);
    }

    // Get finger landmarks based on finger type
    let tip: number, mcp: number, pip: number;

    switch (finger) {
      case "index":
        tip = FINGER_LANDMARKS.INDEX.TIP;
        mcp = FINGER_LANDMARKS.INDEX.MCP;
        pip = FINGER_LANDMARKS.INDEX.PIP;
        break;
      case "middle":
        tip = FINGER_LANDMARKS.MIDDLE.TIP;
        mcp = FINGER_LANDMARKS.MIDDLE.MCP;
        pip = FINGER_LANDMARKS.MIDDLE.PIP;
        break;
      case "ring":
        tip = FINGER_LANDMARKS.RING.TIP;
        mcp = FINGER_LANDMARKS.RING.MCP;
        pip = FINGER_LANDMARKS.RING.PIP;
        break;
      case "pinky":
        tip = FINGER_LANDMARKS.PINKY.TIP;
        mcp = FINGER_LANDMARKS.PINKY.MCP;
        pip = FINGER_LANDMARKS.PINKY.PIP;
        break;
      default:
        return 0;
    }

    // For other fingers, measure distance from tip to MCP
    const tipPoint = landmarks[tip];
    const mcpPoint = landmarks[mcp];
    const pipPoint = landmarks[pip];

    // Calculate expected extended distance (tip to MCP when straight)
    const extendedDistance = this.calculateDistance(mcpPoint, pipPoint) * 2.5; // Approximate extended length

    // Calculate actual distance
    const actualDistance = this.calculateDistance(tipPoint, mcpPoint);

    // Curl is inverse of extension ratio
    const extensionRatio = Math.min(1, actualDistance / extendedDistance);
    return Math.max(0, 1 - extensionRatio);
  }

  /**
   * Calculate thumb curl (special case)
   */
  private calculateThumbCurl(landmarks: HandLandmarks): number {
    const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
    const thumbMcp = landmarks[FINGER_LANDMARKS.THUMB.MCP];
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];

    // Measure thumb position relative to index finger base
    const thumbToIndex = this.calculateDistance(thumbTip, indexMcp);
    const thumbToMcp = this.calculateDistance(thumbTip, thumbMcp);

    // Thumb is curled when it's close to the palm/index base
    const maxDistance = 0.15;
    return Math.max(0, 1 - thumbToIndex / maxDistance);
  }

  /**
   * Calculate palm center from wrist and finger bases
   */
  private calculatePalmCenter(landmarks: HandLandmarks): {
    x: number;
    y: number;
  } {
    const wrist = landmarks[0]; // Wrist landmark
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];
    const pinkyMcp = landmarks[FINGER_LANDMARKS.PINKY.MCP];

    // Palm center is roughly between wrist and middle of finger bases
    return {
      x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
      y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
    };
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Update exponential moving average for grab strength
   */
  private updateSmoothedGrabStrength(strength: number): void {
    if (this.smoothedGrabStrength === null) {
      this.smoothedGrabStrength = strength;
    } else {
      this.smoothedGrabStrength =
        this.EMA_ALPHA * strength +
        (1 - this.EMA_ALPHA) * this.smoothedGrabStrength;
    }
    this.previousGrabStrength = this.smoothedGrabStrength;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousGrabStrength = null;
    this.smoothedGrabStrength = null;
  }

  /**
   * Update threshold for calibration
   */
  updateThreshold(threshold: number): void {
    (this as any).GRAB_THRESHOLD = threshold;
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.GRAB_THRESHOLD;
  }
}
