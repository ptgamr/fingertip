// Domain-specific gesture handlers for different websites
import { GestureEvent, GestureDetector } from "./gesture-detector";
import { HandLandmarks, HandType } from "./finger-tracker-types";

export interface DomainGestureConfig {
  domain: string;
  gestures: {
    [key: string]: () => void;
  };
}

export class DomainGestureHandler {
  private gestureDetector: GestureDetector;
  private currentDomain: string;
  private isEnabled: boolean = false;
  private lastGestureTime: Map<string, number> = new Map();
  private readonly GESTURE_COOLDOWN = 1000; // 1 second cooldown between gestures

  constructor() {
    this.gestureDetector = new GestureDetector();
    this.currentDomain = window.location.hostname;
    this.checkDomainSupport();
  }

  /**
   * Check if current domain has gesture support
   */
  private checkDomainSupport(): void {
    this.isEnabled = this.isSupportedDomain(this.currentDomain);
    if (this.isEnabled) {
      console.log(
        `[DomainGestureHandler] Enabled for domain: ${this.currentDomain}`
      );
    }
  }

  /**
   * Check if domain is supported for gesture handling
   */
  private isSupportedDomain(domain: string): boolean {
    const supportedDomains = ["bigbb.catalyst.net.nz"];

    return supportedDomains.some(
      (supportedDomain) =>
        domain === supportedDomain || domain.endsWith("." + supportedDomain)
    );
  }

  /**
   * Process hand landmarks and detect gestures
   */
  processHand(
    hand: HandType,
    landmarks: HandLandmarks,
    videoWidth: number,
    videoHeight: number
  ): void {
    if (!this.isEnabled) {
      return;
    }

    const gestureEvent = this.gestureDetector.detectGesture(
      hand,
      landmarks,
      videoWidth,
      videoHeight
    );

    if (gestureEvent) {
      this.handleGestureEvent(gestureEvent);
    }
  }

  /**
   * Handle detected gesture events
   */
  private handleGestureEvent(event: GestureEvent): void {
    const gestureKey = `${event.hand}-${event.type}`;
    const now = Date.now();
    const lastTime = this.lastGestureTime.get(gestureKey) || 0;

    // Check cooldown
    if (now - lastTime < this.GESTURE_COOLDOWN) {
      return;
    }

    this.lastGestureTime.set(gestureKey, now);

    console.log(
      `[DomainGestureHandler] Gesture detected: ${event.type} (${event.hand} hand, confidence: ${event.confidence.toFixed(2)})`
    );

    // Handle domain-specific gestures
    if (
      this.currentDomain === "bigbb.catalyst.net.nz" ||
      this.currentDomain.endsWith(".bigbb.catalyst.net.nz")
    ) {
      this.handleBigBBGestures(event);
    }
  }

  /**
   * Handle gestures for bigbb.catalyst.net.nz domain
   */
  private handleBigBBGestures(event: GestureEvent): void {
    if (event.type === "index-finger-up") {
      console.log(
        "[DomainGestureHandler] Index finger up detected on BigBB domain - triggering button click"
      );
      this.triggerBigBBButtonClick(event);
    }
  }

  /**
   * Trigger button click action for BigBB domain
   * This is a placeholder - you can customize this to click specific buttons
   */
  private triggerBigBBButtonClick(event: GestureEvent): void {
    // Example: Find and click a specific button
    // You can customize this selector based on the actual button you want to click
    const buttonSelectors = [
      'button[data-test="unmuteMicButton"]',
      'button[data-test="muteMicButton"]',
    ];

    let buttonClicked = false;

    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector) as HTMLElement;
      if (
        button &&
        this.isElementVisible(button) &&
        !this.isElementDisabled(button)
      ) {
        console.log(
          `[DomainGestureHandler] Clicking button with selector: ${selector}`
        );

        // Create a visual feedback at gesture position
        this.showGestureVisualFeedback(event.position);

        // Simulate a click event
        button.click();
        buttonClicked = true;
        break;
      }
    }

    if (!buttonClicked) {
      console.log("[DomainGestureHandler] No suitable button found to click");
      // Still show visual feedback even if no button was found
      this.showGestureVisualFeedback(event.position);
    }
  }

  /**
   * Check if element is visible and clickable
   */
  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  }

  /**
   * Check if element is disabled
   */
  private isElementDisabled(element: HTMLElement): boolean {
    // Check if element has disabled property (buttons, inputs)
    if ("disabled" in element) {
      return (element as HTMLButtonElement | HTMLInputElement).disabled;
    }

    // Check for disabled attribute
    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true"
    );
  }

  /**
   * Show visual feedback when gesture is triggered
   */
  private showGestureVisualFeedback(position: { x: number; y: number }): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 25}px;
      top: ${position.y - 25}px;
      width: 50px;
      height: 50px;
      background: radial-gradient(circle, rgba(0,255,0,0.8) 0%, rgba(0,255,0,0.2) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: gestureRipple 0.6s ease-out forwards;
    `;

    // Add CSS animation
    if (!document.getElementById("gesture-feedback-styles")) {
      const style = document.createElement("style");
      style.id = "gesture-feedback-styles";
      style.textContent = `
        @keyframes gestureRipple {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(feedback);

    // Remove feedback after animation
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 600);
  }

  /**
   * Reset gesture state for a specific hand
   */
  resetHand(hand: HandType): void {
    this.gestureDetector.resetHand(hand);
  }

  /**
   * Get current gesture for debugging
   */
  getCurrentGesture(hand: HandType): string {
    return this.gestureDetector.getCurrentGesture(hand);
  }

  /**
   * Get current confidence for debugging
   */
  getCurrentConfidence(hand: HandType): number {
    return this.gestureDetector.getCurrentConfidence(hand);
  }

  /**
   * Check if handler is enabled for current domain
   */
  isEnabledForDomain(): boolean {
    return this.isEnabled;
  }

  /**
   * Manually enable/disable the handler
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.isEnabled = false;
    this.lastGestureTime.clear();
  }
}
