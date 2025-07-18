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
    videoHeight: number,
    isMirrored: boolean = false
  ): void {
    if (!this.isEnabled) {
      return;
    }

    const gestureEvent = this.gestureDetector.detectGesture(
      hand,
      landmarks,
      videoWidth,
      videoHeight,
      isMirrored
    );

    if (gestureEvent) {
      this.handleGestureEvent(gestureEvent);
    }
  }

  /**
   * Handle detected gesture events
   */
  private handleGestureEvent(event: GestureEvent): void {
    // Only handle transition events to prevent continuous triggering
    if (!event.isTransition) {
      return;
    }

    const gestureKey = `${event.hand}-${event.type}`;
    const now = Date.now();
    const lastTime = this.lastGestureTime.get(gestureKey) || 0;

    // Check cooldown (reduced since we're only handling transitions)
    if (now - lastTime < this.GESTURE_COOLDOWN) {
      return;
    }

    this.lastGestureTime.set(gestureKey, now);

    console.log(
      `[DomainGestureHandler] Gesture transition detected: ${event.type} (${event.hand} hand, confidence: ${event.confidence.toFixed(2)})`
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
    } else if (event.type === "palm-raise") {
      console.log(
        "[DomainGestureHandler] Palm raise detected on BigBB domain - triggering palm raise action"
      );
      this.triggerPalmRaiseAction(event);
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
    let actionText = "Mute/Unmute";

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

        // Determine action text based on which button is visible
        if (selector === 'button[data-test="unmuteMicButton"]') {
          actionText = "Unmute";
        } else if (selector === 'button[data-test="muteMicButton"]') {
          actionText = "Mute";
        }

        // Create a visual feedback at gesture position with action text
        this.showMuteUnmuteVisualFeedback(event.position, actionText);

        // Simulate a click event
        button.click();
        buttonClicked = true;
        break;
      }
    }

    if (!buttonClicked) {
      console.log("[DomainGestureHandler] No suitable button found to click");
      // Still show visual feedback even if no button was found
      this.showMuteUnmuteVisualFeedback(event.position, actionText);
    }
  }

  /**
   * Trigger palm raise action for BigBB domain
   * This is a placeholder action that provides visual feedback and logging
   */
  private triggerPalmRaiseAction(event: GestureEvent): void {
    console.log(
      `[DomainGestureHandler] Palm raise action triggered at position (${event.position.x}, ${event.position.y})`
    );
    // Example: Find and click a specific button
    // You can customize this selector based on the actual button you want to click
    const buttonSelectors = [
      'button[data-test="raiseHandBtn"]',
      'button[data-test="lowerHandBtn"]',
    ];

    let buttonClicked = false;
    let actionText = "Raise/Lower Hand";

    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector) as HTMLElement;
      if (
        button &&
        this.isElementVisible(button) &&
        !this.isElementDisabled(button)
      ) {
        // Determine action text based on which button is visible
        if (selector === 'button[data-test="raiseHandBtn"]') {
          actionText = "Raise Hand";
        } else if (selector === 'button[data-test="lowerHandBtn"]') {
          actionText = "Lower Hand";
        }

        // Show distinctive visual feedback for palm raise with action text
        this.showPalmRaiseVisualFeedback(event.position, actionText);

        console.log(
          "[DomainGestureHandler] Palm raise placeholder action executed"
        );

        // Simulate a click event
        button.click();
        buttonClicked = true;
        break;
      }
    }

    if (!buttonClicked) {
      console.log(
        "[DomainGestureHandler] No suitable hand button found to click"
      );
      // Still show visual feedback even if no button was found
      this.showPalmRaiseVisualFeedback(event.position, actionText);
    }
  }

  /**
   * Show visual feedback specifically for palm raise gesture
   */
  private showPalmRaiseVisualFeedback(
    position: {
      x: number;
      y: number;
    },
    actionText?: string
  ): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 45}px;
      top: ${position.y - 45}px;
      width: 90px;
      height: 90px;
      background: radial-gradient(circle, rgba(255,165,0,0.8) 0%, rgba(255,165,0,0.3) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: palmRaiseRipple 0.8s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Add action text if provided
    if (actionText) {
      const textElement = document.createElement("div");
      textElement.textContent = actionText;
      textElement.style.cssText = `
        color: #1a1a1a;
        background: rgba(255, 255, 255, 0.95);
        padding: 4px 8px;
        border-radius: 12px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8), 0 -1px 1px rgba(0, 0, 0, 0.2);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
        white-space: nowrap;
        animation: palmTextFadeInBounce 0.8s ease-out forwards;
        transform: scale(0.7) translateY(5px);
        opacity: 0;
      `;
      feedback.appendChild(textElement);
    }

    // Add CSS animation for palm raise (different from regular gesture)
    if (!document.getElementById("palm-raise-feedback-styles")) {
      const style = document.createElement("style");
      style.id = "palm-raise-feedback-styles";
      style.textContent = `
        @keyframes palmRaiseRipple {
          0% {
            transform: scale(0.3);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        @keyframes palmTextFadeInBounce {
          0% {
            transform: scale(0.6) translateY(8px);
            opacity: 0;
          }
          30% {
            transform: scale(1.15) translateY(-2px);
            opacity: 1;
          }
          60% {
            transform: scale(0.95) translateY(1px);
            opacity: 1;
          }
          100% {
            transform: scale(1) translateY(0px);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(feedback);

    // Remove feedback after animation (extended duration for better visibility)
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 5000);
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
  private showMuteUnmuteVisualFeedback(
    position: { x: number; y: number },
    actionText?: string
  ): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 40}px;
      top: ${position.y - 40}px;
      width: 80px;
      height: 80px;
      background: radial-gradient(circle, rgba(0,255,0,0.8) 0%, rgba(0,255,0,0.2) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: gestureRipple 0.6s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Add action text if provided
    if (actionText) {
      const textElement = document.createElement("div");
      textElement.textContent = actionText;
      textElement.style.cssText = `
        color: #1a1a1a;
        background: rgba(255, 255, 255, 0.95);
        padding: 4px 10px;
        border-radius: 14px;
        border: 1px solid rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 600;
        text-align: center;
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8), 0 -1px 1px rgba(0, 0, 0, 0.2);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
        white-space: nowrap;
        animation: textFadeInScale 0.6s ease-out forwards;
        transform: scale(0.8);
        opacity: 0;
      `;
      feedback.appendChild(textElement);
    }

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
        @keyframes textFadeInScale {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          20% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(feedback);

    // Remove feedback after animation (extended duration for better visibility)
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 5000);
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
