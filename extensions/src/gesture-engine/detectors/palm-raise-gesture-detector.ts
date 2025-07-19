// Palm raise gesture detector - migrated from GestureDetector
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class PalmRaiseGestureDetector extends BaseGestureDetector {
  readonly gestureType = "palm-raise" as const;

  private readonly PALM_RAISE_THRESHOLD = 0.8; // Threshold for palm raise detection
  private previousPalmRaiseStrength: number | null = null;
  private smoothedPalmRaiseStrength: number | null = null;
  private readonly EMA_ALPHA = 0.4;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Calculate palm raise strength based on finger extension and palm orientation
    const palmRaiseStrength = this.calculatePalmRaiseStrength(landmarks);

    // Update smoothed palm raise strength
    this.updateSmoothedPalmRaiseStrength(palmRaiseStrength);

    // Determine if palm raise is active
    const isPalmRaiseActive =
      (this.smoothedPalmRaiseStrength || 0) > this.PALM_RAISE_THRESHOLD;

    const confidence = isPalmRaiseActive
      ? this.calculateConfidence(landmarks)
      : 0;

    // Use palm center as reference point for palm raise gestures
    const referencePoint = this.calculatePalmCenter(landmarks);

    return {
      isActive: isPalmRaiseActive,
      confidence,
      referencePoint,
      metadata: {
        palmRaiseStrength,
        smoothedPalmRaiseStrength: this.smoothedPalmRaiseStrength,
        threshold: this.PALM_RAISE_THRESHOLD,
        fingerExtensions: this.calculateFingerExtensions(landmarks),
        palmOrientation: this.calculatePalmOrientation(landmarks),
      },
    };
  }

  calculateConfidence(landmarks: HandLandmarks): number {
    if (!this.smoothedPalmRaiseStrength) return 0;

    // Base confidence from palm raise strength
    const strengthConfidence = Math.min(
      1,
      this.smoothedPalmRaiseStrength / this.PALM_RAISE_THRESHOLD
    );

    // Stability confidence (less change = higher confidence)
    const stabilityConfidence = this.previousPalmRaiseStrength
      ? Math.max(
          0,
          1 -
            Math.abs(
              this.smoothedPalmRaiseStrength - this.previousPalmRaiseStrength
            ) *
              2
        )
      : 0.5;

    // Finger extension consistency confidence
    const fingerExtensions = this.calculateFingerExtensions(landmarks);
    const extensionValues = Object.values(fingerExtensions);
    const averageExtension =
      extensionValues.reduce((sum, val) => sum + val, 0) /
      extensionValues.length;
    const extensionConfidence = averageExtension;

    // Palm orientation confidence (palm should be facing forward)
    const palmOrientation = this.calculatePalmOrientation(landmarks);
    const orientationConfidence = palmOrientation.facingForward ? 1.0 : 0.3;

    // Combined confidence
    const conditions = [
      { met: strengthConfidence > 0.8, weight: 0.4 },
      { met: stabilityConfidence > 0.7, weight: 0.2 },
      { met: extensionConfidence > 0.7, weight: 0.3 },
      { met: orientationConfidence > 0.8, weight: 0.1 },
    ];

    return this.calculateConditionConfidence(conditions);
  }

  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number } {
    // Use palm center as reference point for palm raise gestures
    return this.calculatePalmCenter(landmarks);
  }

  /**
   * Calculate overall palm raise strength based on finger extension and palm orientation
   */
  private calculatePalmRaiseStrength(landmarks: HandLandmarks): number {
    const fingerExtensions = this.calculateFingerExtensions(landmarks);
    const palmOrientation = this.calculatePalmOrientation(landmarks);

    // Weight different factors
    const extensionWeight = 0.7;
    const orientationWeight = 0.3;

    // Calculate average finger extension
    const extensionValues = Object.values(fingerExtensions);
    const averageExtension =
      extensionValues.reduce((sum, val) => sum + val, 0) /
      extensionValues.length;

    // Palm orientation score
    const orientationScore = palmOrientation.facingForward ? 1.0 : 0.2;

    return (
      averageExtension * extensionWeight + orientationScore * orientationWeight
    );
  }

  /**
   * Calculate extension amount for each finger
   */
  private calculateFingerExtensions(landmarks: HandLandmarks): {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  } {
    return {
      thumb: this.calculateFingerExtension(landmarks, "thumb"),
      index: this.calculateFingerExtension(landmarks, "index"),
      middle: this.calculateFingerExtension(landmarks, "middle"),
      ring: this.calculateFingerExtension(landmarks, "ring"),
      pinky: this.calculateFingerExtension(landmarks, "pinky"),
    };
  }

  /**
   * Calculate extension amount for a specific finger
   */
  private calculateFingerExtension(
    landmarks: HandLandmarks,
    finger: "thumb" | "index" | "middle" | "ring" | "pinky"
  ): number {
    if (finger === "thumb") {
      // Thumb extension is measured differently
      return this.calculateThumbExtension(landmarks);
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

    // For other fingers, measure if tip is above MCP (extended)
    const tipPoint = landmarks[tip];
    const mcpPoint = landmarks[mcp];
    const pipPoint = landmarks[pip];

    // Calculate expected extended distance
    const segmentLength = this.calculateDistance(mcpPoint, pipPoint);
    const expectedExtendedDistance = segmentLength * 2.5;

    // Calculate actual distance from tip to MCP
    const actualDistance = this.calculateDistance(tipPoint, mcpPoint);

    // Extension ratio (closer to expected = more extended)
    const extensionRatio = Math.min(
      1,
      actualDistance / expectedExtendedDistance
    );

    // Also check if tip is above MCP (Y coordinate consideration)
    const heightExtension = mcpPoint.y - tipPoint.y; // Positive if tip is above MCP
    const heightScore = Math.max(0, Math.min(1, heightExtension * 5)); // Scale height difference

    // Combine distance and height factors
    return extensionRatio * 0.7 + heightScore * 0.3;
  }

  /**
   * Calculate thumb extension (special case)
   */
  private calculateThumbExtension(landmarks: HandLandmarks): number {
    const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
    const thumbMcp = landmarks[FINGER_LANDMARKS.THUMB.MCP];
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];

    // Measure thumb distance from palm
    const thumbToIndex = this.calculateDistance(thumbTip, indexMcp);
    const thumbToMcp = this.calculateDistance(thumbTip, thumbMcp);

    // Thumb is extended when it's away from the palm
    const maxDistance = 0.2;
    return Math.min(1, thumbToIndex / maxDistance);
  }

  /**
   * Calculate palm orientation to determine if facing forward
   */
  private calculatePalmOrientation(landmarks: HandLandmarks): {
    facingForward: boolean;
    angle: number;
  } {
    // Use wrist, middle finger MCP, and index finger MCP to determine palm plane
    const wrist = landmarks[0];
    const middleMcp = landmarks[FINGER_LANDMARKS.MIDDLE.MCP];
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];

    // Calculate vectors
    const wristToMiddle = {
      x: middleMcp.x - wrist.x,
      y: middleMcp.y - wrist.y,
    };

    const wristToIndex = {
      x: indexMcp.x - wrist.x,
      y: indexMcp.y - wrist.y,
    };

    // Calculate cross product to determine palm normal direction
    const crossProduct =
      wristToMiddle.x * wristToIndex.y - wristToMiddle.y * wristToIndex.x;

    // Calculate angle of palm relative to camera
    const palmAngle = Math.atan2(wristToMiddle.y, wristToMiddle.x);

    // Palm is facing forward if fingers are pointing up (negative Y direction)
    const facingForward = wristToMiddle.y < -0.05; // Fingers pointing upward

    return {
      facingForward,
      angle: palmAngle,
    };
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
   * Update exponential moving average for palm raise strength
   */
  private updateSmoothedPalmRaiseStrength(strength: number): void {
    if (this.smoothedPalmRaiseStrength === null) {
      this.smoothedPalmRaiseStrength = strength;
    } else {
      this.smoothedPalmRaiseStrength =
        this.EMA_ALPHA * strength +
        (1 - this.EMA_ALPHA) * this.smoothedPalmRaiseStrength;
    }
    this.previousPalmRaiseStrength = this.smoothedPalmRaiseStrength;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousPalmRaiseStrength = null;
    this.smoothedPalmRaiseStrength = null;
  }

  /**
   * Update threshold for calibration
   */
  updateThreshold(threshold: number): void {
    (this as any).PALM_RAISE_THRESHOLD = threshold;
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.PALM_RAISE_THRESHOLD;
  }
}
