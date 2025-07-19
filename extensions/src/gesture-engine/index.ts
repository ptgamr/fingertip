// Gesture Engine - Unified event-based gesture detection system
// Export all public interfaces and classes

export * from "./gesture-engine-types";
export * from "./gesture-event-bus";
export * from "./gesture-state-machine";
export * from "./gesture-engine";
export * from "./detectors";

// Re-export commonly used types for convenience
export type {
  GestureType,
  GesturePhase,
  GestureEvent,
  GestureEventType,
  GestureEventListener,
  GestureEngineConfig,
  GestureDetectionResult,
  IGestureDetector,
} from "./gesture-engine-types";

// Export main class as default
export { GestureEngine as default } from "./gesture-engine";
