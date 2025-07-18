// Gesture detection system for recognizing specific hand gestures
import {
  HandLandmark,
  HandLandmarks,
  HandType,
  Position,
} from "./finger-tracker-types";

export type GestureType =
  | "index-finger-up"
  | "middle-finger-up"
  | "palm-raise"
  | "grab"
  | "none";

export interface GestureEvent {
  type: GestureType;
  hand: HandType;
  confidence: number;
  position: Position;
  isTransition: boolean; // True if this is a transition from one gesture to another
}

export class GestureDetector {
  private lastGesture: Map<HandType, GestureType> = new Map();
  private lastStableGesture: Map<HandType, GestureType> = new Map(); // Track last stable gesture for transitions
  private gestureConfidence: Map<HandType, number> = new Map();
  private gestureFrameCount: Map<HandType, number> = new Map();
  private readonly CONFIDENCE_THRESHOLD = 0.5; // Lowered from 0.7 to 0.5
  private readonly FRAME_THRESHOLD = 3; // Reduced from 5 to 3 frames

  constructor() {
    this.lastGesture.set("left", "none");
    this.lastGesture.set("right", "none");
    this.lastStableGesture.set("left", "none");
    this.lastStableGesture.set("right", "none");
    this.gestureConfidence.set("left", 0);
    this.gestureConfidence.set("right", 0);
    this.gestureFrameCount.set("left", 0);
    this.gestureFrameCount.set("right", 0);
  }

  /**
   * Detect gestures from hand landmarks
   */
  detectGesture(
    hand: HandType,
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean = false
  ): GestureEvent | null {
    const gesture = this.classifyGesture(landmarks);
    const confidence = this.calculateConfidence(landmarks, gesture);

    // Get position based on gesture type
    let referencePoint: HandLandmark;
    if (gesture === "grab") {
      // Use palm center (middle finger base) for grab gestures
      referencePoint = landmarks[8];
    } else if (gesture === "palm-raise") {
      // Use palm center (middle finger base) for palm raise gestures
      referencePoint = landmarks[9];
    } else if (gesture === "middle-finger-up") {
      // Use middle finger tip for middle finger gestures
      referencePoint = landmarks[12];
    } else {
      // Use index finger tip for other gestures
      referencePoint = landmarks[8];
    }

    // Convert landmark position to screen coordinates (same logic as landmarkToScreen in finger-tracker-3.ts)
    const position: Position = this.landmarkToScreen(
      referencePoint,
      isMirrored,
      hand
    );

    // Update gesture tracking
    const currentGesture = this.lastGesture.get(hand) || "none";
    const currentFrameCount = this.gestureFrameCount.get(hand) || 0;
    const lastStableGesture = this.lastStableGesture.get(hand) || "none";

    if (gesture === currentGesture) {
      // Same gesture, increment frame count
      this.gestureFrameCount.set(hand, currentFrameCount + 1);
    } else {
      // Different gesture, reset frame count
      this.gestureFrameCount.set(hand, 1);
      this.lastGesture.set(hand, gesture);
    }

    this.gestureConfidence.set(hand, confidence);

    // Only emit event if gesture is stable and confident
    const frameCount = this.gestureFrameCount.get(hand) || 0;
    if (
      gesture !== "none" &&
      confidence >= this.CONFIDENCE_THRESHOLD &&
      frameCount >= this.FRAME_THRESHOLD
    ) {
      // Check if this is a transition from a different stable gesture
      const isTransition =
        gesture !== lastStableGesture && frameCount === this.FRAME_THRESHOLD;

      // Update the last stable gesture when we reach the threshold
      if (frameCount === this.FRAME_THRESHOLD) {
        this.lastStableGesture.set(hand, gesture);
      }

      return {
        type: gesture,
        hand,
        confidence,
        position,
        isTransition,
      };
    }

    return null;
  }

  /**
   * Classify the gesture based on hand landmarks
   */
  private classifyGesture(landmarks: HandLandmarks): GestureType {
    // Check for grab gesture first (closed fist)
    const isGrab = this.isGrabGesture(landmarks);
    if (isGrab) {
      console.log("[GestureDetector] Grab gesture detected!");
      return "grab";
    }

    // Check for palm raise gesture (more specific)
    if (this.isPalmRaised(landmarks)) {
      return "palm-raise";
    }

    // Check for middle finger up gesture before index finger
    if (this.isMiddleFingerUp(landmarks)) {
      return "middle-finger-up";
    }

    // Check for index finger up gesture
    if (this.isIndexFingerUp(landmarks)) {
      return "index-finger-up";
    }

    return "none";
  }

  /**
   * Check if index finger is pointing up
   */
  private isIndexFingerUp(landmarks: HandLandmarks): boolean {
    // Index finger landmarks: 5 (MCP), 6 (PIP), 7 (DIP), 8 (TIP)
    // Thumb landmarks: 1 (CMC), 2 (MCP), 3 (IP), 4 (TIP)
    // Middle finger landmarks: 9 (MCP), 10 (PIP), 11 (DIP), 12 (TIP)
    // Ring finger landmarks: 13 (MCP), 14 (PIP), 15 (DIP), 16 (TIP)
    // Pinky landmarks: 17 (MCP), 18 (PIP), 19 (DIP), 20 (TIP)

    const indexMCP = landmarks[5]; // Index finger base
    const indexPIP = landmarks[6]; // Index finger middle joint
    const indexDIP = landmarks[7]; // Index finger upper joint
    const indexTIP = landmarks[8]; // Index finger tip

    const middleMCP = landmarks[9]; // Middle finger base
    const middleTIP = landmarks[12]; // Middle finger tip
    const ringMCP = landmarks[13]; // Ring finger base
    const ringTIP = landmarks[16]; // Ring finger tip
    const pinkyMCP = landmarks[17]; // Pinky base
    const pinkyTIP = landmarks[20]; // Pinky tip

    // Check if index finger is extended (tip is above base)
    const indexExtended = indexTIP.y < indexMCP.y - 0.05; // 0.05 threshold for noise

    // Check if index finger is straight (joints are aligned vertically)
    const indexStraight =
      Math.abs(indexTIP.x - indexMCP.x) < 0.1 && // Horizontal alignment
      indexPIP.y < indexMCP.y && // PIP above MCP
      indexDIP.y < indexPIP.y && // DIP above PIP
      indexTIP.y < indexDIP.y; // TIP above DIP

    // Check if other fingers are folded (tips are below or at same level as bases)
    const middleFolded = middleTIP.y >= middleMCP.y - 0.02;
    const ringFolded = ringTIP.y >= ringMCP.y - 0.02;
    const pinkyFolded = pinkyTIP.y >= pinkyMCP.y - 0.02;

    // Index finger up gesture: index extended and straight, other fingers folded
    return (
      indexExtended &&
      indexStraight &&
      middleFolded &&
      ringFolded &&
      pinkyFolded
    );
  }

  /**
   * Check if middle finger is pointing up
   */
  private isMiddleFingerUp(landmarks: HandLandmarks): boolean {
    // Middle finger landmarks: 9 (MCP), 10 (PIP), 11 (DIP), 12 (TIP)
    // Index finger landmarks: 5 (MCP), 6 (PIP), 7 (DIP), 8 (TIP)
    // Ring finger landmarks: 13 (MCP), 14 (PIP), 15 (DIP), 16 (TIP)
    // Pinky landmarks: 17 (MCP), 18 (PIP), 19 (DIP), 20 (TIP)

    const middleMCP = landmarks[9]; // Middle finger base
    const middlePIP = landmarks[10]; // Middle finger middle joint
    const middleDIP = landmarks[11]; // Middle finger upper joint
    const middleTIP = landmarks[12]; // Middle finger tip

    const indexMCP = landmarks[5]; // Index finger base
    const indexTIP = landmarks[8]; // Index finger tip
    const ringMCP = landmarks[13]; // Ring finger base
    const ringTIP = landmarks[16]; // Ring finger tip
    const pinkyMCP = landmarks[17]; // Pinky base
    const pinkyTIP = landmarks[20]; // Pinky tip

    // Check if middle finger is extended (tip is above base)
    const middleExtended = middleTIP.y < middleMCP.y - 0.05; // 0.05 threshold for noise

    // Check if middle finger is straight (joints are aligned vertically)
    const middleStraight =
      Math.abs(middleTIP.x - middleMCP.x) < 0.1 && // Horizontal alignment
      middlePIP.y < middleMCP.y && // PIP above MCP
      middleDIP.y < middlePIP.y && // DIP above PIP
      middleTIP.y < middleDIP.y; // TIP above DIP

    // Check if other fingers are folded (tips are below or at same level as bases)
    const indexFolded = indexTIP.y >= indexMCP.y - 0.02;
    const ringFolded = ringTIP.y >= ringMCP.y - 0.02;
    const pinkyFolded = pinkyTIP.y >= pinkyMCP.y - 0.02;

    // Middle finger up gesture: middle extended and straight, other fingers folded
    return (
      middleExtended &&
      middleStraight &&
      indexFolded &&
      ringFolded &&
      pinkyFolded
    );
  }

  /**
   * Check if palm is raised (all fingers extended and spread)
   */
  private isPalmRaised(landmarks: HandLandmarks): boolean {
    // Fingertip landmarks: thumb(4), index(8), middle(12), ring(16), pinky(20)
    // Base landmarks: thumb(2), index(5), middle(9), ring(13), pinky(17)
    // Palm landmarks: wrist(0), thumb_base(1), index_base(5), middle_base(9), ring_base(13), pinky_base(17)

    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const indexTip = landmarks[8];
    const indexBase = landmarks[5];
    const middleTip = landmarks[12];
    const middleBase = landmarks[9];
    const ringTip = landmarks[16];
    const ringBase = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyBase = landmarks[17];

    // Check if all fingertips are above their respective bases
    const thumbExtended = thumbTip.y < thumbBase.y - 0.03;
    const indexExtended = indexTip.y < indexBase.y - 0.05;
    const middleExtended = middleTip.y < middleBase.y - 0.05;
    const ringExtended = ringTip.y < ringBase.y - 0.05;
    const pinkyExtended = pinkyTip.y < pinkyBase.y - 0.05;

    // All fingers must be extended
    const allFingersExtended =
      thumbExtended &&
      indexExtended &&
      middleExtended &&
      ringExtended &&
      pinkyExtended;

    if (!allFingersExtended) {
      return false;
    }

    // Check finger spread - measure horizontal distances between fingertips
    const indexMiddleDistance = Math.abs(indexTip.x - middleTip.x);
    const middleRingDistance = Math.abs(middleTip.x - ringTip.x);
    const ringPinkyDistance = Math.abs(ringTip.x - pinkyTip.x);
    const thumbIndexDistance = Math.abs(thumbTip.x - indexTip.x);

    // Fingers should be reasonably spread (minimum distances)
    const minSpreadDistance = 0.03; // Adjust based on testing
    const fingersSpread =
      indexMiddleDistance > minSpreadDistance &&
      middleRingDistance > minSpreadDistance &&
      ringPinkyDistance > minSpreadDistance &&
      thumbIndexDistance > minSpreadDistance;

    return fingersSpread;
  }

  /**
   * Check if hand is making a grab gesture (closed fist - all fingers curled/folded)
   */
  private isGrabGesture(landmarks: HandLandmarks): boolean {
    // Fingertip landmarks: thumb(4), index(8), middle(12), ring(16), pinky(20)
    // Base landmarks: thumb(2), index(5), middle(9), ring(13), pinky(17)
    // Palm landmarks: wrist(0), thumb_base(1), index_base(5), middle_base(9), ring_base(13), pinky_base(17)

    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const indexTip = landmarks[8];
    const indexBase = landmarks[5];
    const middleTip = landmarks[12];
    const middleBase = landmarks[9];
    const ringTip = landmarks[16];
    const ringBase = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyBase = landmarks[17];

    // For grab gesture, most fingertips should be below or at same level as their bases (folded/curled)
    // Use a more lenient threshold to account for noise and natural hand curvature
    const foldThreshold = 0.05; // Increased from 0.02 to 0.05 for more lenient detection

    const thumbFolded = thumbTip.y >= thumbBase.y - foldThreshold;
    const indexFolded = indexTip.y >= indexBase.y - foldThreshold;
    const middleFolded = middleTip.y >= middleBase.y - foldThreshold;
    const ringFolded = ringTip.y >= ringBase.y - foldThreshold;
    const pinkyFolded = pinkyTip.y >= pinkyBase.y - foldThreshold;

    // At least 4 out of 5 fingers must be folded for grab gesture (more lenient)
    const foldedCount = [
      thumbFolded,
      indexFolded,
      middleFolded,
      ringFolded,
      pinkyFolded,
    ].filter(Boolean).length;
    const mostFingersFolded = foldedCount >= 4;

    // Debug logging for grab gesture detection
    const debugInfo = {
      thumbFolded: thumbFolded,
      indexFolded: indexFolded,
      middleFolded: middleFolded,
      ringFolded: ringFolded,
      pinkyFolded: pinkyFolded,
      foldedCount: foldedCount,
      mostFingersFolded: mostFingersFolded,
    };

    if (foldedCount >= 3) {
      // Log when we're getting close
      console.log("[GestureDetector] Grab detection debug:", debugInfo);
    }

    if (!mostFingersFolded) {
      return false;
    }

    // Additional check: fingers should be reasonably close together (not spread wide)
    // Measure horizontal distances between fingertips - they should be close
    const indexMiddleDistance = Math.abs(indexTip.x - middleTip.x);
    const middleRingDistance = Math.abs(middleTip.x - ringTip.x);
    const ringPinkyDistance = Math.abs(ringTip.x - pinkyTip.x);

    // For a closed fist, fingers should be reasonably close together (more lenient)
    const maxCloseDistance = 0.08; // Increased from 0.05 to 0.08 for more lenient detection
    const avgDistance =
      (indexMiddleDistance + middleRingDistance + ringPinkyDistance) / 3;
    const fingersReasonablyClose = avgDistance < maxCloseDistance;

    console.log("[GestureDetector] Grab closeness check:", {
      indexMiddleDistance: indexMiddleDistance.toFixed(3),
      middleRingDistance: middleRingDistance.toFixed(3),
      ringPinkyDistance: ringPinkyDistance.toFixed(3),
      avgDistance: avgDistance.toFixed(3),
      maxCloseDistance: maxCloseDistance,
      fingersReasonablyClose: fingersReasonablyClose,
    });

    return fingersReasonablyClose;
  }

  /**
   * Calculate confidence score for the detected gesture
   */
  private calculateConfidence(
    landmarks: HandLandmarks,
    gesture: GestureType
  ): number {
    if (gesture === "none") {
      return 0;
    }

    if (gesture === "grab") {
      return this.calculateGrabConfidence(landmarks);
    }

    if (gesture === "index-finger-up") {
      return this.calculateIndexFingerUpConfidence(landmarks);
    }

    if (gesture === "middle-finger-up") {
      return this.calculateMiddleFingerUpConfidence(landmarks);
    }

    if (gesture === "palm-raise") {
      return this.calculatePalmRaiseConfidence(landmarks);
    }

    return 0;
  }

  /**
   * Calculate confidence for grab gesture
   */
  private calculateGrabConfidence(landmarks: HandLandmarks): number {
    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const indexTip = landmarks[8];
    const indexBase = landmarks[5];
    const middleTip = landmarks[12];
    const middleBase = landmarks[9];
    const ringTip = landmarks[16];
    const ringBase = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyBase = landmarks[17];

    let confidence = 0;

    // Finger folding confidence (0-0.6 total, 0.12 per finger)
    // Higher confidence when fingers are more folded (tip below base)
    const thumbFolded = Math.max(0, thumbTip.y - thumbBase.y + 0.02);
    const indexFolded = Math.max(0, indexTip.y - indexBase.y + 0.02);
    const middleFolded = Math.max(0, middleTip.y - middleBase.y + 0.02);
    const ringFolded = Math.max(0, ringTip.y - ringBase.y + 0.02);
    const pinkyFolded = Math.max(0, pinkyTip.y - pinkyBase.y + 0.02);

    confidence += Math.min(0.12, thumbFolded * 6);
    confidence += Math.min(0.12, indexFolded * 6);
    confidence += Math.min(0.12, middleFolded * 6);
    confidence += Math.min(0.12, ringFolded * 6);
    confidence += Math.min(0.12, pinkyFolded * 6);

    // Finger closeness confidence (0-0.3 total)
    // Higher confidence when fingers are closer together (closed fist)
    const indexMiddleDistance = Math.abs(indexTip.x - middleTip.x);
    const middleRingDistance = Math.abs(middleTip.x - ringTip.x);
    const ringPinkyDistance = Math.abs(ringTip.x - pinkyTip.x);

    const avgDistance =
      (indexMiddleDistance + middleRingDistance + ringPinkyDistance) / 3;
    const closenessScore = Math.max(0, 0.05 - avgDistance); // Max closeness at 0.05 distance
    confidence += Math.min(0.3, closenessScore * 6); // Scale to reach 0.3

    // Fist compactness confidence (0-0.1 total)
    // Check if all fingertips are close to palm center
    const palmCenter = landmarks[9]; // Middle finger base as palm center reference
    const avgDistanceFromPalm =
      (Math.sqrt(
        Math.pow(thumbTip.x - palmCenter.x, 2) +
          Math.pow(thumbTip.y - palmCenter.y, 2)
      ) +
        Math.sqrt(
          Math.pow(indexTip.x - palmCenter.x, 2) +
            Math.pow(indexTip.y - palmCenter.y, 2)
        ) +
        Math.sqrt(
          Math.pow(middleTip.x - palmCenter.x, 2) +
            Math.pow(middleTip.y - palmCenter.y, 2)
        ) +
        Math.sqrt(
          Math.pow(ringTip.x - palmCenter.x, 2) +
            Math.pow(ringTip.y - palmCenter.y, 2)
        ) +
        Math.sqrt(
          Math.pow(pinkyTip.x - palmCenter.x, 2) +
            Math.pow(pinkyTip.y - palmCenter.y, 2)
        )) /
      5;

    const compactness = Math.max(0, 0.15 - avgDistanceFromPalm); // Max compactness at 0.15 distance
    confidence += Math.min(0.1, compactness * 0.67); // Scale to reach 0.1

    return Math.min(1.0, confidence);
  }

  /**
   * Calculate confidence for index finger up gesture
   */
  private calculateIndexFingerUpConfidence(landmarks: HandLandmarks): number {
    const indexMCP = landmarks[5];
    const indexTIP = landmarks[8];
    const middleMCP = landmarks[9];
    const middleTIP = landmarks[12];
    const ringMCP = landmarks[13];
    const ringTIP = landmarks[16];
    const pinkyMCP = landmarks[17];
    const pinkyTIP = landmarks[20];

    let confidence = 0;

    // Index finger extension confidence (0-0.4)
    const indexExtension = Math.max(0, indexMCP.y - indexTIP.y);
    confidence += Math.min(0.4, indexExtension * 2);

    // Other fingers folded confidence (0-0.6)
    const middleFolded = Math.max(0, middleTIP.y - middleMCP.y + 0.02);
    const ringFolded = Math.max(0, ringTIP.y - ringMCP.y + 0.02);
    const pinkyFolded = Math.max(0, pinkyTIP.y - pinkyMCP.y + 0.02);

    confidence += Math.min(0.2, middleFolded * 10);
    confidence += Math.min(0.2, ringFolded * 10);
    confidence += Math.min(0.2, pinkyFolded * 10);

    return Math.min(1.0, confidence);
  }

  /**
   * Calculate confidence for middle finger up gesture
   */
  private calculateMiddleFingerUpConfidence(landmarks: HandLandmarks): number {
    const middleMCP = landmarks[9];
    const middleTIP = landmarks[12];
    const indexMCP = landmarks[5];
    const indexTIP = landmarks[8];
    const ringMCP = landmarks[13];
    const ringTIP = landmarks[16];
    const pinkyMCP = landmarks[17];
    const pinkyTIP = landmarks[20];

    let confidence = 0;

    // Middle finger extension confidence (0-0.4)
    const middleExtension = Math.max(0, middleMCP.y - middleTIP.y);
    confidence += Math.min(0.4, middleExtension * 2);

    // Other fingers folded confidence (0-0.6)
    const indexFolded = Math.max(0, indexTIP.y - indexMCP.y + 0.02);
    const ringFolded = Math.max(0, ringTIP.y - ringMCP.y + 0.02);
    const pinkyFolded = Math.max(0, pinkyTIP.y - pinkyMCP.y + 0.02);

    confidence += Math.min(0.2, indexFolded * 10);
    confidence += Math.min(0.2, ringFolded * 10);
    confidence += Math.min(0.2, pinkyFolded * 10);

    return Math.min(1.0, confidence);
  }

  /**
   * Calculate confidence for palm raise gesture
   */
  private calculatePalmRaiseConfidence(landmarks: HandLandmarks): number {
    const thumbTip = landmarks[4];
    const thumbBase = landmarks[2];
    const indexTip = landmarks[8];
    const indexBase = landmarks[5];
    const middleTip = landmarks[12];
    const middleBase = landmarks[9];
    const ringTip = landmarks[16];
    const ringBase = landmarks[13];
    const pinkyTip = landmarks[20];
    const pinkyBase = landmarks[17];

    let confidence = 0;

    // Finger extension confidence (0-0.6 total, 0.12 per finger)
    const thumbExtension = Math.max(0, thumbBase.y - thumbTip.y);
    const indexExtension = Math.max(0, indexBase.y - indexTip.y);
    const middleExtension = Math.max(0, middleBase.y - middleTip.y);
    const ringExtension = Math.max(0, ringBase.y - ringTip.y);
    const pinkyExtension = Math.max(0, pinkyBase.y - pinkyTip.y);

    confidence += Math.min(0.12, thumbExtension * 2.4);
    confidence += Math.min(0.12, indexExtension * 2.4);
    confidence += Math.min(0.12, middleExtension * 2.4);
    confidence += Math.min(0.12, ringExtension * 2.4);
    confidence += Math.min(0.12, pinkyExtension * 2.4);

    // Finger spread confidence (0-0.2 total)
    const indexMiddleDistance = Math.abs(indexTip.x - middleTip.x);
    const middleRingDistance = Math.abs(middleTip.x - ringTip.x);
    const ringPinkyDistance = Math.abs(ringTip.x - pinkyTip.x);
    const thumbIndexDistance = Math.abs(thumbTip.x - indexTip.x);

    const avgSpread =
      (indexMiddleDistance +
        middleRingDistance +
        ringPinkyDistance +
        thumbIndexDistance) /
      4;
    confidence += Math.min(0.2, avgSpread * 6.67); // Scale to reach 0.2 at spread of 0.03

    // Palm orientation confidence (0-0.2 total)
    // Check if palm is facing forward by examining wrist to middle finger base alignment
    const wrist = landmarks[0];
    const palmCenter = landmarks[9]; // Middle finger base as palm center reference

    // Palm should be relatively upright (small x-difference between wrist and palm center)
    const palmAlignment = 1 - Math.min(1, Math.abs(wrist.x - palmCenter.x) * 5);
    confidence += palmAlignment * 0.2;

    return Math.min(1.0, confidence);
  }

  /**
   * Reset gesture state for a specific hand
   */
  resetHand(hand: HandType): void {
    this.lastGesture.set(hand, "none");
    this.lastStableGesture.set(hand, "none");
    this.gestureConfidence.set(hand, 0);
    this.gestureFrameCount.set(hand, 0);
  }

  /**
   * Get current gesture for a hand
   */
  getCurrentGesture(hand: HandType): GestureType {
    return this.lastGesture.get(hand) || "none";
  }

  /**
   * Get current confidence for a hand
   */
  getCurrentConfidence(hand: HandType): number {
    return this.gestureConfidence.get(hand) || 0;
  }

  /**
   * Convert landmark position to screen coordinates
   * This matches the logic in finger-tracker-3.ts landmarkToScreen method
   */
  private landmarkToScreen(
    landmark: { x: number; y: number },
    isMirrored: boolean,
    hand: HandType
  ): Position {
    // Normalize coordinates (MediaPipe provides 0-1 normalized coords)
    let normalizedX = landmark.x;
    let normalizedY = landmark.y;

    // Handle mirroring
    if (isMirrored) {
      normalizedX = 1 - normalizedX;
    }

    // Convert to screen coordinates
    const screenX = normalizedX * window.innerWidth;
    const screenY = normalizedY * window.innerHeight;

    return { x: screenX, y: screenY };
  }
}
