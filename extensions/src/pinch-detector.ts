import {
  HandType,
  HandState,
  PinchConfig,
  PinchEvent,
  PinchEventType,
  HandLandmarks,
  defaultPinchConfig,
} from "./finger-tracker-types";

export class PinchDetector {
  private config: PinchConfig;
  private states: Map<HandType, HandState>;
  private eventListeners: Map<PinchEventType, ((event: PinchEvent) => void)[]>;

  constructor(config?: Partial<PinchConfig>) {
    this.config = { ...defaultPinchConfig, ...config };
    this.states = new Map();
    this.eventListeners = new Map();

    // Initialize states for both hands
    this.states.set("left", this.createInitialHandState());
    this.states.set("right", this.createInitialHandState());

    // Initialize event listener arrays
    const eventTypes: PinchEventType[] = [
      "pinch-start",
      "pinch-held",
      "pinch-released",
      "pinch-move",
    ];
    eventTypes.forEach((type) => this.eventListeners.set(type, []));
  }

  private createInitialHandState(): HandState {
    return {
      isPinching: false,
      pinchState: "",
      smoothedPinchDistance: null,
      pinchFrameCount: 0,
      releaseFrameCount: 0,
      framesSinceLastPinch: 0,
      origPinch: { x: 0, y: 0 },
      curPinch: { x: 0, y: 0 },
      positionHistory: [],
      scrollTarget: null,
      origScrollPos: { x: 0, y: 0 },
      tweenScroll: { x: 0, y: 0 },
    };
  }

  /**
   * Check if other fingers (middle, ring, pinky) are extended (not folded)
   */
  private areOtherFingersExtended(landmarks: HandLandmarks): boolean {
    // Check middle finger (landmarks: tip=12, pip=10)
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];

    // Check ring finger (landmarks: tip=16, pip=14)
    const ringTip = landmarks[16];
    const ringPip = landmarks[14];

    // Check pinky finger (landmarks: tip=20, pip=18)
    const pinkyTip = landmarks[20];
    const pinkyPip = landmarks[18];

    // A finger is extended if its tip is above (further from palm) than its base (MCP joint)
    // In MediaPipe coordinates, "above" means smaller y-value (closer to top of image)
    const isMiddleExtended = middleTip.y < middlePip.y;
    const isRingExtended = ringTip.y < ringPip.y;
    const isPinkyExtended = pinkyTip.y < pinkyPip.y;

    return isMiddleExtended && isRingExtended && isPinkyExtended;
  }

  /**
   * Check if all fingers including index are folded (not a valid pinch)
   */
  private areAllFingersFolded(landmarks: HandLandmarks): boolean {
    // Check index finger (landmarks: tip=8, mcp=5)
    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];

    // Check middle finger (landmarks: tip=12, mcp=9)
    const middleTip = landmarks[12];
    const middleMcp = landmarks[9];

    // Check ring finger (landmarks: tip=16, mcp=13)
    const ringTip = landmarks[16];
    const ringMcp = landmarks[13];

    // Check pinky finger (landmarks: tip=20, mcp=17)
    const pinkyTip = landmarks[20];
    const pinkyMcp = landmarks[17];

    // A finger is folded if its tip is below (closer to palm) than its base (MCP joint)
    // In MediaPipe coordinates, "below" means larger y-value (closer to bottom of image)
    const isIndexFolded = indexTip.y > indexMcp.y;
    const isMiddleFolded = middleTip.y > middleMcp.y;
    const isRingFolded = ringTip.y > ringMcp.y;
    const isPinkyFolded = pinkyTip.y > pinkyMcp.y;

    // Return true if ALL fingers are folded
    return isIndexFolded && isMiddleFolded && isRingFolded && isPinkyFolded;
  }

  /**
   * Process hand landmarks and detect pinch gestures
   */
  processHand(
    hand: HandType,
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number,
    screenPosition?: { x: number; y: number }
  ): void {
    const state = this.states.get(hand)!;

    // Get index finger tip (landmark 8) and thumb tip (landmark 4)
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Check finger states for valid pinch conditions
    const otherFingersExtended = this.areOtherFingersExtended(landmarks);
    const allFingersFolded = this.areAllFingersFolded(landmarks);

    // Calculate pinch distance in normalized space
    const pinchDistance = this.calculatePinchDistance(
      indexTip,
      thumbTip,
      videoWidth,
      videoHeight
    );

    // Update smoothed pinch distance
    this.updateSmoothedDistance(state, pinchDistance);

    // Detect pinch state - only if:
    // 1. Other fingers are extended (not folded)
    // 2. NOT all fingers are folded (that's a fist, not a pinch)
    // 3. Basic pinch distance threshold is met
    const isCurrentlyPinching =
      otherFingersExtended && !allFingersFolded && this.detectPinch(state);

    // Update current pinch position BEFORE state transitions
    state.curPinch = { x: indexTip.x, y: indexTip.y };

    // Only log significant state changes
    if (state.isPinching !== isCurrentlyPinching) {
      console.log(`[PinchDetector] ${hand} hand state change:`, {
        from: state.isPinching ? "pinching" : "not-pinching",
        to: isCurrentlyPinching ? "pinching" : "not-pinching",
        pinchState: state.pinchState,
        frameCount: state.pinchFrameCount,
      });
    }

    // Update frame counters and state BEFORE updating isPinching
    this.updatePinchState(
      hand,
      state,
      isCurrentlyPinching,
      indexTip,
      screenPosition
    );

    // Update pinching state AFTER state transitions
    state.isPinching = isCurrentlyPinching;

    // Add to position history
    const currentTime = Date.now();
    state.positionHistory.push({
      x: indexTip.x,
      y: indexTip.y,
      timestamp: currentTime,
    });

    // Limit history size
    if (state.positionHistory.length > this.config.historyLimit) {
      state.positionHistory.shift();
    }
  }

  /**
   * Calculate pinch distance (MediaPipe already provides normalized coordinates)
   */
  private calculatePinchDistance(
    indexTip: { x: number; y: number },
    thumbTip: { x: number; y: number },
    videoWidth: number,
    videoHeight: number
  ): number {
    // Validate video dimensions - this helps identify coordinate transformation issues
    if (videoWidth <= 1 || videoHeight <= 1) {
      console.warn(`[PinchDetector] Invalid video dimensions detected:`, {
        videoWidth,
        videoHeight,
        indexTip,
        thumbTip,
        message: "This may cause incorrect pinch detection",
      });
    }

    // MediaPipe provides normalized coordinates (0-1), so calculate raw distance
    const distance = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
        Math.pow(indexTip.y - thumbTip.y, 2)
    );

    // Only log distance calculation issues
    if (videoWidth <= 1 || videoHeight <= 1) {
      console.log(
        `[PinchDetector] Distance: ${distance.toFixed(4)} (thresholds: enter=${this.config.pinchEnterThreshold}, exit=${this.config.pinchExitThreshold})`
      );
    }

    // Return raw distance since MediaPipe coordinates are already normalized
    return distance;
  }

  /**
   * Update exponential moving average for pinch distance
   */
  private updateSmoothedDistance(state: HandState, distance: number): void {
    if (state.smoothedPinchDistance === null) {
      state.smoothedPinchDistance = distance;
    } else {
      state.smoothedPinchDistance =
        this.config.pinchEmaAlpha * distance +
        (1 - this.config.pinchEmaAlpha) * state.smoothedPinchDistance;
    }
  }

  /**
   * Detect if pinch is active using hysteresis
   */
  private detectPinch(state: HandState): boolean {
    const smoothedDistance = state.smoothedPinchDistance!;

    if (!state.isPinching) {
      // Not currently pinching - use lower threshold to enter
      const result = smoothedDistance < this.config.pinchEnterThreshold;
      return result;
    } else {
      // Currently pinching - use higher threshold to exit (hysteresis)
      const result = smoothedDistance < this.config.pinchExitThreshold;
      return result;
    }
  }

  /**
   * Update pinch state and emit events - FIXED VERSION
   */
  private updatePinchState(
    hand: HandType,
    state: HandState,
    isCurrentlyPinching: boolean,
    indexTip: { x: number; y: number },
    screenPosition?: { x: number; y: number }
  ): void {
    // Handle state transitions
    if (isCurrentlyPinching && !state.isPinching) {
      // Starting to pinch - reset and start counting
      state.pinchFrameCount = 1;
      state.releaseFrameCount = 0;

      if (state.pinchFrameCount >= this.config.framesToConfirmPinch) {
        // Confirmed pinch start
        state.origPinch = { x: indexTip.x, y: indexTip.y };
        state.pinchState = "start";

        console.log(`[PinchDetector] ${hand} pinch started`);
        this.emitEvent("pinch-start", {
          type: "pinch-start",
          hand,
          position: screenPosition || { x: indexTip.x, y: indexTip.y },
          origPinch: state.origPinch,
          curPinch: state.curPinch,
        });
      }
    } else if (!isCurrentlyPinching && state.isPinching) {
      // Releasing pinch
      state.releaseFrameCount++;

      if (state.releaseFrameCount >= this.config.framesToReleasePinch) {
        // Confirmed release
        state.pinchState = "released";

        console.log(`[PinchDetector] ${hand} pinch released`);
        this.emitEvent("pinch-released", {
          type: "pinch-released",
          hand,
          position: screenPosition || { x: indexTip.x, y: indexTip.y },
          origPinch: state.origPinch,
          curPinch: state.curPinch,
        });
      }
    } else if (isCurrentlyPinching && state.isPinching) {
      // Continuing pinch - handle frame counting properly
      state.framesSinceLastPinch = 0;

      if (state.pinchState === "") {
        // Still accumulating frames to reach start state
        state.pinchFrameCount++;

        if (state.pinchFrameCount >= this.config.framesToConfirmPinch) {
          // Confirmed pinch start
          state.origPinch = { x: indexTip.x, y: indexTip.y };
          state.pinchState = "start";

          console.log(`[PinchDetector] ${hand} pinch started (accumulated)`);
          this.emitEvent("pinch-start", {
            type: "pinch-start",
            hand,
            position: screenPosition || { x: indexTip.x, y: indexTip.y },
            origPinch: state.origPinch,
            curPinch: state.curPinch,
          });
        }
      } else {
        // Already in start or held state - handle transitions
        if (
          state.pinchState === "start" &&
          state.pinchFrameCount > this.config.maxPinchHeldFrames
        ) {
          state.pinchState = "held";
          console.log(`[PinchDetector] ${hand} pinch transitioned to held`);
        }

        if (state.pinchState === "held") {
          this.emitEvent("pinch-held", {
            type: "pinch-held",
            hand,
            position: screenPosition || { x: indexTip.x, y: indexTip.y },
            origPinch: state.origPinch,
            curPinch: state.curPinch,
          });

          this.emitEvent("pinch-move", {
            type: "pinch-move",
            hand,
            position: screenPosition || { x: indexTip.x, y: indexTip.y },
            origPinch: state.origPinch,
            curPinch: state.curPinch,
          });
        }

        // Increment frame count for held state duration tracking
        state.pinchFrameCount++;
      }

      state.releaseFrameCount = 0;
    } else {
      // Not pinching
      state.framesSinceLastPinch++;

      if (state.framesSinceLastPinch > this.config.errorToleranceFrames) {
        state.pinchState = "";
      }

      state.pinchFrameCount = 0;
      state.releaseFrameCount++;
    }
  }

  /**
   * Reset hand state when hand is no longer detected
   */
  resetHand(hand: HandType): void {
    const state = this.states.get(hand)!;

    // Reset all state values
    state.isPinching = false;
    state.pinchState = "";
    state.smoothedPinchDistance = null;
    state.pinchFrameCount = 0;
    state.releaseFrameCount = 0;
    state.framesSinceLastPinch = 0;
    state.positionHistory = [];
    state.scrollTarget = null;
  }

  /**
   * Get current state for a hand
   */
  getHandState(hand: HandType): HandState {
    return this.states.get(hand)!;
  }

  /**
   * Add event listener
   */
  on(type: PinchEventType, callback: (event: PinchEvent) => void): void {
    const listeners = this.eventListeners.get(type) || [];
    listeners.push(callback);
    this.eventListeners.set(type, listeners);
  }

  /**
   * Remove event listener
   */
  off(type: PinchEventType, callback: (event: PinchEvent) => void): void {
    const listeners = this.eventListeners.get(type) || [];
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(type, listeners);
    }
  }

  /**
   * Emit event to all registered listeners
   */
  private emitEvent(type: PinchEventType, event: PinchEvent): void {
    const listeners = this.eventListeners.get(type) || [];

    // Only log important events
    if (type === "pinch-start" || type === "pinch-released") {
      console.log(
        `[PinchDetector] Emitting ${type} for ${event.hand} hand (${listeners.length} listeners)`
      );
    }

    listeners.forEach((callback, index) => {
      try {
        callback(event);
      } catch (error) {
        console.error(
          `[PinchDetector] Listener ${index + 1} failed for ${type}:`,
          error
        );
      }
    });
  }

  /**
   * Update pinch thresholds for testing and calibration
   */
  updateThresholds(enterThreshold: number, exitThreshold: number): void {
    console.log(`[PinchDetector] Updating thresholds:`, {
      oldEnterThreshold: this.config.pinchEnterThreshold,
      oldExitThreshold: this.config.pinchExitThreshold,
      newEnterThreshold: enterThreshold,
      newExitThreshold: exitThreshold,
    });

    this.config.pinchEnterThreshold = enterThreshold;
    this.config.pinchExitThreshold = exitThreshold;
  }

  /**
   * Get current threshold configuration
   */
  getThresholds(): { enterThreshold: number; exitThreshold: number } {
    return {
      enterThreshold: this.config.pinchEnterThreshold,
      exitThreshold: this.config.pinchExitThreshold,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.states.clear();
    this.eventListeners.clear();
  }
}
