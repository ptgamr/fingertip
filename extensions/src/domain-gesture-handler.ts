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

  // Drag-and-drop state management
  private isDragging: boolean = false;
  private dragElement: HTMLElement | null = null;
  private dragStartPosition: { x: number; y: number } | null = null;
  private dragOffset: { x: number; y: number } | null = null;

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
    const supportedDomains = [
      "bigbb.catalyst.net.nz",
      "redmine.catalyst.net.nz",
    ];

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
      console.log(
        `[DomainGestureHandler] Handler disabled for domain: ${this.currentDomain}`
      );
      return;
    }

    const gestureEvent = this.gestureDetector.detectGesture(
      hand,
      landmarks,
      videoWidth,
      videoHeight,
      isMirrored
    );

    // Debug: Log current gesture state every few frames
    const currentGesture = this.gestureDetector.getCurrentGesture(hand);
    const currentConfidence = this.gestureDetector.getCurrentConfidence(hand);

    // Log grab gesture attempts more frequently for debugging
    if (currentGesture === "grab" || currentConfidence > 0.3) {
      console.log(
        `[DomainGestureHandler] Gesture state: ${currentGesture} (${hand} hand, confidence: ${currentConfidence.toFixed(2)})`
      );
    }

    if (gestureEvent) {
      console.log(
        `[DomainGestureHandler] Gesture event detected: ${gestureEvent.type} (${gestureEvent.hand} hand, confidence: ${gestureEvent.confidence.toFixed(2)}, isTransition: ${gestureEvent.isTransition})`
      );
      this.handleGestureEvent(gestureEvent);
    }
  }

  /**
   * Handle detected gesture events
   */
  private handleGestureEvent(event: GestureEvent): void {
    // Handle grab gesture transitions differently for drag-and-drop
    if (
      this.currentDomain === "redmine.catalyst.net.nz" ||
      this.currentDomain.endsWith(".redmine.catalyst.net.nz")
    ) {
      // Show visual feedback for grab gestures on all domains
      if (event.type === "grab") {
        console.log(
          `[DomainGestureHandler] Grab gesture started: ${event.type} (${event.hand} hand, confidence: ${event.confidence.toFixed(2)})`
        );
        this.showGrabGestureVisualFeedback(event.position, event.hand);
      }
      this.handleRedmineGestureTransitions(event);
      return;
    }

    // Only handle transition events to prevent continuous triggering for other domains
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
   * Handle gesture transitions specifically for Redmine drag-and-drop
   */
  private handleRedmineGestureTransitions(event: GestureEvent): void {
    const gestureKey = `${event.hand}-${event.type}`;
    const now = Date.now();
    const lastTime = this.lastGestureTime.get(gestureKey) || 0;

    // For grab gestures, handle both transitions and continuous updates
    if (event.type === "grab") {
      if (event.isTransition) {
        // New grab gesture started
        if (now - lastTime >= this.GESTURE_COOLDOWN) {
          this.lastGestureTime.set(gestureKey, now);
          console.log(
            `[DomainGestureHandler] Grab gesture started: ${event.type} (${event.hand} hand, confidence: ${event.confidence.toFixed(2)})`
          );
          this.handleRedmineGestures(event);
        }
      } else if (this.isDragging) {
        // Continue dragging - update position
        this.updateDrag(event.position);
      }
    } else if (this.isDragging && event.isTransition) {
      // Grab gesture ended, drop the element
      console.log(
        `[DomainGestureHandler] Grab gesture ended, dropping element: ${event.type} (${event.hand} hand)`
      );
      this.stopDrag(event.position);
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
    } else if (event.type === "middle-finger-up") {
      console.log(
        "[DomainGestureHandler] Middle finger up detected on BigBB domain - triggering leave meeting action"
      );
      this.triggerMiddleFingerAction(event);
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
   * Trigger middle finger action for BigBB domain
   * This implements a sequence to leave the meeting by clicking dropdown then logout
   */
  private triggerMiddleFingerAction(event: GestureEvent): void {
    console.log(
      `[DomainGestureHandler] Middle finger action triggered at position (${event.position.x}, ${event.position.y})`
    );

    // Show visual feedback immediately
    this.showMiddleFingerVisualFeedback(event.position, "Leave Meeting");

    // Step 1: Find and click the leave meeting dropdown button
    const dropdownButton = document.querySelector(
      'button[data-test="leaveMeetingDropdown"]'
    ) as HTMLElement;

    if (
      dropdownButton &&
      this.isElementVisible(dropdownButton) &&
      !this.isElementDisabled(dropdownButton)
    ) {
      console.log(
        "[DomainGestureHandler] Clicking leave meeting dropdown button"
      );
      dropdownButton.click();

      // Step 2: Wait 2-3 seconds then click the direct logout button
      setTimeout(() => {
        const logoutButton = document.querySelector(
          "#directLogoutButton"
        ) as HTMLElement;

        if (
          logoutButton &&
          this.isElementVisible(logoutButton) &&
          !this.isElementDisabled(logoutButton)
        ) {
          console.log(
            "[DomainGestureHandler] Clicking direct logout button after delay"
          );
          logoutButton.click();
          console.log(
            "[DomainGestureHandler] Middle finger action sequence completed successfully"
          );
        } else {
          console.log(
            "[DomainGestureHandler] Direct logout button not found or not clickable after dropdown opened"
          );
        }
      }, 2500); // 2.5 second delay
    } else {
      console.log(
        "[DomainGestureHandler] Leave meeting dropdown button not found or not clickable"
      );
    }
  }

  /**
   * Handle gestures for redmine.catalyst.net.nz domain
   */
  private handleRedmineGestures(event: GestureEvent): void {
    if (event.type === "grab") {
      console.log(
        "[DomainGestureHandler] Grab gesture detected on Redmine domain - handling drag-and-drop"
      );
      this.handleRedmineGrabGesture(event);
    }
  }

  /**
   * Handle grab gesture for Redmine drag-and-drop functionality
   */
  private handleRedmineGrabGesture(event: GestureEvent): void {
    // Find .issue.task element at the gesture position
    const elementAtPosition = document.elementFromPoint(
      event.position.x,
      event.position.y
    );
    const issueElement = this.findIssueTaskElement(elementAtPosition);

    if (!issueElement) {
      console.log(
        "[DomainGestureHandler] No .issue.task element found at grab position"
      );
      return;
    }

    if (!this.isDragging) {
      // Start dragging
      this.startDrag(issueElement, event.position);
    } else {
      // Continue dragging or drop
      this.updateDrag(event.position);
    }
  }

  /**
   * Find the closest .issue.task element from a given element
   */
  private findIssueTaskElement(element: Element | null): HTMLElement | null {
    if (!element) return null;

    // Check if the element itself has both classes
    if (
      element.classList.contains("issue") &&
      element.classList.contains("task")
    ) {
      return element as HTMLElement;
    }

    // Check parent elements up the DOM tree
    let parent = element.parentElement;
    while (parent) {
      if (
        parent.classList.contains("issue") &&
        parent.classList.contains("task")
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  /**
   * Start dragging an issue task element
   */
  private startDrag(
    element: HTMLElement,
    position: { x: number; y: number }
  ): void {
    this.isDragging = true;
    this.dragElement = element;
    this.dragStartPosition = { x: position.x, y: position.y };

    // Calculate offset from element's top-left corner to grab position
    const rect = element.getBoundingClientRect();
    this.dragOffset = {
      x: position.x - rect.left,
      y: position.y - rect.top,
    };

    // Add visual feedback for drag start
    this.showRedmineDragStartFeedback(position);

    // Add dragging class for styling
    element.classList.add("fingertip-dragging");

    // Make element follow cursor
    element.style.position = "fixed";
    element.style.zIndex = "10000";
    element.style.pointerEvents = "none";
    element.style.left = `${position.x - this.dragOffset.x}px`;
    element.style.top = `${position.y - this.dragOffset.y}px`;

    // Trigger mousedown event for compatibility
    const mouseDownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: position.x,
      clientY: position.y,
    });
    element.dispatchEvent(mouseDownEvent);

    console.log("[DomainGestureHandler] Started dragging issue task element");
  }

  /**
   * Update drag position
   */
  private updateDrag(position: { x: number; y: number }): void {
    if (!this.isDragging || !this.dragElement || !this.dragOffset) {
      return;
    }

    // Update element position
    this.dragElement.style.left = `${position.x - this.dragOffset.x}px`;
    this.dragElement.style.top = `${position.y - this.dragOffset.y}px`;

    // Trigger mousemove event for compatibility
    const mouseMoveEvent = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: position.x,
      clientY: position.y,
    });
    this.dragElement.dispatchEvent(mouseMoveEvent);
  }

  /**
   * Stop dragging and drop the element
   */
  private stopDrag(position: { x: number; y: number }): void {
    if (!this.isDragging || !this.dragElement) {
      return;
    }

    // Show drop feedback
    this.showRedmineDragDropFeedback(position);

    // Remove dragging styles
    this.dragElement.classList.remove("fingertip-dragging");
    this.dragElement.style.position = "";
    this.dragElement.style.zIndex = "";
    this.dragElement.style.pointerEvents = "";
    this.dragElement.style.left = "";
    this.dragElement.style.top = "";

    // Trigger mouseup event for compatibility
    const mouseUpEvent = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: position.x,
      clientY: position.y,
    });
    this.dragElement.dispatchEvent(mouseUpEvent);

    // Reset drag state
    this.isDragging = false;
    this.dragElement = null;
    this.dragStartPosition = null;
    this.dragOffset = null;

    console.log("[DomainGestureHandler] Stopped dragging and dropped element");
  }

  /**
   * Show visual feedback for drag start
   */
  private showRedmineDragStartFeedback(position: {
    x: number;
    y: number;
  }): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 30}px;
      top: ${position.y - 30}px;
      width: 60px;
      height: 60px;
      background: radial-gradient(circle, rgba(0,123,255,0.8) 0%, rgba(0,123,255,0.3) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10001;
      animation: redmineDragStartRipple 1.5s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const textElement = document.createElement("div");
    textElement.textContent = "Grab";
    textElement.style.cssText = `
      color: #ffffff;
      background: rgba(0, 123, 255, 0.9);
      padding: 3px 8px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
    `;
    feedback.appendChild(textElement);

    // Add CSS animation for drag start
    if (!document.getElementById("redmine-drag-feedback-styles")) {
      const style = document.createElement("style");
      style.id = "redmine-drag-feedback-styles";
      style.textContent = `
        @keyframes redmineDragStartRipple {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes redmineDragDropRipple {
          0% { transform: scale(0.3); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }
        .fingertip-dragging {
          box-shadow: 0 8px 32px rgba(0, 123, 255, 0.3) !important;
          transform: rotate(2deg) !important;
          opacity: 0.9 !important;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 1500);
  }

  /**
   * Show visual feedback for drag drop
   */
  private showRedmineDragDropFeedback(position: {
    x: number;
    y: number;
  }): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 40}px;
      top: ${position.y - 40}px;
      width: 80px;
      height: 80px;
      background: radial-gradient(circle, rgba(40,167,69,0.8) 0%, rgba(40,167,69,0.3) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10001;
      animation: redmineDragDropRipple 2s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const textElement = document.createElement("div");
    textElement.textContent = "Drop";
    textElement.style.cssText = `
      color: #ffffff;
      background: rgba(40, 167, 69, 0.9);
      padding: 4px 10px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
    `;
    feedback.appendChild(textElement);

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 2000);
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
      animation: palmRaiseRipple 2s ease-out forwards;
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
        animation: palmTextFadeInBounce 2s ease-out forwards;
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
   * Show visual feedback specifically for middle finger gesture
   */
  private showMiddleFingerVisualFeedback(
    position: {
      x: number;
      y: number;
    },
    actionText?: string
  ): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 50}px;
      top: ${position.y - 50}px;
      width: 100px;
      height: 100px;
      background: radial-gradient(circle, rgba(220,20,60,0.9) 0%, rgba(220,20,60,0.4) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: middleFingerRipple 2.5s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Add action text if provided
    if (actionText) {
      const textElement = document.createElement("div");
      textElement.textContent = actionText;
      textElement.style.cssText = `
        color: #ffffff;
        background: rgba(220, 20, 60, 0.95);
        padding: 6px 12px;
        border-radius: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        box-shadow: 0 3px 12px rgba(220, 20, 60, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2);
        white-space: nowrap;
        animation: middleFingerTextPulse 2.5s ease-out forwards;
        transform: scale(0.8);
        opacity: 0;
      `;
      feedback.appendChild(textElement);
    }

    // Add CSS animation for middle finger gesture (distinctive red theme)
    if (!document.getElementById("middle-finger-feedback-styles")) {
      const style = document.createElement("style");
      style.id = "middle-finger-feedback-styles";
      style.textContent = `
        @keyframes middleFingerRipple {
          0% {
            transform: scale(0.4);
            opacity: 1;
          }
          30% {
            transform: scale(1.1);
            opacity: 0.9;
          }
          70% {
            transform: scale(1.8);
            opacity: 0.5;
          }
          100% {
            transform: scale(3);
            opacity: 0;
          }
        }
        @keyframes middleFingerTextPulse {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          20% {
            transform: scale(1.2);
            opacity: 1;
          }
          40% {
            transform: scale(0.9);
            opacity: 1;
          }
          60% {
            transform: scale(1.05);
            opacity: 1;
          }
          80% {
            transform: scale(0.95);
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
    }, 6000);
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
      left: ${position.x - 80}px;
      top: ${position.y - 120}px;
      width: 80px;
      height: 80px;
      background: radial-gradient(circle, rgba(0,255,0,0.8) 0%, rgba(0,255,0,0.2) 70%, transparent 100%);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: gestureRipple 2s ease-out forwards;
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
        animation: textFadeInScale 2s ease-out forwards;
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
   * Show visual feedback for grab gesture reference point
   */
  private showGrabGestureVisualFeedback(
    position: { x: number; y: number },
    hand: HandType
  ): void {
    const feedback = document.createElement("div");
    feedback.style.cssText = `
      position: fixed;
      left: ${position.x - 25}px;
      top: ${position.y - 25}px;
      width: 50px;
      height: 50px;
      background: radial-gradient(circle, rgba(255,0,128,0.9) 0%, rgba(255,0,128,0.4) 70%, transparent 100%);
      border: 3px solid rgba(255,255,255,0.8);
      border-radius: 50%;
      pointer-events: none;
      z-index: 10000;
      animation: grabGestureRipple 2s ease-out forwards;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Add hand indicator text
    const textElement = document.createElement("div");
    textElement.textContent = `${hand.toUpperCase()} GRAB`;
    textElement.style.cssText = `
      color: #ffffff;
      background: rgba(255, 0, 128, 0.95);
      padding: 3px 6px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 9px;
      font-weight: 700;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
      white-space: nowrap;
      animation: grabTextPulse 2s ease-out forwards;
      transform: scale(0.8);
      opacity: 0;
    `;
    feedback.appendChild(textElement);

    // Add crosshair to show exact reference point
    const crosshair = document.createElement("div");
    crosshair.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: 20px;
      height: 20px;
      transform: translate(-50%, -50%);
      border: 2px solid rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      background: rgba(255, 0, 128, 0.3);
    `;
    feedback.appendChild(crosshair);

    // Add CSS animation for grab gesture
    if (!document.getElementById("grab-gesture-feedback-styles")) {
      const style = document.createElement("style");
      style.id = "grab-gesture-feedback-styles";
      style.textContent = `
        @keyframes grabGestureRipple {
          0% {
            transform: scale(0.4);
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.8;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        @keyframes grabTextPulse {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          30% {
            transform: scale(1.2);
            opacity: 1;
          }
          70% {
            transform: scale(0.9);
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

    // Remove feedback after animation
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
    }, 3000);
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

    // Clean up drag state
    if (this.isDragging && this.dragElement) {
      this.dragElement.classList.remove("fingertip-dragging");
      this.dragElement.style.position = "";
      this.dragElement.style.zIndex = "";
      this.dragElement.style.pointerEvents = "";
      this.dragElement.style.left = "";
      this.dragElement.style.top = "";
    }

    this.isDragging = false;
    this.dragElement = null;
    this.dragStartPosition = null;
    this.dragOffset = null;
  }
}
