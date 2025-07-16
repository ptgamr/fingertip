import { gsap } from "gsap";
import {
  HandType,
  Position,
  VisualConfig,
  defaultVisualConfig,
} from "./finger-tracker-types";

interface DotElement {
  element: HTMLElement;
  isVisible: boolean;
  tweenedPosition: Position;
}

export class VisualFeedback {
  private config: VisualConfig;
  private dots: Map<HandType, DotElement>;
  private debugElement: HTMLElement | null = null;

  constructor(config?: Partial<VisualConfig>) {
    this.config = { ...defaultVisualConfig, ...config };
    this.dots = new Map();

    // Create dots for both hands
    this.createDot("left");
    this.createDot("right");

    // Create debug element if enabled
    if (this.config.showDebug) {
      this.createDebugElement();
    }
  }

  /**
   * Create a dot element for a specific hand
   */
  private createDot(hand: HandType): void {
    const dot = document.createElement("div");
    dot.id = `fingertip-tracker-dot-${hand}`;
    dot.className = "fingertip-tracker-dot";

    // Base styles
    dot.style.position = "fixed";
    dot.style.width = `${this.config.dotSize}px`;
    dot.style.height = `${this.config.dotSize}px`;
    dot.style.borderRadius = "50%";
    dot.style.pointerEvents = "none";
    dot.style.zIndex = "99999";
    dot.style.display = "none";
    dot.style.transform = "translate(-50%, -50%)";

    // Hand-specific colors
    const color =
      hand === "left" ? this.config.leftHandColor : this.config.rightHandColor;
    dot.style.backgroundColor = color;
    dot.style.boxShadow = `0 0 ${this.config.glowIntensity}px ${color}`;

    // Add to DOM
    document.body.appendChild(dot);

    // Store dot info
    this.dots.set(hand, {
      element: dot,
      isVisible: false,
      tweenedPosition: { x: 0, y: 0 },
    });
  }

  /**
   * Create debug visualization element
   */
  private createDebugElement(): void {
    this.debugElement = document.createElement("div");
    this.debugElement.id = "fingertip-tracker-debug";
    this.debugElement.style.position = "fixed";
    this.debugElement.style.bottom = "10px";
    this.debugElement.style.right = "10px";
    this.debugElement.style.padding = "10px";
    this.debugElement.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    this.debugElement.style.color = "white";
    this.debugElement.style.fontFamily = "monospace";
    this.debugElement.style.fontSize = "12px";
    this.debugElement.style.borderRadius = "4px";
    this.debugElement.style.zIndex = "99999";
    this.debugElement.style.pointerEvents = "none";
    this.debugElement.style.minWidth = "200px";

    // Initial content
    this.updateDebugInfo({
      left: { visible: false, pinching: false, position: { x: 0, y: 0 } },
      right: { visible: false, pinching: false, position: { x: 0, y: 0 } },
    });

    document.body.appendChild(this.debugElement);
  }

  /**
   * Update the position of a hand's dot
   */
  updatePosition(hand: HandType, position: Position): void {
    const dot = this.dots.get(hand);
    if (!dot) return;

    // Show dot if hidden
    if (!dot.isVisible) {
      dot.element.style.display = "block";
      dot.isVisible = true;
    }

    // Tween to new position
    gsap.to(dot.tweenedPosition, {
      x: position.x,
      y: position.y,
      duration: this.config.tweenDuration,
      ease: "power2.out",
      onUpdate: () => {
        dot.element.style.left = `${dot.tweenedPosition.x}px`;
        dot.element.style.top = `${dot.tweenedPosition.y}px`;
      },
    });
  }

  /**
   * Show pinch state visually
   */
  showPinch(hand: HandType): void {
    const dot = this.dots.get(hand);
    if (!dot) return;

    const baseColor =
      hand === "left" ? this.config.leftHandColor : this.config.rightHandColor;

    // Change to green when pinching
    dot.element.style.backgroundColor = "#00ff00";
    dot.element.style.boxShadow = `0 0 ${this.config.glowIntensity * 1.5}px rgba(0, 255, 0, 0.9)`;

    // Add pulsing effect
    gsap.to(dot.element, {
      scale: 1.2,
      duration: 0.2,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
    });
  }

  /**
   * Hide pinch state visually
   */
  hidePinch(hand: HandType): void {
    const dot = this.dots.get(hand);
    if (!dot) return;

    // Restore original color
    const color =
      hand === "left" ? this.config.leftHandColor : this.config.rightHandColor;
    dot.element.style.backgroundColor = color;
    dot.element.style.boxShadow = `0 0 ${this.config.glowIntensity}px ${color}`;
  }

  /**
   * Show active scrolling state
   */
  showScrolling(hand: HandType): void {
    const dot = this.dots.get(hand);
    if (!dot) return;

    // Yellow color during scrolling
    dot.element.style.backgroundColor = "#ffff00";
    dot.element.style.boxShadow = `0 0 ${this.config.glowIntensity * 1.2}px rgba(255, 255, 0, 0.9)`;
  }

  /**
   * Hide a hand's dot
   */
  hideDot(hand: HandType): void {
    const dot = this.dots.get(hand);
    if (!dot) return;

    if (dot.isVisible) {
      dot.element.style.display = "none";
      dot.isVisible = false;

      // Kill any active tweens
      gsap.killTweensOf(dot.tweenedPosition);
      gsap.killTweensOf(dot.element);
    }
  }

  /**
   * Update debug information display
   */
  updateDebugInfo(info: {
    left: { visible: boolean; pinching: boolean; position: Position };
    right: { visible: boolean; pinching: boolean; position: Position };
  }): void {
    if (!this.debugElement) return;

    const leftStatus = info.left.visible
      ? `Visible | ${info.left.pinching ? "Pinching" : "Not Pinching"} | (${Math.round(info.left.position.x)}, ${Math.round(info.left.position.y)})`
      : "Not Visible";

    const rightStatus = info.right.visible
      ? `Visible | ${info.right.pinching ? "Pinching" : "Not Pinching"} | (${Math.round(info.right.position.x)}, ${Math.round(info.right.position.y)})`
      : "Not Visible";

    this.debugElement.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">Hand Tracking Debug</div>
      <div style="color: ${this.config.leftHandColor};">Left: ${leftStatus}</div>
      <div style="color: ${this.config.rightHandColor};">Right: ${rightStatus}</div>
    `;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<VisualConfig>): void {
    this.config = { ...this.config, ...config };

    // Update dot sizes and colors
    this.dots.forEach((dot, hand) => {
      dot.element.style.width = `${this.config.dotSize}px`;
      dot.element.style.height = `${this.config.dotSize}px`;

      const color =
        hand === "left"
          ? this.config.leftHandColor
          : this.config.rightHandColor;
      dot.element.style.backgroundColor = color;
      dot.element.style.boxShadow = `0 0 ${this.config.glowIntensity}px ${color}`;
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove dots
    this.dots.forEach((dot) => {
      gsap.killTweensOf(dot.tweenedPosition);
      gsap.killTweensOf(dot.element);
      if (dot.element.parentElement) {
        dot.element.parentElement.removeChild(dot.element);
      }
    });
    this.dots.clear();

    // Remove debug element
    if (this.debugElement && this.debugElement.parentElement) {
      this.debugElement.parentElement.removeChild(this.debugElement);
    }
  }
}
