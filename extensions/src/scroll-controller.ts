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

export class ScrollController {
  private config: ScrollConfig;
  private pinchDetector: PinchDetector;
  private scrollStates: Map<HandType, ScrollState>;
  private onScrollingCallback?: (hand: HandType, isScrolling: boolean) => void;

  constructor(pinchDetector: PinchDetector, config?: Partial<ScrollConfig>) {
    this.config = { ...defaultScrollConfig, ...config };
    this.pinchDetector = pinchDetector;
    this.scrollStates = new Map();

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
    console.log(`[ScrollController] Pinch start event received:`, {
      hand: event.hand,
      position: event.position,
      origPinch: event.origPinch,
      curPinch: event.curPinch,
    });

    const state = this.scrollStates.get(event.hand)!;
    const handState = this.pinchDetector.getHandState(event.hand);

    // Event position is already in screen coordinates from FingerTracker3
    const screenPos = event.position;

    // Find scrollable target at position
    const element = document.elementFromPoint(screenPos.x, screenPos.y);
    console.log(`[ScrollController] Element at point:`, {
      screenPos,
      element: element?.tagName,
      elementClass: element?.className,
      elementId: element?.id,
      elementScrollable: element
        ? {
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            computedStyle: element
              ? {
                  overflow: getComputedStyle(element).overflow,
                  overflowX: getComputedStyle(element).overflowX,
                  overflowY: getComputedStyle(element).overflowY,
                }
              : null,
          }
        : null,
    });

    state.target = this.findScrollableParent(element);
    console.log(`[ScrollController] Found scroll target:`, {
      target:
        state.target === window ? "window" : (state.target as Element)?.tagName,
      targetClass:
        state.target !== window ? (state.target as Element)?.className : "N/A",
      targetId: state.target !== window ? (state.target as Element)?.id : "N/A",
      targetScrollable:
        state.target !== window
          ? {
              scrollHeight: (state.target as Element).scrollHeight,
              clientHeight: (state.target as Element).clientHeight,
              scrollWidth: (state.target as Element).scrollWidth,
              clientWidth: (state.target as Element).clientWidth,
            }
          : {
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              documentHeight: document.documentElement.scrollHeight,
              documentWidth: document.documentElement.scrollWidth,
            },
    });

    // Store original scroll position
    state.origScrollPos = {
      x: this.getTargetScrollLeft(state.target),
      y: this.getTargetScrollTop(state.target),
    };

    // Initialize tween scroll position
    state.tweenScroll.x = state.origScrollPos.x;
    state.tweenScroll.y = state.origScrollPos.y;

    console.log(`[ScrollController] Initial scroll positions:`, {
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
    console.log(`[ScrollController] Pinch held event received:`, {
      hand: event.hand,
      position: event.position,
      origPinch: event.origPinch,
      curPinch: event.curPinch,
    });

    const state = this.scrollStates.get(event.hand)!;
    const handState = this.pinchDetector.getHandState(event.hand);

    if (!state.target) {
      console.log(`[ScrollController] No scroll target, skipping scroll`);
      return;
    }

    // Calculate movement delta
    // Note: x direction is negated to match natural scrolling
    const xDiff = -(event.origPinch.x - event.curPinch.x);
    const yDiff = event.origPinch.y - event.curPinch.y;

    // Convert normalized delta to pixel delta
    // Assuming normalized coordinates are 0-1, multiply by viewport size
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const pixelXDiff = xDiff * viewportWidth;
    const pixelYDiff = yDiff * viewportHeight;

    // REFERENCE COMPARISON: The reference implementation uses:
    // x: this.tweenScroll[n].x - (hands.origPinch[n][0].x - hands.curPinch[n][0].x) * width * this.config.speed
    // y: this.tweenScroll[n].y + (hands.origPinch[n][0].y - hands.curPinch[n][0].y) * height * this.config.speed
    const referenceXDiff = -(event.origPinch.x - event.curPinch.x);
    const referenceYDiff = event.origPinch.y - event.curPinch.y;
    const referenceNewX =
      state.tweenScroll.x +
      referenceXDiff * viewportWidth * this.config.scrollSpeed;
    const referenceNewY =
      state.tweenScroll.y +
      referenceYDiff * viewportHeight * this.config.scrollSpeed;

    console.log(`[ScrollController] Scroll calculations:`, {
      rawPositions: {
        origPinch: event.origPinch,
        curPinch: event.curPinch,
      },
      deltas: {
        xDiff,
        yDiff,
        referenceXDiff,
        referenceYDiff,
      },
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      pixelDeltas: {
        pixelXDiff,
        pixelYDiff,
      },
      scrollSpeed: this.config.scrollSpeed,
      currentTweenScroll: { ...state.tweenScroll },
      newTweenScroll: {
        x: state.tweenScroll.x + pixelXDiff * this.config.scrollSpeed,
        y: state.tweenScroll.y + pixelYDiff * this.config.scrollSpeed,
      },
      referenceNewScroll: {
        x: referenceNewX,
        y: referenceNewY,
      },
      comparison: {
        xMatches:
          Math.abs(
            state.tweenScroll.x +
              pixelXDiff * this.config.scrollSpeed -
              referenceNewX
          ) < 0.1,
        yMatches:
          Math.abs(
            state.tweenScroll.y +
              pixelYDiff * this.config.scrollSpeed -
              referenceNewY
          ) < 0.1,
      },
    });

    // Calculate target scroll position
    const targetX = state.tweenScroll.x + pixelXDiff * this.config.scrollSpeed;
    const targetY = state.tweenScroll.y + pixelYDiff * this.config.scrollSpeed;

    console.log(`[ScrollController] GSAP tween setup:`, {
      gsapAvailable: typeof gsap !== "undefined",
      gsapVersion: gsap?.version,
      tweenConfig: {
        from: { ...state.tweenScroll },
        to: { x: targetX, y: targetY },
        duration: this.config.tweenDuration,
        ease: this.config.tweenEase,
        overwrite: true,
        immediateRender: true,
      },
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
        console.log(`[ScrollController] GSAP tween started:`, {
          hand: event.hand,
          startPosition: { ...state.tweenScroll },
          targetPosition: { x: targetX, y: targetY },
        });
      },
      onUpdate: () => {
        // Apply scroll to target
        if (state.target) {
          console.log(`[ScrollController] GSAP onUpdate - Applying scroll:`, {
            target:
              state.target === window
                ? "window"
                : (state.target as Element)?.tagName,
            currentTweenPosition: { ...state.tweenScroll },
            actualScrollBefore: {
              x: this.getTargetScrollLeft(state.target),
              y: this.getTargetScrollTop(state.target),
            },
          });

          this.applyScroll(state.target, state.tweenScroll);

          console.log(`[ScrollController] GSAP onUpdate - Scroll applied:`, {
            actualScrollAfter: {
              x: this.getTargetScrollLeft(state.target),
              y: this.getTargetScrollTop(state.target),
            },
          });
        }
      },
      onComplete: () => {
        console.log(`[ScrollController] GSAP tween completed:`, {
          hand: event.hand,
          finalPosition: { ...state.tweenScroll },
        });
      },
    });

    console.log(`[ScrollController] GSAP tween created:`, {
      tweenExists: !!tween,
      tweenDuration: tween?.duration(),
      tweenProgress: tween?.progress(),
      tweenIsActive: tween?.isActive(),
    });

    // Update hand state
    handState.tweenScroll = state.tweenScroll;
  }

  /**
   * Handle pinch released event
   */
  private handlePinchReleased(event: PinchEvent): void {
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
    const beforeScroll = {
      x: this.getTargetScrollLeft(target),
      y: this.getTargetScrollTop(target),
    };

    console.log(`[ScrollController] applyScroll called:`, {
      target: target === window ? "window" : (target as Element)?.tagName,
      requestedPosition: position,
      currentScrollPosition: beforeScroll,
      scrollToMethod:
        target === window ? "window.scrollTo" : "element.scrollTo",
    });

    try {
      if (target === window) {
        window.scrollTo(position.x, position.y);
      } else {
        (target as Element).scrollTo(position.x, position.y);
      }

      const afterScroll = {
        x: this.getTargetScrollLeft(target),
        y: this.getTargetScrollTop(target),
      };

      console.log(`[ScrollController] applyScroll result:`, {
        beforeScroll,
        afterScroll,
        actualChange: {
          x: afterScroll.x - beforeScroll.x,
          y: afterScroll.y - beforeScroll.y,
        },
        success:
          Math.abs(afterScroll.x - position.x) < 1 &&
          Math.abs(afterScroll.y - position.y) < 1,
      });
    } catch (error) {
      console.error(`[ScrollController] applyScroll failed:`, error);
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
