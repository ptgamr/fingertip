import {
  HandType,
  HandLandmarks,
  Handedness,
  Position,
  FingerTrackerConfig,
  PinchEvent,
  PinchEventType,
} from "./finger-tracker-types";
import { PinchDetector } from "./pinch-detector";
import { ScrollController } from "./scroll-controller";
import { VisualFeedback } from "./visual-feedback";

export class FingerTracker3 {
  private pinchDetector: PinchDetector;
  private scrollController: ScrollController;
  private visualFeedback: VisualFeedback;
  private isInitialized: boolean = false;

  constructor(config?: FingerTrackerConfig) {
    // Initialize components
    this.pinchDetector = new PinchDetector(config?.pinch);
    this.scrollController = new ScrollController(
      this.pinchDetector,
      config?.scroll
    );
    this.visualFeedback = new VisualFeedback(config?.visual);

    // Setup internal event handling
    this.setupInternalEventHandlers();

    this.isInitialized = true;
  }

  /**
   * Setup internal event handlers between components
   */
  private setupInternalEventHandlers(): void {
    // Update visual feedback based on pinch events
    this.pinchDetector.on("pinch-start", (event) => {
      this.visualFeedback.showPinch(event.hand);
    });

    this.pinchDetector.on("pinch-released", (event) => {
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

    console.log(
      `[FingerTracker3] Processing ${multiHandLandmarks.length} hands`
    );

    // Track which hands are detected
    const detectedHands = new Set<HandType>();

    // Process each detected hand
    multiHandedness.forEach((handedness, index) => {
      if (index >= multiHandLandmarks.length) return;

      const landmarks = multiHandLandmarks[index];
      const hand: HandType = handedness.label === "Left" ? "left" : "right";
      detectedHands.add(hand);

      console.log(
        `[FingerTracker3] Processing ${hand} hand (${handedness.label})`
      );

      // Update visual position
      const indexTip = landmarks[8];
      console.log(`[FingerTracker3] ${hand} index tip landmark:`, indexTip);

      const screenPos = this.landmarkToScreen(
        indexTip,
        videoWidth,
        videoHeight,
        isMirrored,
        hand
      );

      console.log(`[FingerTracker3] ${hand} screen position:`, screenPos);

      // Process hand for pinch detection with screen position
      this.pinchDetector.processHand(
        hand,
        landmarks,
        videoWidth,
        videoHeight,
        screenPos
      );

      this.visualFeedback.updatePosition(hand, screenPos);
    });

    // Hide dots for hands that are no longer detected
    const allHands: HandType[] = ["left", "right"];
    allHands.forEach((hand) => {
      if (!detectedHands.has(hand)) {
        this.visualFeedback.hideDot(hand);
        this.pinchDetector.resetHand(hand);
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
    console.log(`[FingerTracker3] landmarkToScreen input:`, {
      landmark,
      videoWidth,
      videoHeight,
      isMirrored,
      hand,
      windowSize: { width: window.innerWidth, height: window.innerHeight },
    });

    // Normalize coordinates (MediaPipe provides 0-1 normalized coords)
    let normalizedX = landmark.x;
    let normalizedY = landmark.y;

    // Handle mirroring
    if (isMirrored) {
      normalizedX = 1 - normalizedX;
      console.log(
        `[FingerTracker3] Applied mirroring: ${landmark.x} -> ${normalizedX}`
      );
    }

    // Convert to screen coordinates
    const screenX = normalizedX * window.innerWidth;
    const screenY = normalizedY * window.innerHeight;

    console.log(`[FingerTracker3] landmarkToScreen transformation:`, {
      input: { x: landmark.x, y: landmark.y },
      normalized: { x: normalizedX, y: normalizedY },
      screen: { x: screenX, y: screenY },
      windowSize: { width: window.innerWidth, height: window.innerHeight },
    });

    return { x: screenX, y: screenY };
  }

  /**
   * Update debug information
   */
  private updateDebugInfo(): void {
    const leftState = this.pinchDetector.getHandState("left");
    const rightState = this.pinchDetector.getHandState("right");

    // Use current pinch positions directly since they're already in normalized coordinates
    // and convert them to screen coordinates properly
    const leftScreenPos = {
      x: leftState.curPinch.x * window.innerWidth,
      y: leftState.curPinch.y * window.innerHeight,
    };

    const rightScreenPos = {
      x: rightState.curPinch.x * window.innerWidth,
      y: rightState.curPinch.y * window.innerHeight,
    };

    this.visualFeedback.updateDebugInfo({
      left: {
        visible: leftState.positionHistory.length > 0,
        pinching: leftState.isPinching,
        position: leftScreenPos,
      },
      right: {
        visible: rightState.positionHistory.length > 0,
        pinching: rightState.isPinching,
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
    this.pinchDetector.resetHand("left");
    this.pinchDetector.resetHand("right");
  }

  /**
   * Add event listener for pinch events
   */
  addEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
    this.pinchDetector.on(type, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
    this.pinchDetector.off(type, callback);
  }

  /**
   * Get pinch detector instance (for advanced usage)
   */
  getPinchDetector(): PinchDetector {
    return this.pinchDetector;
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
   * Clean up all resources
   */
  destroy(): void {
    this.isInitialized = false;
    this.visualFeedback.destroy();
    this.scrollController.destroy();
    this.pinchDetector.destroy();
  }
}
