import { gsap } from "gsap";
import {
  HandType,
  Position,
  ScrollConfig,
  PinchEvent,
  defaultScrollConfig,
} from "./finger-tracker-types";
import { PinchDetector } from "./pinch-detector";

interface ScrollState {
  target: Element | Window | null;
  origScrollPos: Position;
  tweenScroll: Position;
  isScrolling: boolean;
}

enum LogLevel {
  ERROR = 0,
  INFO = 1,
  DEBUG = 2,
}

export class ScrollController {
  private config: ScrollConfig;
  private pinchDetector: PinchDetector;
  private scrollStates: Map<HandType, ScrollState>;
  private onScrollingCallback?: (hand: HandType, isScrolling: boolean) => void;
  private logLevel: LogLevel = LogLevel.INFO; // Default to INFO level
  private updateCounter: number = 0; // Counter for onUpdate logging

  constructor(
    pinchDetector: PinchDetector,
    config?: Partial<ScrollConfig>,
    logLevel: "error" | "info" | "debug" = "info"
  ) {
    this.config = { ...defaultScrollConfig, ...config };
    this.pinchDetector = pinchDetector;
    this.scrollStates = new Map();
    this.setLogLevel(logLevel);

    // Initialize scroll states for both hands
    this.scrollStates.set("left", this.createInitialScrollState());
    this.scrollStates.set("right", this.createInitialScrollState());

    // Setup event listeners
    this.setupEventListeners();
  }

  private createInitialScrollState(): ScrollState {
    return {
      target: null,
      origScrollPos: { x: 0, y: 0 },
      tweenScroll: { x: 0, y: 0 },
      isScrolling: false,
    };
  }

  /**
   * Helper methods for controlled logging
   */
  private logError(message: string, data?: any): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(`[ScrollController] ${message}`, data);
    }
  }

  private logInfo(message: string, data?: any): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(`[ScrollController] INFO ${message}`, data);
    }
  }

  private logDebug(message: string, data?: any): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(`[ScrollController] DEBUG ${message}`, data);
    }
  }

  /**
   * Set logging level
   */
  setLogLevel(level: "error" | "info" | "debug"): void {
    switch (level) {
      case "error":
        this.logLevel = LogLevel.ERROR;
        break;
      case "info":
        this.logLevel = LogLevel.INFO;
        break;
      case "debug":
        this.logLevel = LogLevel.DEBUG;
        break;
    }
    this.logInfo(`Log level set to: ${level}`);
  }

  /**
   * Get current logging level
   */
  getLogLevel(): "error" | "info" | "debug" {
    switch (this.logLevel) {
      case LogLevel.ERROR:
        return "error";
      case LogLevel.INFO:
        return "info";
      case LogLevel.DEBUG:
        return "debug";
      default:
        return "info";
    }
  }

  /**
   * Setup event listeners for pinch events
   */
  private setupEventListeners(): void {
    this.pinchDetector.on("pinch-start", this.handlePinchStart.bind(this));
    this.pinchDetector.on("pinch-held", this.handlePinchHeld.bind(this));
    this.pinchDetector.on(
      "pinch-released",
      this.handlePinchReleased.bind(this)
    );
  }

  /**
   * Handle pinch start event
   */
  private handlePinchStart(event: PinchEvent): void {
    this.logInfo(`Pinch start event received for ${event.hand} hand`);

    const state = this.scrollStates.get(event.hand)!;
    const handState = this.pinchDetector.getHandState(event.hand);

    // Event position is already in screen coordinates from FingerTracker3
    const screenPos = event.position;

    // Find scrollable target at position
    const element = document.elementFromPoint(screenPos.x, screenPos.y);
    this.logDebug(`Element at point:`, {
      screenPos,
      element: element?.tagName,
      elementClass: element?.className,
      elementId: element?.id,
    });

    state.target = this.findScrollableParent(element);
    this.logInfo(
      `Found scroll target: ${
        state.target === window ? "window" : (state.target as Element)?.tagName
      }`
    );

    // Store original scroll position
    state.origScrollPos = {
      x: this.getTargetScrollLeft(state.target),
      y: this.getTargetScrollTop(state.target),
    };

    // Initialize tween scroll position
    state.tweenScroll.x = state.origScrollPos.x;
    state.tweenScroll.y = state.origScrollPos.y;

    this.logDebug(`Initial scroll positions:`, {
      origScrollPos: state.origScrollPos,
      tweenScroll: state.tweenScroll,
    });

    // Kill any existing tweens for this hand
    gsap.killTweensOf(state.tweenScroll);

    // Update hand state with scroll info
    handState.scrollTarget = state.target;
    handState.origScrollPos = state.origScrollPos;
    handState.tweenScroll = state.tweenScroll;

    state.isScrolling = true;
    this.notifyScrollingState(event.hand, true);
  }

  /**
   * Handle pinch held event (continuous scrolling)
   */
  private handlePinchHeld(event: PinchEvent): void {
    this.logDebug(`Pinch held event received for ${event.hand} hand`);

    const state = this.scrollStates.get(event.hand)!;
    const handState = this.pinchDetector.getHandState(event.hand);

    if (!state.target) {
      this.logDebug(`No scroll target, skipping scroll`);
      return;
    }

    // Calculate movement delta
    // Note: x direction is negated to match natural scrolling
    const xDiff = -(event.origPinch.x - event.curPinch.x);
    const yDiff = event.origPinch.y - event.curPinch.y;

    // Convert normalized delta to pixel delta
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const pixelXDiff = xDiff * viewportWidth;
    const pixelYDiff = yDiff * viewportHeight;

    // Calculate target scroll position
    const targetX = state.tweenScroll.x + pixelXDiff * this.config.scrollSpeed;
    const targetY = state.tweenScroll.y + pixelYDiff * this.config.scrollSpeed;

    this.logDebug(`Scroll delta:`, {
      pixelDelta: { x: pixelXDiff, y: pixelYDiff },
      targetPosition: { x: targetX, y: targetY },
    });

    // Apply continuous scrolling with GSAP
    const tween = gsap.to(state.tweenScroll, {
      x: targetX,
      y: targetY,
      duration: this.config.tweenDuration,
      ease: this.config.tweenEase,
      overwrite: true,
      immediateRender: true,
      onStart: () => {
        this.logDebug(`GSAP tween started for ${event.hand} hand`);
      },
      onUpdate: () => {
        // Apply scroll to target - only log every 10th update to reduce spam
        if (state.target) {
          this.updateCounter++;
          if (this.updateCounter % 10 === 0) {
            this.logDebug(
              `GSAP onUpdate - applying scroll (update #${this.updateCounter})`
            );
          }
          this.applyScroll(state.target, state.tweenScroll);
        }
      },
      onComplete: () => {
        this.logInfo(`GSAP tween completed for ${event.hand} hand`);
      },
    });

    // Update hand state
    handState.tweenScroll = state.tweenScroll;
  }

  /**
   * Handle pinch released event
   */
  private handlePinchReleased(event: PinchEvent): void {
    this.logInfo(`Pinch released for ${event.hand} hand`);

    const state = this.scrollStates.get(event.hand)!;
    const handState = this.pinchDetector.getHandState(event.hand);

    // Kill any active tweens
    gsap.killTweensOf(state.tweenScroll);

    // Reset state
    state.target = null;
    state.isScrolling = false;

    // Update hand state
    handState.scrollTarget = null;

    this.notifyScrollingState(event.hand, false);
  }

  /**
   * Find the closest scrollable parent element
   */
  private findScrollableParent(element: Element | null): Element | Window {
    if (!element) return window;

    let current: Element | null = element;

    while (current) {
      const styles = getComputedStyle(current);

      // Check vertical scrollability
      if (current.scrollHeight > current.clientHeight) {
        if (
          styles.overflow === "auto" ||
          styles.overflow === "scroll" ||
          styles.overflowY === "auto" ||
          styles.overflowY === "scroll"
        ) {
          return current;
        }
      }

      // Check horizontal scrollability
      if (current.scrollWidth > current.clientWidth) {
        if (
          styles.overflow === "auto" ||
          styles.overflow === "scroll" ||
          styles.overflowX === "auto" ||
          styles.overflowX === "scroll"
        ) {
          return current;
        }
      }

      current = current.parentElement;
    }

    // Default to window if no scrollable parent found
    return window;
  }

  /**
   * Get scroll left position, handling window object
   */
  private getTargetScrollLeft(target: Element | Window | null): number {
    if (!target) return 0;

    if (target === window) {
      return window.scrollX || window.pageXOffset || 0;
    } else {
      return (target as Element).scrollLeft || 0;
    }
  }

  /**
   * Get scroll top position, handling window object
   */
  private getTargetScrollTop(target: Element | Window | null): number {
    if (!target) return 0;

    if (target === window) {
      return window.scrollY || window.pageYOffset || 0;
    } else {
      return (target as Element).scrollTop || 0;
    }
  }

  /**
   * Apply scroll to target
   */
  private applyScroll(target: Element | Window, position: Position): void {
    try {
      if (target === window) {
        window.scrollTo(position.x, position.y);
      } else {
        (target as Element).scrollTo(position.x, position.y);
      }
    } catch (error) {
      this.logError(`applyScroll failed:`, error);
    }
  }

  /**
   * Set callback for scrolling state changes
   */
  onScrollingStateChange(
    callback: (hand: HandType, isScrolling: boolean) => void
  ): void {
    this.onScrollingCallback = callback;
  }

  /**
   * Notify about scrolling state changes
   */
  private notifyScrollingState(hand: HandType, isScrolling: boolean): void {
    if (this.onScrollingCallback) {
      this.onScrollingCallback(hand, isScrolling);
    }
  }

  /**
   * Get current scroll state for a hand
   */
  getScrollState(hand: HandType): ScrollState {
    return this.scrollStates.get(hand)!;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ScrollConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Kill all active tweens
    this.scrollStates.forEach((state) => {
      gsap.killTweensOf(state.tweenScroll);
    });

    // Clear states
    this.scrollStates.clear();
  }
}
