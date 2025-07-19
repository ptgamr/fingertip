// State machine for managing gesture transitions and phases
import {
  GestureType,
  GesturePhase,
  GestureEvent,
  GestureHandState,
  GestureDetectionResult,
  StateTransition,
  GestureDetectorConfig,
  GESTURE_PRIORITY,
} from "./gesture-engine-types";
import { GestureEventBus } from "./gesture-event-bus";
import { HandType, Position } from "../finger-tracker-types";

export class GestureStateMachine {
  private eventBus: GestureEventBus;
  private handStates: Map<HandType, GestureHandState>;
  private config: GestureDetectorConfig;
  private debugEnabled: boolean = false;

  constructor(
    eventBus: GestureEventBus,
    config: GestureDetectorConfig,
    debugEnabled: boolean = false
  ) {
    this.eventBus = eventBus;
    this.config = config;
    this.debugEnabled = debugEnabled;
    this.handStates = new Map();

    // Initialize hand states
    this.initializeHandStates();
  }

  /**
   * Initialize hand states for both hands
   */
  private initializeHandStates(): void {
    const hands: HandType[] = ["left", "right"];
    hands.forEach((hand) => {
      this.handStates.set(hand, this.createInitialHandState());
    });
  }

  /**
   * Create initial hand state
   */
  private createInitialHandState(): GestureHandState {
    return {
      currentGesture: "none",
      currentPhase: "released",
      confidence: 0,
      startTime: 0,
      startPosition: { x: 0, y: 0 },
      lastPosition: { x: 0, y: 0 },
      frameCount: 0,
      stableFrameCount: 0,
      transitionFrameCount: 0,
      phaseData: {},
    };
  }

  /**
   * Process gesture detection results and manage state transitions
   */
  processGesture(
    hand: HandType,
    detectionResults: Map<GestureType, GestureDetectionResult>,
    currentPosition: Position
  ): void {
    const handState = this.handStates.get(hand)!;

    // Determine the dominant gesture from detection results
    const dominantGesture = this.selectDominantGesture(detectionResults);

    if (this.debugEnabled) {
      console.log(
        `[GestureStateMachine] ${hand} hand - Dominant gesture: ${dominantGesture.type} (confidence: ${dominantGesture.confidence.toFixed(2)})`
      );
    }

    // Process state transition
    const transition = this.processStateTransition(
      hand,
      dominantGesture,
      currentPosition,
      handState
    );

    // Emit event if there was a state change
    if (transition) {
      this.eventBus.emit(transition.event);

      if (this.debugEnabled) {
        console.log(`[GestureStateMachine] ${hand} hand transition:`, {
          from: `${transition.from.gesture}-${transition.from.phase}`,
          to: `${transition.to.gesture}-${transition.to.phase}`,
          confidence: transition.event.confidence,
        });
      }
    }

    // Update position tracking
    handState.lastPosition = currentPosition;
  }

  /**
   * Select the dominant gesture from detection results
   */
  private selectDominantGesture(
    detectionResults: Map<GestureType, GestureDetectionResult>
  ): GestureDetectionResult & { type: GestureType } {
    let bestGesture: (GestureDetectionResult & { type: GestureType }) | null =
      null;
    let bestScore = 0;

    // Check each detection result
    detectionResults.forEach((result, gestureType) => {
      if (
        result.isActive &&
        result.confidence >= this.config.confidenceThreshold
      ) {
        // Calculate score based on confidence and priority
        const priority = GESTURE_PRIORITY[gestureType] || 1;
        const score = result.confidence * priority;

        if (score > bestScore) {
          bestScore = score;
          bestGesture = { ...result, type: gestureType };
        }
      }
    });

    // Return best gesture or "none" if no gesture detected
    return (
      bestGesture || {
        type: "none",
        isActive: false,
        confidence: 0,
        referencePoint: { x: 0, y: 0 },
      }
    );
  }

  /**
   * Process state transition logic
   */
  private processStateTransition(
    hand: HandType,
    dominantGesture: GestureDetectionResult & { type: GestureType },
    currentPosition: Position,
    handState: GestureHandState
  ): StateTransition | null {
    const currentTime = Date.now();
    const gestureType = dominantGesture.type;
    const isGestureActive = dominantGesture.isActive;

    // Handle gesture change
    if (gestureType !== handState.currentGesture) {
      return this.handleGestureChange(
        hand,
        gestureType,
        dominantGesture,
        currentPosition,
        currentTime,
        handState
      );
    }

    // Handle phase transitions within the same gesture
    if (isGestureActive && gestureType !== "none") {
      return this.handlePhaseTransition(
        hand,
        dominantGesture,
        currentPosition,
        currentTime,
        handState
      );
    }

    // Handle gesture release
    if (!isGestureActive && handState.currentGesture !== "none") {
      return this.handleGestureRelease(
        hand,
        currentPosition,
        currentTime,
        handState
      );
    }

    // Update frame counts for stability tracking
    this.updateFrameCounts(handState, isGestureActive);

    return null;
  }

  /**
   * Handle gesture type change
   */
  private handleGestureChange(
    hand: HandType,
    newGestureType: GestureType,
    detectionResult: GestureDetectionResult,
    currentPosition: Position,
    currentTime: number,
    handState: GestureHandState
  ): StateTransition | null {
    // If switching to "none", handle as release
    if (newGestureType === "none") {
      return this.handleGestureRelease(
        hand,
        currentPosition,
        currentTime,
        handState
      );
    }

    // If switching from "none" to active gesture, start new gesture
    if (handState.currentGesture === "none") {
      return this.startNewGesture(
        hand,
        newGestureType,
        detectionResult,
        currentPosition,
        currentTime,
        handState
      );
    }

    // If switching between active gestures, release old and start new
    const releaseTransition = this.handleGestureRelease(
      hand,
      currentPosition,
      currentTime,
      handState
    );

    // Reset state for new gesture
    this.resetHandState(handState);

    // Start new gesture
    const startTransition = this.startNewGesture(
      hand,
      newGestureType,
      detectionResult,
      currentPosition,
      currentTime,
      handState
    );

    // Return the start transition (release will be handled in next frame)
    return startTransition;
  }

  /**
   * Start a new gesture
   */
  private startNewGesture(
    hand: HandType,
    gestureType: GestureType,
    detectionResult: GestureDetectionResult,
    currentPosition: Position,
    currentTime: number,
    handState: GestureHandState
  ): StateTransition | null {
    // Reset frame counts
    handState.frameCount = 1;
    handState.stableFrameCount = 1;
    handState.transitionFrameCount = 0;

    // Check if we have enough frames to confirm start
    if (handState.stableFrameCount >= this.config.framesToConfirmStart) {
      const fromState = {
        gesture: handState.currentGesture,
        phase: handState.currentPhase,
      };

      // Update hand state
      handState.currentGesture = gestureType;
      handState.currentPhase = "start";
      handState.confidence = detectionResult.confidence;
      handState.startTime = currentTime;
      handState.startPosition = currentPosition;

      const event = this.createGestureEvent(
        gestureType,
        "start",
        hand,
        currentPosition,
        handState,
        detectionResult
      );

      return {
        from: fromState,
        to: { gesture: gestureType, phase: "start" },
        event,
      };
    }

    return null;
  }

  /**
   * Handle phase transitions within the same gesture
   */
  private handlePhaseTransition(
    hand: HandType,
    detectionResult: GestureDetectionResult,
    currentPosition: Position,
    currentTime: number,
    handState: GestureHandState
  ): StateTransition | null {
    handState.frameCount++;
    handState.confidence = detectionResult.confidence;

    const currentPhase = handState.currentPhase;
    let newPhase: GesturePhase | null = null;

    // Determine phase transitions
    switch (currentPhase) {
      case "start":
        if (handState.frameCount > this.config.maxHeldFrames) {
          newPhase = "held";
        }
        break;

      case "held":
        // Check for movement to trigger move phase
        const movement = this.calculateMovement(
          handState.lastPosition,
          currentPosition
        );
        if (movement > this.config.movementThreshold) {
          newPhase = "move";
        }
        break;

      case "move":
        // Continue in move phase, emit move events
        const event = this.createGestureEvent(
          handState.currentGesture,
          "move",
          hand,
          currentPosition,
          handState,
          detectionResult
        );
        this.eventBus.emit(event);
        break;
    }

    // Handle phase transition
    if (newPhase && newPhase !== currentPhase) {
      const fromState = {
        gesture: handState.currentGesture,
        phase: currentPhase,
      };
      handState.currentPhase = newPhase;

      const event = this.createGestureEvent(
        handState.currentGesture,
        newPhase,
        hand,
        currentPosition,
        handState,
        detectionResult
      );

      return {
        from: fromState,
        to: { gesture: handState.currentGesture, phase: newPhase },
        event,
      };
    }

    return null;
  }

  /**
   * Handle gesture release
   */
  private handleGestureRelease(
    hand: HandType,
    currentPosition: Position,
    currentTime: number,
    handState: GestureHandState
  ): StateTransition | null {
    if (handState.currentGesture === "none") {
      return null;
    }

    handState.transitionFrameCount++;

    // Check if we have enough frames to confirm release
    if (handState.transitionFrameCount >= this.config.framesToConfirmRelease) {
      const fromState = {
        gesture: handState.currentGesture,
        phase: handState.currentPhase,
      };

      const event = this.createGestureEvent(
        handState.currentGesture,
        "released",
        hand,
        currentPosition,
        handState
      );

      // Reset hand state
      this.resetHandState(handState);

      return {
        from: fromState,
        to: { gesture: "none", phase: "released" },
        event,
      };
    }

    return null;
  }

  /**
   * Update frame counts for stability tracking
   */
  private updateFrameCounts(
    handState: GestureHandState,
    isGestureActive: boolean
  ): void {
    if (isGestureActive) {
      handState.stableFrameCount++;
      handState.transitionFrameCount = 0;
    } else {
      handState.transitionFrameCount++;
      if (handState.transitionFrameCount > this.config.errorToleranceFrames) {
        handState.stableFrameCount = 0;
      }
    }
  }

  /**
   * Calculate movement between two positions
   */
  private calculateMovement(from: Position, to: Position): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Create a gesture event
   */
  private createGestureEvent(
    gestureType: GestureType,
    phase: GesturePhase,
    hand: HandType,
    currentPosition: Position,
    handState: GestureHandState,
    detectionResult?: GestureDetectionResult
  ): GestureEvent {
    const currentTime = Date.now();

    return {
      type: gestureType,
      phase,
      hand,
      position: currentPosition,
      confidence: handState.confidence,
      startPosition: handState.startPosition,
      currentPosition,
      timestamp: currentTime,
      duration: currentTime - handState.startTime,
      metadata: detectionResult?.metadata,
    };
  }

  /**
   * Reset hand state to initial values
   */
  private resetHandState(handState: GestureHandState): void {
    handState.currentGesture = "none";
    handState.currentPhase = "released";
    handState.confidence = 0;
    handState.startTime = 0;
    handState.startPosition = { x: 0, y: 0 };
    handState.frameCount = 0;
    handState.stableFrameCount = 0;
    handState.transitionFrameCount = 0;
    handState.phaseData = {};
  }

  /**
   * Reset hand state when hand is no longer detected
   */
  resetHand(hand: HandType): void {
    const handState = this.handStates.get(hand);
    if (handState) {
      // Emit release event if gesture was active
      if (handState.currentGesture !== "none") {
        const event = this.createGestureEvent(
          handState.currentGesture,
          "released",
          hand,
          handState.lastPosition,
          handState
        );
        this.eventBus.emit(event);
      }

      this.resetHandState(handState);
    }
  }

  /**
   * Get current hand state for debugging
   */
  getHandState(hand: HandType): GestureHandState | undefined {
    return this.handStates.get(hand);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GestureDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }
}
