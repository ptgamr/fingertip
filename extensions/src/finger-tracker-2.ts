import { gsap } from "gsap";

// Interfaces
interface Position {
  x: number;
  y: number;
  timestamp: number;
}

interface PinchData {
  x: number;
  y: number;
  timestamp: number;
  isPinching: boolean;
}

interface TweenPoint {
  x: number;
  y: number;
}

// Pinch state types
type PinchState = "" | "start" | "held" | "released";

// Event types
type PinchEventType =
  | "pinch-start"
  | "pinch-held"
  | "pinch-released"
  | "pinch-move";

// Event interface
interface PinchEvent {
  type: PinchEventType;
  x: number;
  y: number;
  origPinch: { x: number; y: number };
  curPinch: { x: number; y: number };
}

export class FingerTracker2 {
  // Visual elements
  private dot: HTMLElement;
  private isVisible: boolean = false;

  // Position tracking
  private positionHistory: Position[] = [];
  private pinchHistory: PinchData[] = [];
  private readonly HISTORY_LIMIT = 10;

  // Tweened position for smooth movement
  private tweenedPosition: TweenPoint = { x: 0, y: 0 };

  // Pinch detection
  private isPinching: boolean = false;
  private pinchState: PinchState = "";
  private pinchFrameCount: number = 0;
  private releaseFrameCount: number = 0;
  private framesSinceLastPinch: number = 0;
  private smoothedPinchDistance: number | null = null;

  // Original pinch position for relative movement
  private origPinch: { x: number; y: number } = { x: 0, y: 0 };
  private curPinch: { x: number; y: number } = { x: 0, y: 0 };

  // Scroll tweening
  private tweenScroll: TweenPoint = { x: 0, y: 0 };
  private currentScrollTarget: Element | Window | null = null;
  private origScrollLeft: number = 0;
  private origScrollTop: number = 0;

  // Event listeners
  private eventListeners: Map<PinchEventType, ((event: PinchEvent) => void)[]> =
    new Map();

  // Configuration constants
  private readonly PINCH_ENTER_THRESHOLD = 0.04;
  private readonly PINCH_EXIT_THRESHOLD = 0.06;
  private readonly PINCH_MOVEMENT_THRESHOLD = 15;
  private readonly PINCH_EMA_ALPHA = 0.6;
  private readonly FRAMES_TO_CONFIRM_PINCH = 3;
  private readonly FRAMES_TO_RELEASE_PINCH = 5;
  private readonly MAX_PINCH_HELD_FRAMES = 1;
  private readonly SCROLL_SPEED = 1; // Match reference implementation's default speed
  private readonly ERROR_TOLERANCE_FRAMES = 5;

  // Debug element for tweening visualization
  private debugElement: HTMLElement | null = null;
  private showDebug: boolean = true; // Set to false to disable debug visualization

  constructor() {
    this.dot = this.createDot();
    document.body.appendChild(this.dot);

    // Create debug element if debug is enabled
    if (this.showDebug) {
      this.debugElement = this.createDebugElement();
      if (this.debugElement) {
        document.body.appendChild(this.debugElement);
      }
    }

    // Initialize event listeners map
    this.eventListeners.set("pinch-start", []);
    this.eventListeners.set("pinch-held", []);
    this.eventListeners.set("pinch-released", []);
    this.eventListeners.set("pinch-move", []);
  }

  private createDot(): HTMLElement {
    const dot = document.createElement("div");
    dot.id = "fingertip-tracker-dot";
    dot.style.position = "fixed";
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.backgroundColor = "#ff0000";
    dot.style.borderRadius = "50%";
    dot.style.pointerEvents = "none";
    dot.style.zIndex = "99999";
    dot.style.display = "none";
    dot.style.boxShadow = "0 0 15px rgba(255, 0, 0, 0.9)";
    dot.style.transform = "translate(-50%, -50%)";

    return dot;
  }

  /**
   * Create debug visualization element
   */
  private createDebugElement(): HTMLElement {
    const debugElement = document.createElement("div");
    debugElement.id = "fingertip-tracker-debug";
    debugElement.style.position = "fixed";
    debugElement.style.bottom = "10px";
    debugElement.style.right = "10px";
    debugElement.style.padding = "5px 10px";
    debugElement.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    debugElement.style.color = "white";
    debugElement.style.fontFamily = "monospace";
    debugElement.style.fontSize = "12px";
    debugElement.style.borderRadius = "4px";
    debugElement.style.zIndex = "99999";
    debugElement.style.pointerEvents = "none";
    debugElement.textContent = "Tweening: inactive";

    return debugElement;
  }

  /**
   * Update the tracker position with raw coordinates
   */
  updatePosition(x: number, y: number): void {
    const currentTime = Date.now();

    // Add current position to history
    this.positionHistory.push({
      x,
      y,
      timestamp: currentTime,
    });

    // Limit history size
    if (this.positionHistory.length > this.HISTORY_LIMIT) {
      this.positionHistory.shift();
    }

    // Tween to the new position for smooth movement
    gsap.to(this.tweenedPosition, {
      x,
      y,
      duration: 0.2,
      ease: "power2.out",
      onUpdate: () => {
        // Update visual position
        this.dot.style.left = `${this.tweenedPosition.x}px`;
        this.dot.style.top = `${this.tweenedPosition.y}px`;
      },
    });

    if (!this.isVisible) {
      this.dot.style.display = "block";
      this.isVisible = true;
    }
  }

  /**
   * Update the tracker with hand landmarks data
   */
  updateWithLandmarks(
    landmarks: Array<{ x: number; y: number; z?: number }>,
    videoWidth: number,
    videoHeight: number,
    isMirrored: boolean = false
  ): void {
    if (landmarks.length < 21) {
      // Not enough landmarks for hand detection
      this.hide();
      return;
    }

    const currentTime = Date.now();

    // Get index finger tip (landmark 8) and thumb tip (landmark 4)
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Calculate pinch distance in video coordinate space (normalized)
    const pinchDistance =
      Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) +
          Math.pow(indexTip.y - thumbTip.y, 2)
      ) / Math.max(videoWidth, videoHeight);

    // Update exponential moving average for pinch-distance smoothing
    if (this.smoothedPinchDistance === null) {
      this.smoothedPinchDistance = pinchDistance;
    } else {
      this.smoothedPinchDistance =
        this.PINCH_EMA_ALPHA * pinchDistance +
        (1 - this.PINCH_EMA_ALPHA) * this.smoothedPinchDistance;
    }

    const smoothedPinchDistance = this.smoothedPinchDistance;

    // Use hysteresis for stable pinch detection
    let isCurrentlyPinching = this.isPinching;
    if (!this.isPinching) {
      // Not currently pinching - use lower threshold to enter pinch mode
      isCurrentlyPinching = smoothedPinchDistance < this.PINCH_ENTER_THRESHOLD;
    } else {
      // Currently pinching - use higher threshold to exit pinch mode (prevents flickering)
      isCurrentlyPinching = smoothedPinchDistance < this.PINCH_EXIT_THRESHOLD;
    }

    // Frame counting for stable pinch detection
    if (isCurrentlyPinching && !this.isPinching) {
      this.pinchFrameCount++;
      this.releaseFrameCount = 0;

      // Require multiple consecutive frames to confirm pinch
      if (this.pinchFrameCount < this.FRAMES_TO_CONFIRM_PINCH) {
        isCurrentlyPinching = false;
      } else {
        // Just started pinching - store original pinch position
        this.origPinch = { x: indexTip.x, y: indexTip.y };
        this.pinchState = "start";

        // Kill any active tweens to prevent conflicts
        gsap.killTweensOf(this.tweenScroll);
      }
    } else if (!isCurrentlyPinching && this.isPinching) {
      this.releaseFrameCount++;

      // Require multiple consecutive frames to confirm release
      if (this.releaseFrameCount < this.FRAMES_TO_RELEASE_PINCH) {
        isCurrentlyPinching = true;
      } else {
        this.pinchState = "released";
      }
    } else {
      // Update state when pinching continues
      if (isCurrentlyPinching) {
        this.framesSinceLastPinch = 0;

        if (
          this.pinchState === "start" &&
          this.pinchFrameCount > this.MAX_PINCH_HELD_FRAMES
        ) {
          this.pinchState = "held";
        }
      } else {
        this.framesSinceLastPinch++;

        // Reset state after enough frames without pinching
        if (this.framesSinceLastPinch > this.ERROR_TOLERANCE_FRAMES) {
          this.pinchState = "";
        }
      }

      // Reset counters when state is stable
      if (isCurrentlyPinching) {
        this.pinchFrameCount++;
        this.releaseFrameCount = 0;
      } else {
        this.pinchFrameCount = 0;
        this.releaseFrameCount++;
      }
    }

    // Convert index finger position to screen coordinates
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Convert video coordinates to normalized coordinates (0 to 1)
    let normalizedX = indexTip.x / videoWidth;
    let normalizedY = indexTip.y / videoHeight;

    // Handle mirroring - if video is mirrored, flip the X coordinate
    if (isMirrored) {
      normalizedX = 1 - normalizedX;
    }

    // Map normalized coordinates to full viewport
    const indexScreenX = normalizedX * viewportWidth;
    const indexScreenY = normalizedY * viewportHeight;

    // Update current pinch position for continuous tracking during pinch-and-drag
    this.curPinch = { x: indexTip.x, y: indexTip.y };

    // Add to pinch history
    this.pinchHistory.push({
      x: indexScreenX,
      y: indexScreenY,
      timestamp: currentTime,
      isPinching: isCurrentlyPinching,
    });

    // Limit history size
    if (this.pinchHistory.length > this.HISTORY_LIMIT) {
      this.pinchHistory.shift();
    }

    // Handle pinch events
    if (this.pinchState === "start") {
      // Find scrollable target element
      const elementAtPoint = document.elementFromPoint(
        indexScreenX,
        indexScreenY
      );
      this.currentScrollTarget = this.findScrollableParent(elementAtPoint);

      // Store original scroll position
      this.origScrollLeft = this.getTargetScrollLeft(this.currentScrollTarget);
      this.origScrollTop = this.getTargetScrollTop(this.currentScrollTarget);

      // Initialize tween scroll position
      this.tweenScroll.x = this.origScrollLeft;
      this.tweenScroll.y = this.origScrollTop;

      // Emit pinch start event
      this.emitEvent("pinch-start", {
        type: "pinch-start",
        x: indexScreenX,
        y: indexScreenY,
        origPinch: this.origPinch,
        curPinch: this.curPinch,
      });

      // Visual feedback - change dot color
      this.dot.style.backgroundColor = "#00ff00"; // Green when pinching
      this.dot.style.boxShadow = "0 0 20px rgba(0, 255, 0, 0.9)";
    } else if (this.pinchState === "held") {
      // Handle pinch scrolling
      if (this.currentScrollTarget) {
        // Don't update origPinch periodically - let the continuous difference drive the scrolling
        // This matches the reference implementation's approach
        this.handlePinchScroll(videoWidth, videoHeight);
      }

      // Emit pinch held event
      this.emitEvent("pinch-held", {
        type: "pinch-held",
        x: indexScreenX,
        y: indexScreenY,
        origPinch: this.origPinch,
        curPinch: this.curPinch,
      });

      // Emit move event
      this.emitEvent("pinch-move", {
        type: "pinch-move",
        x: indexScreenX,
        y: indexScreenY,
        origPinch: this.origPinch,
        curPinch: this.curPinch,
      });
    } else if (this.pinchState === "released") {
      // Emit pinch released event
      this.emitEvent("pinch-released", {
        type: "pinch-released",
        x: indexScreenX,
        y: indexScreenY,
        origPinch: this.origPinch,
        curPinch: this.curPinch,
      });

      // Reset pinch state
      this.pinchState = "";
      this.currentScrollTarget = null;

      // Visual feedback - change dot color back
      this.dot.style.backgroundColor = "#ff0000"; // Red when not pinching
      this.dot.style.boxShadow = "0 0 15px rgba(255, 0, 0, 0.9)";

      // Clear histories when pinch ends to prevent stale data
      this.pinchHistory = [];
      this.smoothedPinchDistance = null;
    }

    // Update pinching state
    this.isPinching = isCurrentlyPinching;

    // Tween to the new position for smooth movement
    gsap.to(this.tweenedPosition, {
      x: indexScreenX,
      y: indexScreenY,
      duration: 0.15,
      ease: "power2.out",
      onUpdate: () => {
        // Update visual position
        this.dot.style.left = `${this.tweenedPosition.x}px`;
        this.dot.style.top = `${this.tweenedPosition.y}px`;
      },
    });

    if (!this.isVisible) {
      this.dot.style.display = "block";
      this.isVisible = true;
    }
  }

  /**
   * Handle pinch scrolling with tweening
   */
  private handlePinchScroll(videoWidth: number, videoHeight: number): void {
    if (!this.currentScrollTarget) return;

    // Calculate movement based on pinch position difference
    // Note: x direction is negated, y direction is positive (matching reference implementation)
    const xDiff = -(this.origPinch.x - this.curPinch.x) * videoWidth;
    const yDiff = (this.origPinch.y - this.curPinch.y) * videoHeight;

    // Debug visualization for tweening (changes dot color during active tweening)
    this.dot.style.backgroundColor = "#ffff00"; // Yellow during active tweening

    // Update debug element if it exists
    if (this.debugElement) {
      this.debugElement.textContent = `Tweening: active | Speed: ${this.SCROLL_SPEED} | Diff: ${xDiff.toFixed(2)},${yDiff.toFixed(2)}`;
      this.debugElement.style.backgroundColor = "rgba(255, 255, 0, 0.7)";
    }

    // Apply continuous movement calculation - exactly matching reference implementation
    gsap.to(this.tweenScroll, {
      x: this.tweenScroll.x + xDiff * this.SCROLL_SPEED,
      y: this.tweenScroll.y + yDiff * this.SCROLL_SPEED,
      duration: 1, // Match reference implementation duration
      ease: "linear.easeNone", // Linear easing for consistent scrolling (matching reference)
      overwrite: true,
      immediateRender: true, // Immediate rendering for responsive scrolling (matching reference)
      onUpdate: () => {
        // No onUpdate callback - we'll apply the scroll outside the tween
      },
      onComplete: () => {
        // Reset dot color when tweening completes
        if (this.isPinching) {
          this.dot.style.backgroundColor = "#00ff00"; // Green when pinching

          // Update debug element
          if (this.debugElement) {
            this.debugElement.textContent = "Tweening: complete";
            this.debugElement.style.backgroundColor = "rgba(0, 255, 0, 0.7)";
          }
        }
      },
    });

    // Apply scroll directly, outside the tween's onUpdate callback
    // This exactly matches the reference implementation's approach
    if (this.currentScrollTarget) {
      this.currentScrollTarget.scrollTo(this.tweenScroll.x, this.tweenScroll.y);
    }
  }

  /**
   * Find the closest scrollable parent element
   */
  private findScrollableParent(element: Element | null): Element | Window {
    if (!element) return window;

    // Check if element is scrollable
    if (element.scrollHeight > element.clientHeight) {
      const styles = getComputedStyle(element);

      if (
        styles.overflow === "auto" ||
        styles.overflow === "scroll" ||
        styles.overflowY === "auto" ||
        styles.overflowY === "scroll"
      ) {
        return element;
      }
    }

    // Check parent element
    if (element.parentElement) {
      return this.findScrollableParent(element.parentElement);
    } else {
      // Default to window if no scrollable parent found
      return window;
    }
  }

  /**
   * Get scroll left position, handling window object
   */
  private getTargetScrollLeft(target: Element | Window | null): number {
    if (!target) return 0;

    if (target === window) {
      return window.scrollX;
    } else {
      return (target as Element).scrollLeft;
    }
  }

  /**
   * Get scroll top position, handling window object
   */
  private getTargetScrollTop(target: Element | Window | null): number {
    if (!target) return 0;

    if (target === window) {
      return window.scrollY;
    } else {
      return (target as Element).scrollTop;
    }
  }

  /**
   * Add event listener
   */
  addEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
    const listeners = this.eventListeners.get(type) || [];
    listeners.push(callback);
    this.eventListeners.set(type, listeners);
  }

  /**
   * Remove event listener
   */
  removeEventListener(
    type: PinchEventType,
    callback: (event: PinchEvent) => void
  ): void {
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

    // Map pinch events to standard DOM events for web interaction
    this.mapToDOMEvents(type, event);
  }

  /**
   * Map pinch events to standard DOM events
   */
  private mapToDOMEvents(type: PinchEventType, event: PinchEvent): void {
    // Find element at current position
    const element = document.elementFromPoint(event.x, event.y);
    if (!element) return;

    let domEvent: Event;

    switch (type) {
      case "pinch-start":
        // Map to mousedown
        domEvent = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: event.x,
          clientY: event.y,
        });
        element.dispatchEvent(domEvent);
        break;

      case "pinch-held":
        // Map to mousemove
        domEvent = new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          clientX: event.x,
          clientY: event.y,
        });
        element.dispatchEvent(domEvent);
        break;

      case "pinch-released":
        // Map to mouseup and click
        domEvent = new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          clientX: event.x,
          clientY: event.y,
        });
        element.dispatchEvent(domEvent);

        // Only trigger click if the movement was minimal
        const movement = Math.sqrt(
          Math.pow(event.origPinch.x - event.curPinch.x, 2) +
            Math.pow(event.origPinch.y - event.curPinch.y, 2)
        );

        if (movement < this.PINCH_MOVEMENT_THRESHOLD) {
          domEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: event.x,
            clientY: event.y,
          });
          element.dispatchEvent(domEvent);
        }
        break;
    }
  }

  /**
   * Hide the tracker
   */
  hide(): void {
    this.dot.style.display = "none";
    this.isVisible = false;

    // Hide debug element if it exists
    if (this.debugElement) {
      this.debugElement.textContent = "Tweening: inactive";
      this.debugElement.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    }

    // Clear all state when hiding
    this.positionHistory = [];
    this.pinchHistory = [];
    this.isPinching = false;
    this.pinchState = "";
    this.pinchFrameCount = 0;
    this.releaseFrameCount = 0;
    this.framesSinceLastPinch = 0;
    this.smoothedPinchDistance = null;
    this.currentScrollTarget = null;

    // Kill any active tweens
    gsap.killTweensOf(this.tweenedPosition);
    gsap.killTweensOf(this.tweenScroll);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove DOM elements
    if (this.dot.parentElement) {
      this.dot.parentElement.removeChild(this.dot);
    }

    // Remove debug element if it exists
    if (this.debugElement && this.debugElement.parentElement) {
      this.debugElement.parentElement.removeChild(this.debugElement);
    }

    // Kill all tweens
    gsap.killTweensOf(this.tweenedPosition);
    gsap.killTweensOf(this.tweenScroll);

    // Clear event listeners
    this.eventListeners.clear();
  }
}
