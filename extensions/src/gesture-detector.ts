// Gesture detection system for recognizing specific hand gestures
import { HandLandmarks, HandType, Position } from "./finger-tracker-types";

export type GestureType = "index-finger-up" | "none";

export interface GestureEvent {
  type: GestureType;
  hand: HandType;
  confidence: number;
  position: Position;
}

export class GestureDetector {
  private lastGesture: Map<HandType, GestureType> = new Map();
  private gestureConfidence: Map<HandType, number> = new Map();
  private gestureFrameCount: Map<HandType, number> = new Map();
  private readonly CONFIDENCE_THRESHOLD = 0.7;
  private readonly FRAME_THRESHOLD = 5; // Require gesture to be stable for 5 frames

  constructor() {
    this.lastGesture.set("left", "none");
    this.lastGesture.set("right", "none");
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
    videoHeight: number
  ): GestureEvent | null {
    const gesture = this.classifyGesture(landmarks);
    const confidence = this.calculateConfidence(landmarks, gesture);

    // Get index finger tip position for the event
    const indexTip = landmarks[8];
    const position: Position = {
      x: indexTip.x * videoWidth,
      y: indexTip.y * videoHeight,
    };

    // Update gesture tracking
    const currentGesture = this.lastGesture.get(hand) || "none";
    const currentFrameCount = this.gestureFrameCount.get(hand) || 0;

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
      return {
        type: gesture,
        hand,
        confidence,
        position,
      };
    }

    return null;
  }

  /**
   * Classify the gesture based on hand landmarks
   */
  private classifyGesture(landmarks: HandLandmarks): GestureType {
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
   * Calculate confidence score for the detected gesture
   */
  private calculateConfidence(
    landmarks: HandLandmarks,
    gesture: GestureType
  ): number {
    if (gesture === "none") {
      return 0;
    }

    if (gesture === "index-finger-up") {
      return this.calculateIndexFingerUpConfidence(landmarks);
    }

    return 0;
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
   * Reset gesture state for a specific hand
   */
  resetHand(hand: HandType): void {
    this.lastGesture.set(hand, "none");
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
}
