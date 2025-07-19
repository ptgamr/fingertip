// Index finger gesture detector for pointing gestures
import { GestureDetectionResult } from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";
import { BaseGestureDetector, FINGER_LANDMARKS } from "./base-gesture-detector";

export class IndexFingerGestureDetector extends BaseGestureDetector {
  readonly gestureType = "index-finger-up" as const;

  private readonly FINGER_EXTENSION_THRESHOLD = 0.7;
  private readonly FINGER_ISOLATION_THRESHOLD = 0.6; // How isolated the extended finger should be
  private previousFingerState: string | null = null;
  private smoothedFingerStrength: number | null = null;
  private readonly EMA_ALPHA = 0.5;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult {
    // Analyze finger extensions
    const fingerExtensions = this.calculateFingerExtensions(landmarks);

    // Determine which finger gesture is active
    const fingerGesture = this.identifyFingerGesture(fingerExtensions);

    // Calculate gesture strength
    const gestureStrength = fingerGesture
      ? fingerExtensions[fingerGesture.finger]
      : 0;

    // Update smoothed strength
    this.updateSmoothedStrength(gestureStrength);

    const isActive =
      fingerGesture !== null &&
      (this.smoothedFingerStrength || 0) > this.FINGER_EXTENSION_THRESHOLD;
    const confidence = isActive
      ? this.calculateConfidence(landmarks, fingerGesture)
      : 0;

    // Use the extended finger tip as reference point
    const referencePoint = fingerGesture
      ? this.getFingerTip(landmarks, fingerGesture.finger)
      : this.calculatePalmCenter(landmarks);

    return {
      isActive,
      confidence,
      referencePoint,
      metadata: {
        detectedFinger: fingerGesture?.finger || null,
        gestureType: fingerGesture?.type || null,
        fingerExtensions,
        gestureStrength,
        smoothedStrength: this.smoothedFingerStrength,
        threshold: this.FINGER_EXTENSION_THRESHOLD,
      },
    };
  }

  calculateConfidence(
    landmarks: HandLandmarks,
    fingerGesture: { finger: string; type: string } | null
  ): number {
    if (!fingerGesture || !this.smoothedFingerStrength) return 0;

    const fingerExtensions = this.calculateFingerExtensions(landmarks);
    const targetFinger = fingerGesture.finger as keyof typeof fingerExtensions;

    // Base confidence from finger extension strength
    const extensionConfidence = Math.min(
      1,
      fingerExtensions[targetFinger] / this.FINGER_EXTENSION_THRESHOLD
    );

    // Isolation confidence (other fingers should be less extended)
    const otherFingers = Object.keys(fingerExtensions).filter(
      (f) => f !== targetFinger
    ) as (keyof typeof fingerExtensions)[];
    const otherExtensions = otherFingers.map((f) => fingerExtensions[f]);
    const maxOtherExtension = Math.max(...otherExtensions);
    const isolationConfidence = Math.max(
      0,
      1 - maxOtherExtension / this.FINGER_ISOLATION_THRESHOLD
    );

    // Stability confidence
    const stabilityConfidence =
      this.previousFingerState === fingerGesture.finger ? 1.0 : 0.7;

    // Combined confidence
    const conditions = [
      { met: extensionConfidence > 0.8, weight: 0.5 },
      { met: isolationConfidence > 0.6, weight: 0.3 },
      { met: stabilityConfidence > 0.8, weight: 0.2 },
    ];

    return this.calculateConditionConfidence(conditions);
  }

  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number } {
    // Default to palm center if no specific finger is detected
    return this.calculatePalmCenter(landmarks);
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
      return this.calculateThumbExtension(landmarks);
    }

    // Get finger landmarks
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

    const tipPoint = landmarks[tip];
    const mcpPoint = landmarks[mcp];
    const pipPoint = landmarks[pip];

    // Calculate extension based on distance and height
    const segmentLength = this.calculateDistance(mcpPoint, pipPoint);
    const expectedDistance = segmentLength * 2.5;
    const actualDistance = this.calculateDistance(tipPoint, mcpPoint);

    const distanceRatio = Math.min(1, actualDistance / expectedDistance);

    // Height factor (tip should be above MCP for extension)
    const heightDiff = mcpPoint.y - tipPoint.y;
    const heightFactor = Math.max(0, Math.min(1, heightDiff * 3));

    return distanceRatio * 0.6 + heightFactor * 0.4;
  }

  /**
   * Calculate thumb extension
   */
  private calculateThumbExtension(landmarks: HandLandmarks): number {
    const thumbTip = landmarks[FINGER_LANDMARKS.THUMB.TIP];
    const thumbMcp = landmarks[FINGER_LANDMARKS.THUMB.MCP];
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];

    // Thumb extension is measured by distance from palm
    const thumbToIndex = this.calculateDistance(thumbTip, indexMcp);
    const maxThumbDistance = 0.15;

    return Math.min(1, thumbToIndex / maxThumbDistance);
  }

  /**
   * Identify which finger gesture is being performed
   */
  private identifyFingerGesture(extensions: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  }): { finger: string; type: string } | null {
    // Find the most extended finger
    const fingerEntries = Object.entries(extensions);
    const sortedFingers = fingerEntries.sort(([, a], [, b]) => b - a);

    const [mostExtendedFinger, maxExtension] = sortedFingers[0];
    const [secondMostExtended, secondExtension] = sortedFingers[1];

    // Check if the most extended finger is significantly more extended than others
    const extensionDifference = maxExtension - secondExtension;

    if (
      maxExtension > this.FINGER_EXTENSION_THRESHOLD &&
      extensionDifference > 0.3
    ) {
      // Determine gesture type based on finger
      let gestureType = "point";

      switch (mostExtendedFinger) {
        case "index":
          gestureType = "point";
          break;
        case "middle":
          gestureType = "middle-finger";
          break;
        case "thumb":
          gestureType = "thumbs-up";
          break;
        case "pinky":
          gestureType = "pinky";
          break;
        case "ring":
          gestureType = "ring-finger";
          break;
      }

      return {
        finger: mostExtendedFinger,
        type: gestureType,
      };
    }

    return null;
  }

  /**
   * Get finger tip coordinates for a specific finger
   */
  private getFingerTip(
    landmarks: HandLandmarks,
    finger: string
  ): { x: number; y: number } {
    switch (finger) {
      case "thumb":
        return landmarks[FINGER_LANDMARKS.THUMB.TIP];
      case "index":
        return landmarks[FINGER_LANDMARKS.INDEX.TIP];
      case "middle":
        return landmarks[FINGER_LANDMARKS.MIDDLE.TIP];
      case "ring":
        return landmarks[FINGER_LANDMARKS.RING.TIP];
      case "pinky":
        return landmarks[FINGER_LANDMARKS.PINKY.TIP];
      default:
        return this.calculatePalmCenter(landmarks);
    }
  }

  /**
   * Calculate palm center
   */
  private calculatePalmCenter(landmarks: HandLandmarks): {
    x: number;
    y: number;
  } {
    const wrist = landmarks[0];
    const indexMcp = landmarks[FINGER_LANDMARKS.INDEX.MCP];
    const pinkyMcp = landmarks[FINGER_LANDMARKS.PINKY.MCP];

    return {
      x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
      y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
    };
  }

  /**
   * Update smoothed strength
   */
  private updateSmoothedStrength(strength: number): void {
    if (this.smoothedFingerStrength === null) {
      this.smoothedFingerStrength = strength;
    } else {
      this.smoothedFingerStrength =
        this.EMA_ALPHA * strength +
        (1 - this.EMA_ALPHA) * this.smoothedFingerStrength;
    }
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.previousFingerState = null;
    this.smoothedFingerStrength = null;
  }

  /**
   * Update thresholds for calibration
   */
  updateThresholds(
    extensionThreshold: number,
    isolationThreshold: number
  ): void {
    (this as any).FINGER_EXTENSION_THRESHOLD = extensionThreshold;
    (this as any).FINGER_ISOLATION_THRESHOLD = isolationThreshold;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): { extension: number; isolation: number } {
    return {
      extension: this.FINGER_EXTENSION_THRESHOLD,
      isolation: this.FINGER_ISOLATION_THRESHOLD,
    };
  }
}
