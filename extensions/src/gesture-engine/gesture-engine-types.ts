// Unified event-based gesture system types and interfaces
import { HandType, HandLandmarks, Position } from "../finger-tracker-types";

// Unified gesture types - all gestures supported by the system
export type GestureType =
  | "pinch"
  | "grab"
  | "palm-raise"
  | "index-finger-up"
  | "middle-finger-up"
  | "none";

// Standardized event phases for ALL gestures
export type GesturePhase = "start" | "held" | "move" | "released";

// Unified gesture event structure
export interface GestureEvent {
  // Core identification
  type: GestureType;
  phase: GesturePhase;
  hand: HandType;

  // Positioning and confidence
  position: Position;
  confidence: number;

  // State tracking
  startPosition: Position;
  currentPosition: Position;

  // Timing information
  timestamp: number;
  duration: number; // Time since gesture started (ms)

  // Additional context
  metadata?: Record<string, any>;
}

// Event listener types
export type GestureEventType = `${GestureType}-${GesturePhase}`;
export type GestureEventListener = (event: GestureEvent) => void;

// Gesture detection result from individual detectors
export interface GestureDetectionResult {
  isActive: boolean;
  confidence: number;
  referencePoint: { x: number; y: number };
  metadata?: Record<string, any>;
}

// Interface for individual gesture detectors
export interface IGestureDetector {
  readonly gestureType: GestureType;

  detect(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): GestureDetectionResult;

  calculateConfidence(landmarks: HandLandmarks): number;
  getReferencePoint(landmarks: HandLandmarks): { x: number; y: number };
}

// Hand state for gesture tracking
export interface GestureHandState {
  // Current gesture state
  currentGesture: GestureType;
  currentPhase: GesturePhase;
  confidence: number;

  // Timing and position tracking
  startTime: number;
  startPosition: Position;
  lastPosition: Position;

  // Frame-based stability tracking
  frameCount: number;
  stableFrameCount: number;
  transitionFrameCount: number;

  // Phase-specific data
  phaseData?: Record<string, any>;
}

// State transition information
export interface StateTransition {
  from: { gesture: GestureType; phase: GesturePhase };
  to: { gesture: GestureType; phase: GesturePhase };
  event: GestureEvent;
}

// Configuration for gesture detection
export interface GestureDetectorConfig {
  // Confidence thresholds
  confidenceThreshold: number;

  // Frame requirements for stability
  framesToConfirmStart: number;
  framesToConfirmHeld: number;
  framesToConfirmRelease: number;

  // Timing thresholds
  maxHeldFrames: number; // Frames before transitioning from start to held
  errorToleranceFrames: number;

  // Movement thresholds
  movementThreshold: number; // Minimum movement to trigger move events
}

// Configuration for the gesture engine
export interface GestureEngineConfig {
  // Individual gesture detector configs
  detectors?: {
    [K in GestureType]?: Partial<GestureDetectorConfig>;
  };

  // Global settings
  global?: Partial<GestureDetectorConfig>;

  // Debug settings
  debug?: {
    logEvents?: boolean;
    logStateTransitions?: boolean;
    logDetectionResults?: boolean;
  };
}

// Default configuration values
export const defaultGestureDetectorConfig: GestureDetectorConfig = {
  confidenceThreshold: 0.7,
  framesToConfirmStart: 3,
  framesToConfirmHeld: 1,
  framesToConfirmRelease: 5,
  maxHeldFrames: 1,
  errorToleranceFrames: 5,
  movementThreshold: 15,
};

export const defaultGestureEngineConfig: GestureEngineConfig = {
  global: defaultGestureDetectorConfig,
  debug: {
    logEvents: false,
    logStateTransitions: false,
    logDetectionResults: false,
  },
};

// Utility type for gesture-specific event subscriptions
export type GestureSpecificEventType<T extends GestureType> =
  `${T}-${GesturePhase}`;

// Event subscription patterns
export interface GestureEventSubscription {
  eventType: GestureEventType;
  listener: GestureEventListener;
  once?: boolean; // Remove after first trigger
}

// Gesture priority for conflict resolution
export const GESTURE_PRIORITY: Record<GestureType, number> = {
  pinch: 5,
  grab: 4,
  "index-finger-up": 3,
  "middle-finger-up": 3,
  "palm-raise": 2,
  none: 1,
};
