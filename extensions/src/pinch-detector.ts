import {
  HandType,
  HandState,
  PinchState,
  PinchConfig,
  PinchEvent,
  PinchEventType,
  HandLandmarks,
  Handedness,
  Position,
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

    // Calculate pinch distance in normalized space
    const pinchDistance = this.calculatePinchDistance(
      indexTip,
      thumbTip,
      videoWidth,
      videoHeight
    );

    // Update smoothed pinch distance
    this.updateSmoothedDistance(state, pinchDistance);

    // Detect pinch state
    const isCurrentlyPinching = this.detectPinch(state);

    // Update frame counters and state
    this.updatePinchState(
      hand,
      state,
      isCurrentlyPinching,
      indexTip,
      screenPosition
    );

    // Update current pinch position
    state.curPinch = { x: indexTip.x, y: indexTip.y };

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

    // Update pinching state
    state.isPinching = isCurrentlyPinching;
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
    // MediaPipe provides normalized coordinates (0-1), so calculate raw distance
    const distance = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
        Math.pow(indexTip.y - thumbTip.y, 2)
    );

    // DEBUG: Log distance calculation
    console.log(`[PinchDetector] Pinch distance calculation:`, {
      indexTip,
      thumbTip,
      distance,
      enterThreshold: this.config.pinchEnterThreshold,
      exitThreshold: this.config.pinchExitThreshold,
      referenceThreshold: 0.045,
    });

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
      console.log(`[PinchDetector] Pinch detection (not pinching):`, {
        smoothedDistance,
        enterThreshold: this.config.pinchEnterThreshold,
        result,
        comparison: `${smoothedDistance} < ${this.config.pinchEnterThreshold} = ${result}`,
      });
      return result;
    } else {
      // Currently pinching - use higher threshold to exit (hysteresis)
      const result = smoothedDistance < this.config.pinchExitThreshold;
      console.log(`[PinchDetector] Pinch detection (currently pinching):`, {
        smoothedDistance,
        exitThreshold: this.config.pinchExitThreshold,
        result,
        comparison: `${smoothedDistance} < ${this.config.pinchExitThreshold} = ${result}`,
      });
      return result;
    }
  }

  /**
   * Update pinch state and emit events
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
      // Starting to pinch
      state.pinchFrameCount++;
      state.releaseFrameCount = 0;

      if (state.pinchFrameCount >= this.config.framesToConfirmPinch) {
        // Confirmed pinch start
        state.origPinch = { x: indexTip.x, y: indexTip.y };
        state.pinchState = "start";

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

        this.emitEvent("pinch-released", {
          type: "pinch-released",
          hand,
          position: screenPosition || { x: indexTip.x, y: indexTip.y },
          origPinch: state.origPinch,
          curPinch: state.curPinch,
        });
      }
    } else if (isCurrentlyPinching) {
      // Continuing pinch
      state.framesSinceLastPinch = 0;

      if (
        state.pinchState === "start" &&
        state.pinchFrameCount > this.config.maxPinchHeldFrames
      ) {
        state.pinchState = "held";
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

      state.pinchFrameCount++;
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
    listeners.forEach((callback) => callback(event));
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.states.clear();
    this.eventListeners.clear();
  }
}
