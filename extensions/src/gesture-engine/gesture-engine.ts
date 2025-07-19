// Main GestureEngine class - unified gesture detection and event system
import {
  GestureType,
  GesturePhase,
  GestureEvent,
  GestureEventType,
  GestureEventListener,
  GestureEngineConfig,
  GestureDetectionResult,
  IGestureDetector,
  GestureDetectorConfig,
  defaultGestureEngineConfig,
} from "./gesture-engine-types";
import { GestureEventBus } from "./gesture-event-bus";
import { GestureStateMachine } from "./gesture-state-machine";
import { HandType, HandLandmarks, Position } from "../finger-tracker-types";
import {
  PinchGestureDetector,
  GrabGestureDetector,
  PalmRaiseGestureDetector,
  IndexFingerGestureDetector,
  MiddleFingerGestureDetector,
} from "./detectors";

export class GestureEngine {
  private eventBus: GestureEventBus;
  private stateMachine: GestureStateMachine;
  private detectors: Map<GestureType, IGestureDetector>;
  private config: GestureEngineConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<GestureEngineConfig>) {
    this.config = { ...defaultGestureEngineConfig, ...config };

    // Initialize core components
    this.eventBus = new GestureEventBus(this.config.debug?.logEvents || false);
    // Ensure we have a complete config for the state machine
    const completeConfig = {
      ...defaultGestureEngineConfig.global!,
      ...this.config.global,
    } as GestureDetectorConfig;

    this.stateMachine = new GestureStateMachine(
      this.eventBus,
      completeConfig,
      this.config.debug?.logStateTransitions || false
    );
    this.detectors = new Map();

    // Initialize detectors (will be populated in Phase 2)
    this.initializeDetectors();

    this.isInitialized = true;

    console.log(
      "[GestureEngine] Initialized with unified event-based architecture"
    );
  }

  /**
   * Initialize gesture detectors
   */
  private initializeDetectors(): void {
    // Create and register all gesture detectors
    this.registerDetector(new PinchGestureDetector());
    this.registerDetector(new GrabGestureDetector());
    this.registerDetector(new PalmRaiseGestureDetector());
    this.registerDetector(new IndexFingerGestureDetector());
    this.registerDetector(new MiddleFingerGestureDetector());

    console.log(
      `[GestureEngine] Initialized ${this.detectors.size} gesture detectors`
    );
  }

  /**
   * Register a gesture detector
   */
  registerDetector(detector: IGestureDetector): void {
    this.detectors.set(detector.gestureType, detector);
    console.log(
      `[GestureEngine] Registered detector for ${detector.gestureType}`
    );
  }

  /**
   * Main processing method - replaces both GestureDetector and PinchDetector
   */
  processHand(
    hand: HandType,
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean = false
  ): void {
    if (!this.isInitialized) {
      console.warn("[GestureEngine] Not initialized, skipping processing");
      return;
    }

    // Run all gesture detectors
    const detectionResults = this.runAllDetectors(
      landmarks,
      videoWidth,
      videoHeight,
      isMirrored
    );

    // Calculate current position from landmarks (using index finger tip as default)
    const currentPosition = this.calculatePosition(
      landmarks,
      videoWidth,
      videoHeight,
      isMirrored,
      hand
    );

    // Process through state machine
    this.stateMachine.processGesture(hand, detectionResults, currentPosition);

    if (this.config.debug?.logDetectionResults) {
      this.logDetectionResults(hand, detectionResults);
    }
  }

  /**
   * Run all registered gesture detectors
   */
  private runAllDetectors(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean
  ): Map<GestureType, GestureDetectionResult> {
    const results = new Map<GestureType, GestureDetectionResult>();

    // Run each registered detector
    this.detectors.forEach((detector, gestureType) => {
      try {
        const result = detector.detect(
          landmarks,
          videoWidth,
          videoHeight,
          isMirrored
        );
        results.set(gestureType, result);
      } catch (error) {
        console.error(
          `[GestureEngine] Error in ${gestureType} detector:`,
          error
        );
        // Set failed detection result
        results.set(gestureType, {
          isActive: false,
          confidence: 0,
          referencePoint: { x: 0, y: 0 },
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    return results;
  }

  /**
   * Calculate position from landmarks
   */
  private calculatePosition(
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean,
    hand: HandType
  ): Position {
    // Use index finger tip as default reference point
    const indexTip = landmarks[8];
    return this.landmarkToScreen(
      indexTip,
      videoWidth,
      videoHeight,
      isMirrored,
      hand
    );
  }

  /**
   * Convert landmark position to screen coordinates
   */
  private landmarkToScreen(
    landmark: { x: number; y: number },
    videoWidth: number,
    videoHeight: number,
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

  /**
   * Log detection results for debugging
   */
  private logDetectionResults(
    hand: HandType,
    results: Map<GestureType, GestureDetectionResult>
  ): void {
    const activeGestures = Array.from(results.entries())
      .filter(([_, result]) => result.isActive)
      .map(([type, result]) => `${type}(${result.confidence.toFixed(2)})`);

    if (activeGestures.length > 0) {
      console.log(
        `[GestureEngine] ${hand} hand active gestures: ${activeGestures.join(", ")}`
      );
    }
  }

  // Event subscription methods - clean API for consumers

  /**
   * Subscribe to specific gesture events
   */
  on(eventType: GestureEventType, listener: GestureEventListener): void {
    this.eventBus.on(eventType, listener);
  }

  /**
   * Subscribe to specific gesture events (one-time only)
   */
  once(eventType: GestureEventType, listener: GestureEventListener): void {
    this.eventBus.once(eventType, listener);
  }

  /**
   * Subscribe to all gesture events
   */
  onAny(listener: GestureEventListener): void {
    this.eventBus.onAny(listener);
  }

  /**
   * Remove event listener
   */
  off(eventType: GestureEventType, listener: GestureEventListener): void {
    this.eventBus.off(eventType, listener);
  }

  /**
   * Remove wildcard listener
   */
  offAny(listener: GestureEventListener): void {
    this.eventBus.offAny(listener);
  }

  // Convenience methods for common gesture patterns

  /**
   * Subscribe to gesture start events
   */
  onGestureStart(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.eventBus.onGestureStart(gestureType, listener);
  }

  /**
   * Subscribe to gesture end events
   */
  onGestureEnd(gestureType: GestureType, listener: GestureEventListener): void {
    this.eventBus.onGestureEnd(gestureType, listener);
  }

  /**
   * Subscribe to gesture held events
   */
  onGestureHeld(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.eventBus.onGestureHeld(gestureType, listener);
  }

  /**
   * Subscribe to gesture move events
   */
  onGestureMove(
    gestureType: GestureType,
    listener: GestureEventListener
  ): void {
    this.eventBus.onGestureMove(gestureType, listener);
  }

  /**
   * Subscribe to all phases of a specific gesture
   */
  onGestureAll(gestureType: GestureType, listener: GestureEventListener): void {
    this.eventBus.onGestureAll(gestureType, listener);
  }

  // Utility and management methods

  /**
   * Reset hand state when hand is no longer detected
   */
  resetHand(hand: HandType): void {
    this.stateMachine.resetHand(hand);
  }

  /**
   * Get current hand state for debugging
   */
  getHandState(hand: HandType) {
    return this.stateMachine.getHandState(hand);
  }

  /**
   * Get registered gesture types
   */
  getRegisteredGestures(): GestureType[] {
    return Array.from(this.detectors.keys());
  }

  /**
   * Check if a gesture detector is registered
   */
  hasDetector(gestureType: GestureType): boolean {
    return this.detectors.has(gestureType);
  }

  /**
   * Get listener counts for debugging
   */
  getListenerCounts(): Record<string, number> {
    return this.eventBus.getListenerCounts();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GestureEngineConfig>): void {
    this.config = { ...this.config, ...config };

    // Update components with new config
    if (config.global) {
      this.stateMachine.updateConfig(config.global);
    }

    if (config.debug?.logEvents !== undefined) {
      this.eventBus.setDebugEnabled(config.debug.logEvents);
    }

    if (config.debug?.logStateTransitions !== undefined) {
      this.stateMachine.setDebugEnabled(config.debug.logStateTransitions);
    }
  }

  /**
   * Enable or disable debug mode
   */
  setDebugEnabled(enabled: boolean): void {
    this.updateConfig({
      debug: {
        logEvents: enabled,
        logStateTransitions: enabled,
        logDetectionResults: enabled,
      },
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): GestureEngineConfig {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.isInitialized = false;
    this.eventBus.clear();
    this.detectors.clear();
    console.log("[GestureEngine] Destroyed and cleaned up resources");
  }

  /**
   * Get engine status for debugging
   */
  getStatus(): {
    initialized: boolean;
    detectorCount: number;
    listenerCounts: Record<string, number>;
    config: GestureEngineConfig;
  } {
    return {
      initialized: this.isInitialized,
      detectorCount: this.detectors.size,
      listenerCounts: this.getListenerCounts(),
      config: this.getConfig(),
    };
  }
}
