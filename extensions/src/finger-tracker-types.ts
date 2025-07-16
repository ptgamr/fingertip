// Types and interfaces for the multi-hand finger tracking system

// Hand identification
export type HandType = "left" | "right";
export type FingerType = "index" | "middle" | "ring" | "pinky";

// Pinch state types
export type PinchState = "" | "start" | "held" | "released";

// Basic position interface
export interface Position {
  x: number;
  y: number;
}

// Position with timestamp
export interface TimestampedPosition extends Position {
  timestamp: number;
}

// Hand landmarks from MediaPipe
export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandLandmarks extends Array<HandLandmark> {}

// Handedness information from MediaPipe
export interface Handedness {
  index: number;
  score: number;
  label: string; // 'Left' or 'Right'
}

// State for a single hand
export interface HandState {
  // Pinch detection
  isPinching: boolean;
  pinchState: PinchState;
  smoothedPinchDistance: number | null;

  // Frame counting
  pinchFrameCount: number;
  releaseFrameCount: number;
  framesSinceLastPinch: number;

  // Positions
  origPinch: Position;
  curPinch: Position;

  // Position history for smoothing
  positionHistory: TimestampedPosition[];

  // Scroll state
  scrollTarget: Element | Window | null;
  origScrollPos: Position;
  tweenScroll: Position;
}

// Configuration for pinch detection
export interface PinchConfig {
  // Thresholds
  pinchEnterThreshold: number;
  pinchExitThreshold: number;
  pinchMovementThreshold: number;

  // Frame requirements
  framesToConfirmPinch: number;
  framesToReleasePinch: number;
  maxPinchHeldFrames: number;
  errorToleranceFrames: number;

  // Smoothing
  pinchEmaAlpha: number;
  historyLimit: number;
}

// Configuration for scrolling
export interface ScrollConfig {
  scrollSpeed: number;
  tweenDuration: number;
  tweenEase: string;
}

// Configuration for visual feedback
export interface VisualConfig {
  leftHandColor: string;
  rightHandColor: string;
  dotSize: number;
  glowIntensity: number;
  tweenDuration: number;
  showDebug: boolean;
}

// Main configuration
export interface FingerTrackerConfig {
  pinch?: Partial<PinchConfig>;
  scroll?: Partial<ScrollConfig>;
  visual?: Partial<VisualConfig>;
}

// Event types
export type PinchEventType =
  | "pinch-start"
  | "pinch-held"
  | "pinch-released"
  | "pinch-move";

// Event data
export interface PinchEvent {
  type: PinchEventType;
  hand: HandType;
  position: Position;
  origPinch: Position;
  curPinch: Position;
}

// Default configurations
export const defaultPinchConfig: PinchConfig = {
  // Based on debug logs showing typical distances of 0.057-0.107
  // Adjusted to be more realistic for normalized coordinates
  pinchEnterThreshold: 0.08, // Higher threshold to enter pinch state
  pinchExitThreshold: 0.1, // Even higher for hysteresis to prevent flicker
  pinchMovementThreshold: 15,
  framesToConfirmPinch: 3,
  framesToReleasePinch: 5,
  maxPinchHeldFrames: 1,
  errorToleranceFrames: 5,
  pinchEmaAlpha: 0.6,
  historyLimit: 10,
};

export const defaultScrollConfig: ScrollConfig = {
  scrollSpeed: 1,
  tweenDuration: 1,
  tweenEase: "linear.easeNone",
};

export const defaultVisualConfig: VisualConfig = {
  leftHandColor: "#ff0000",
  rightHandColor: "#0000ff",
  dotSize: 12,
  glowIntensity: 20,
  tweenDuration: 0.15,
  showDebug: true,
};
