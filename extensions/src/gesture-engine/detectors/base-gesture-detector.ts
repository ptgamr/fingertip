// Base class for all gesture detectors
import {
  GestureType,
  GestureDetectionResult,
  IGestureDetector,
} from "../gesture-engine-types";
import { HandLandmarks } from "../../finger-tracker-types";

export abstract class BaseGestureDetector implements IGestureDetector {
  abstract readonly gestureType: GestureType;

  /**
   * Main detection method - must be implemented by subclasses
   */
  abstract detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult;

  /**
   * Calculate confidence score - must be implemented by subclasses
   */
  abstract calculateConfidence(landmarks: HandLandmarks): number;

  /**
   * Get reference point for position tracking - must be implemented by subclasses
   */
  abstract getReferencePoint(landmarks: HandLandmarks): {
    x: number;
    y: number;
  };

  // Utility methods for common gesture detection patterns

  /**
   * Check if a finger is extended (tip above base)
   */
  protected isFingerExtended(
    landmarks: HandLandmarks,
    tipIndex: number,
    baseIndex: number,
    threshold: number = 0.05
  ): boolean {
    const tip = landmarks[tipIndex];
    const base = landmarks[baseIndex];
    return tip.y < base.y - threshold;
  }

  /**
   * Check if a finger is folded (tip below base)
   */
  protected isFingerFolded(
    landmarks: HandLandmarks,
    tipIndex: number,
    baseIndex: number,
    threshold: number = 0.02
  ): boolean {
    const tip = landmarks[tipIndex];
    const base = landmarks[baseIndex];
    return tip.y >= base.y - threshold;
  }

  /**
   * Calculate distance between two landmarks
   */
  protected calculateDistance(
    point1: { x: number; y: number },
    point2: { x: number; y: number }
  ): number {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if finger is straight (joints aligned vertically)
   */
  protected isFingerStraight(
    landmarks: HandLandmarks,
    mcpIndex: number,
    pipIndex: number,
    dipIndex: number,
    tipIndex: number,
    alignmentThreshold: number = 0.1
  ): boolean {
    const mcp = landmarks[mcpIndex];
    const pip = landmarks[pipIndex];
    const dip = landmarks[dipIndex];
    const tip = landmarks[tipIndex];

    // Check horizontal alignment
    const horizontalAlignment = Math.abs(tip.x - mcp.x) < alignmentThreshold;

    // Check vertical progression (each joint above the previous)
    const verticalProgression = pip.y < mcp.y && dip.y < pip.y && tip.y < dip.y;

    return horizontalAlignment && verticalProgression;
  }

  /**
   * Calculate average distance between multiple finger tips
   */
  protected calculateAverageFingerSpread(
    landmarks: HandLandmarks,
    fingerTipIndices: number[]
  ): number {
    if (fingerTipIndices.length < 2) return 0;

    let totalDistance = 0;
    let pairCount = 0;

    for (let i = 0; i < fingerTipIndices.length - 1; i++) {
      for (let j = i + 1; j < fingerTipIndices.length; j++) {
        const tip1 = landmarks[fingerTipIndices[i]];
        const tip2 = landmarks[fingerTipIndices[j]];
        totalDistance += this.calculateDistance(tip1, tip2);
        pairCount++;
      }
    }

    return totalDistance / pairCount;
  }

  /**
   * Check if all specified fingers are folded
   */
  protected areFingersFolded(
    landmarks: HandLandmarks,
    fingerConfigs: Array<{ tipIndex: number; baseIndex: number }>,
    threshold: number = 0.02
  ): boolean {
    return fingerConfigs.every((config) =>
      this.isFingerFolded(
        landmarks,
        config.tipIndex,
        config.baseIndex,
        threshold
      )
    );
  }

  /**
   * Check if all specified fingers are extended
   */
  protected areFingersExtended(
    landmarks: HandLandmarks,
    fingerConfigs: Array<{ tipIndex: number; baseIndex: number }>,
    threshold: number = 0.05
  ): boolean {
    return fingerConfigs.every((config) =>
      this.isFingerExtended(
        landmarks,
        config.tipIndex,
        config.baseIndex,
        threshold
      )
    );
  }

  /**
   * Calculate confidence based on how well conditions are met
   */
  protected calculateConditionConfidence(
    conditions: Array<{ met: boolean; weight: number }>
  ): number {
    const totalWeight = conditions.reduce(
      (sum, condition) => sum + condition.weight,
      0
    );
    const metWeight = conditions
      .filter((condition) => condition.met)
      .reduce((sum, condition) => sum + condition.weight, 0);

    return totalWeight > 0 ? metWeight / totalWeight : 0;
  }

  /**
   * Normalize confidence score to 0-1 range
   */
  protected normalizeConfidence(
    score: number,
    min: number = 0,
    max: number = 1
  ): number {
    return Math.max(0, Math.min(1, (score - min) / (max - min)));
  }

  /**
   * Apply exponential smoothing to confidence scores
   */
  protected smoothConfidence(
    currentConfidence: number,
    previousConfidence: number,
    alpha: number = 0.3
  ): number {
    return alpha * currentConfidence + (1 - alpha) * previousConfidence;
  }
}

// Common finger landmark indices for easy reference
export const FINGER_LANDMARKS = {
  THUMB: { MCP: 2, IP: 3, TIP: 4 },
  INDEX: { MCP: 5, PIP: 6, DIP: 7, TIP: 8 },
  MIDDLE: { MCP: 9, PIP: 10, DIP: 11, TIP: 12 },
  RING: { MCP: 13, PIP: 14, DIP: 15, TIP: 16 },
  PINKY: { MCP: 17, PIP: 18, DIP: 19, TIP: 20 },
  WRIST: 0,
} as const;
