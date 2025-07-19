import {
  HandType,
  HandLandmarks,
  Handedness,
  Position,
  FingerTrackerConfig,
  PinchEvent,
  PinchEventType,
} from "./finger-tracker-types";
import {
  GestureEngine,
  GestureEvent,
  GestureEventListener,
} from "./gesture-engine";
import { ScrollController } from "./scroll-controller";
import { VisualFeedback } from "./visual-feedback";
import { DomainGestureHandler } from "./domain-gesture-handler";

export class FingerTracker3 {
  private gestureEngine: GestureEngine;
  private scrollController: ScrollController;
  private visualFeedback: VisualFeedback;
  private domainGestureHandler: DomainGestureHandler;
  private isInitialized: boolean = false;

  constructor(config?: FingerTrackerConfig) {
    // Initialize components
    this.gestureEngine = new GestureEngine();
    this.scrollController = new ScrollController(
      this.gestureEngine,
      config?.scroll
    );
    this.visualFeedback = new VisualFeedback(config?.visual);
    this.domainGestureHandler = new DomainGestureHandler(this.gestureEngine);

    // Setup internal event handling
    this.setupInternalEventHandlers();

    this.isInitialized = true;
  }

  /**
   * Setup internal event handlers between components
   */
  private setupInternalEventHandlers(): void {
    // Update visual feedback based on pinch events
    this.gestureEngine.on("pinch-start", (event) => {
      this.visualFeedback.showPinch(event.hand);
    });

    this.gestureEngine.on("pinch-released", (event) => {
      this.visualFeedback.hidePinch(event.hand);
    });

    // Show scrolling state
    this.scrollController.onScrollingStateChange((hand, isScrolling) => {
      if (isScrolling) {
        this.visualFeedback.showScrolling(hand);
      }
    });
  }

  /**
   * Update with multi-hand landmarks from MediaPipe
   */
  updateWithMultiHandLandmarks(
    multiHandLandmarks: HandLandmarks[],
    multiHandedness: Handedness[],
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean = false
  ): void {
    if (!this.isInitialized) {
      console.warn("[FingerTracker3] Not initialized, skipping update");
      return;
    }

    // Track which hands are detected
    const detectedHands = new Set<HandType>();

    // Process each detected hand
    multiHandedness.forEach((handedness, index) => {
      if (index >= multiHandLandmarks.length) return;

      const landmarks = multiHandLandmarks[index];
      const hand: HandType = handedness.label === "Left" ? "left" : "right";
      detectedHands.add(hand);

      // Update visual position
      const indexTip = landmarks[8];

      const screenPos = this.landmarkToScreen(
        indexTip,
        videoWidth,
        videoHeight,
        isMirrored,
        hand
      );

      // Process hand for gesture detection
      this.gestureEngine.processHand(
        hand,
        landmarks,
        videoWidth,
        videoHeight,
        isMirrored
      );

      this.visualFeedback.updatePosition(hand, screenPos);
    });

    // Hide dots for hands that are no longer detected
    const allHands: HandType[] = ["left", "right"];
    allHands.forEach((hand) => {
      if (!detectedHands.has(hand)) {
        this.visualFeedback.hideDot(hand);
        this.gestureEngine.resetHand(hand);
      }
    });

    // Update debug info
    this.updateDebugInfo();
  }

  /**
   * Update with single hand landmarks (backward compatibility)
   */
  updateWithLandmarks(
    landmarks: Array<{ x: number; y: number; z?: number }>,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean = false
  ): void {
    // Convert to multi-hand format and assume right hand
    const multiHandLandmarks: HandLandmarks[] = [landmarks as HandLandmarks];
    const multiHandedness: Handedness[] = [
      {
        index: 0,
        score: 1.0,
        label: "Right",
      },
    ];

    this.updateWithMultiHandLandmarks(
      multiHandLandmarks,
      multiHandedness,
      videoWidth,
      videoHeight,
      isMirrored
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
   * Update debug information
   */
  private updateDebugInfo(): void {
    const leftState = this.gestureEngine.getHandState("left");
    const rightState = this.gestureEngine.getHandState("right");

    // Use current gesture positions, fallback to default if state doesn't exist
    const leftScreenPos = leftState?.lastPosition || { x: 0, y: 0 };
    const rightScreenPos = rightState?.lastPosition || { x: 0, y: 0 };

    this.visualFeedback.updateDebugInfo({
      left: {
        visible:
          leftState !== undefined &&
          (leftState.lastPosition.x !== 0 || leftState.lastPosition.y !== 0),
        pinching: leftState?.currentGesture === "pinch",
        position: leftScreenPos,
      },
      right: {
        visible:
          rightState !== undefined &&
          (rightState.lastPosition.x !== 0 || rightState.lastPosition.y !== 0),
        pinching: rightState?.currentGesture === "pinch",
        position: rightScreenPos,
      },
    });
  }

  /**
   * Hide all visual elements
   */
  hide(): void {
    this.visualFeedback.hideDot("left");
    this.visualFeedback.hideDot("right");
    this.gestureEngine.resetHand("left");
    this.gestureEngine.resetHand("right");
    this.domainGestureHandler.resetHand("left");
    this.domainGestureHandler.resetHand("right");
  }

  /**
   * Add event listener for pinch events (legacy compatibility)
   */
  addEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
    // Create adapter to convert GestureEvent to PinchEvent
    const adapter = (gestureEvent: GestureEvent) => {
      if (gestureEvent.type === "pinch") {
        const pinchEvent: PinchEvent = {
          type,
          hand: gestureEvent.hand,
          position: gestureEvent.position,
          origPinch: gestureEvent.startPosition || gestureEvent.position,
          curPinch: gestureEvent.position,
        };
        callback(pinchEvent);
      }
    };

    this.gestureEngine.on(type, adapter);
  }

  /**
   * Remove event listener (legacy compatibility)
   */
  removeEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
    // Note: This is a simplified implementation
    // In a full implementation, we'd need to track adapters to remove them properly
    console.warn(
      "[FingerTracker3] removeEventListener not fully implemented for new gesture system"
    );
  }

  /**
   * Get gesture engine instance (for advanced usage)
   */
  getGestureEngine(): GestureEngine {
    return this.gestureEngine;
  }

  /**
   * Get scroll controller instance (for advanced usage)
   */
  getScrollController(): ScrollController {
    return this.scrollController;
  }

  /**
   * Get visual feedback instance (for advanced usage)
   */
  getVisualFeedback(): VisualFeedback {
    return this.visualFeedback;
  }

  /**
   * Get domain gesture handler instance (for advanced usage)
   */
  getDomainGestureHandler(): DomainGestureHandler {
    return this.domainGestureHandler;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.isInitialized = false;
    this.visualFeedback.destroy();
    this.scrollController.destroy();
    this.gestureEngine.destroy();
    this.domainGestureHandler.destroy();
  }
}
