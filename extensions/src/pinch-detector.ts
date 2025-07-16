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

    // Update current pinch position BEFORE state transitions
    state.curPinch = { x: indexTip.x, y: indexTip.y };

    console.log(`[PinchDetector] State update for ${hand}:`, {
      wasPinching: state.isPinching,
      isCurrentlyPinching,
      pinchState: state.pinchState,
      pinchFrameCount: state.pinchFrameCount,
      releaseFrameCount: state.releaseFrameCount,
      smoothedDistance: state.smoothedPinchDistance?.toFixed(4),
      stateTransition: {
        from: state.isPinching ? "pinching" : "not-pinching",
        to: isCurrentlyPinching ? "pinching" : "not-pinching",
        willChange: state.isPinching !== isCurrentlyPinching,
      },
    });

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

    // Enhanced DEBUG: Log distance calculation with threshold analysis
    console.log(`[PinchDetector] Pinch distance calculation:`, {
      indexTip,
      thumbTip,
      distance: distance.toFixed(4),
      enterThreshold: this.config.pinchEnterThreshold,
      exitThreshold: this.config.pinchExitThreshold,
      videoWidth,
      videoHeight,
      distanceAnalysis: {
        belowEnterThreshold: distance < this.config.pinchEnterThreshold,
        belowExitThreshold: distance < this.config.pinchExitThreshold,
        percentOfEnterThreshold:
          ((distance / this.config.pinchEnterThreshold) * 100).toFixed(1) + "%",
        percentOfExitThreshold:
          ((distance / this.config.pinchExitThreshold) * 100).toFixed(1) + "%",
      },
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
        smoothedDistance: smoothedDistance.toFixed(4),
        enterThreshold: this.config.pinchEnterThreshold,
        result,
        comparison: `${smoothedDistance.toFixed(4)} < ${this.config.pinchEnterThreshold} = ${result}`,
        thresholdCalibration: {
          distanceToThreshold: (
            smoothedDistance - this.config.pinchEnterThreshold
          ).toFixed(4),
          percentageOfThreshold:
            (
              (smoothedDistance / this.config.pinchEnterThreshold) *
              100
            ).toFixed(1) + "%",
        },
      });
      return result;
    } else {
      // Currently pinching - use higher threshold to exit (hysteresis)
      const result = smoothedDistance < this.config.pinchExitThreshold;
      console.log(`[PinchDetector] Pinch detection (currently pinching):`, {
        smoothedDistance: smoothedDistance.toFixed(4),
        exitThreshold: this.config.pinchExitThreshold,
        result,
        comparison: `${smoothedDistance.toFixed(4)} < ${this.config.pinchExitThreshold} = ${result}`,
        thresholdCalibration: {
          distanceToThreshold: (
            smoothedDistance - this.config.pinchExitThreshold
          ).toFixed(4),
          percentageOfThreshold:
            ((smoothedDistance / this.config.pinchExitThreshold) * 100).toFixed(
              1
            ) + "%",
        },
      });
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
    console.log(`[PinchDetector] FRAME COUNT DEBUG - Entry:`, {
      hand,
      isCurrentlyPinching,
      wasPinching: state.isPinching,
      currentFrameCount: state.pinchFrameCount,
      currentState: state.pinchState,
      branchToTake:
        isCurrentlyPinching && !state.isPinching
          ? "STARTING"
          : !isCurrentlyPinching && state.isPinching
            ? "RELEASING"
            : isCurrentlyPinching
              ? "CONTINUING"
              : "NOT_PINCHING",
    });

    // Handle state transitions
    if (isCurrentlyPinching && !state.isPinching) {
      // Starting to pinch - reset and start counting
      state.pinchFrameCount = 1; // Start at 1, not increment from previous
      state.releaseFrameCount = 0;

      console.log(`[PinchDetector] FRAME COUNT DEBUG - STARTING branch:`, {
        hand,
        frameCountReset: state.pinchFrameCount,
        framesToConfirm: this.config.framesToConfirmPinch,
        willEmitStart:
          state.pinchFrameCount >= this.config.framesToConfirmPinch,
      });

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

      console.log(`[PinchDetector] FRAME COUNT DEBUG - RELEASING branch:`, {
        hand,
        releaseFrameCount: state.releaseFrameCount,
        framesToRelease: this.config.framesToReleasePinch,
        willEmitRelease:
          state.releaseFrameCount >= this.config.framesToReleasePinch,
      });

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
    } else if (isCurrentlyPinching && state.isPinching) {
      // Continuing pinch - handle frame counting properly
      state.framesSinceLastPinch = 0;

      if (state.pinchState === "") {
        // Still accumulating frames to reach start state
        state.pinchFrameCount++;

        console.log(
          `[PinchDetector] FRAME COUNT DEBUG - CONTINUING (accumulating):`,
          {
            hand,
            frameCountAfter: state.pinchFrameCount,
            framesToConfirm: this.config.framesToConfirmPinch,
            willEmitStart:
              state.pinchFrameCount >= this.config.framesToConfirmPinch,
          }
        );

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
      } else {
        // Already in start or held state - handle transitions
        console.log(
          `[PinchDetector] FRAME COUNT DEBUG - CONTINUING (in state):`,
          {
            hand,
            currentState: state.pinchState,
            frameCount: state.pinchFrameCount,
            maxPinchHeldFrames: this.config.maxPinchHeldFrames,
            willTransitionToHeld:
              state.pinchState === "start" &&
              state.pinchFrameCount > this.config.maxPinchHeldFrames,
          }
        );

        if (
          state.pinchState === "start" &&
          state.pinchFrameCount > this.config.maxPinchHeldFrames
        ) {
          state.pinchState = "held";
          console.log(
            `[PinchDetector] Transitioned to held state for ${hand} hand`
          );
        }

        if (state.pinchState === "held") {
          console.log(`[PinchDetector] Emitting pinch-held for ${hand} hand`);
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
      console.log(`[PinchDetector] FRAME COUNT DEBUG - NOT_PINCHING branch:`, {
        hand,
        frameCountBefore: state.pinchFrameCount,
        framesSinceLastPinch: state.framesSinceLastPinch,
        errorToleranceFrames: this.config.errorToleranceFrames,
        willResetState:
          state.framesSinceLastPinch > this.config.errorToleranceFrames,
        aboutToResetFrameCount: true,
      });

      state.framesSinceLastPinch++;

      if (state.framesSinceLastPinch > this.config.errorToleranceFrames) {
        state.pinchState = "";
        console.log(
          `[PinchDetector] FRAME COUNT DEBUG - Resetting pinch state to empty`
        );
      }

      state.pinchFrameCount = 0;
      state.releaseFrameCount++;

      console.log(
        `[PinchDetector] FRAME COUNT DEBUG - NOT_PINCHING after reset:`,
        {
          hand,
          frameCountAfter: state.pinchFrameCount,
          resetToZero: true,
        }
      );
    }

    console.log(`[PinchDetector] FRAME COUNT DEBUG - Exit:`, {
      hand,
      finalFrameCount: state.pinchFrameCount,
      finalState: state.pinchState,
      finalIsPinching: state.isPinching,
    });
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
    console.log(`[PinchDetector] Emitting event:`, {
      type,
      hand: event.hand,
      position: event.position,
      origPinch: event.origPinch,
      curPinch: event.curPinch,
      listenerCount: listeners.length,
      timestamp: Date.now(),
    });

    listeners.forEach((callback, index) => {
      console.log(
        `[PinchDetector] Calling listener ${index + 1}/${listeners.length} for ${type}`
      );
      try {
        callback(event);
        console.log(
          `[PinchDetector] Listener ${index + 1} completed successfully`
        );
      } catch (error) {
        console.error(`[PinchDetector] Listener ${index + 1} failed:`, error);
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
