interface Position {
  x: number;
  y: number;
  timestamp: number;
}

export class FingerTracker {
  private dot: HTMLElement;
  private isVisible: boolean = false;
  private positionHistory: Position[] = [];
  private readonly HISTORY_LIMIT = 10; // Keep last 10 positions
  private readonly FLICK_THRESHOLD = 30; // Minimum distance for flick detection
  private readonly FLICK_TIME_WINDOW = 300; // Time window in ms for flick detection
  private readonly SCROLL_AMOUNT = 100; // Pixels to scroll
  private lastFlickTime = 0;
  private readonly FLICK_COOLDOWN = 500; // Cooldown between flicks in ms

  constructor() {
    this.dot = this.createDot();
    document.body.appendChild(this.dot);
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

    // Check for flick gestures
    this.detectFlickGesture();

    // Update visual position
    this.dot.style.left = `${x}px`;
    this.dot.style.top = `${y}px`;

    if (!this.isVisible) {
      this.dot.style.display = "block";
      this.isVisible = true;
    }
  }

  private detectFlickGesture(): void {
    if (this.positionHistory.length < 3) {
      return; // Need at least 3 positions to detect movement
    }

    const currentTime = Date.now();

    // Check cooldown
    if (currentTime - this.lastFlickTime < this.FLICK_COOLDOWN) {
      return;
    }

    // Get positions within the time window
    const recentPositions = this.positionHistory.filter(
      (pos) => currentTime - pos.timestamp <= this.FLICK_TIME_WINDOW
    );

    if (recentPositions.length < 3) {
      return;
    }

    // Calculate vertical movement
    const startPos = recentPositions[0];
    const endPos = recentPositions[recentPositions.length - 1];
    const verticalMovement = endPos.y - startPos.y;
    const timeElapsed = endPos.timestamp - startPos.timestamp;

    // Check if movement is significant enough and fast enough
    if (
      Math.abs(verticalMovement) >= this.FLICK_THRESHOLD &&
      timeElapsed <= this.FLICK_TIME_WINDOW
    ) {
      // Calculate velocity to ensure it's a flick (fast movement)
      const velocity = Math.abs(verticalMovement) / timeElapsed;

      if (velocity > 0.1) {
        // Minimum velocity threshold (pixels per ms)
        if (verticalMovement < 0) {
          // Flick up - scroll up
          this.scrollPage(-this.SCROLL_AMOUNT);
          this.lastFlickTime = currentTime;
        } else {
          // Flick down - scroll down
          this.scrollPage(this.SCROLL_AMOUNT);
          this.lastFlickTime = currentTime;
        }
      }
    }
  }

  private scrollPage(amount: number): void {
    // Smooth scroll
    window.scrollBy({
      top: amount,
      behavior: "smooth",
    });

    // Visual feedback - briefly change dot color
    const originalColor = this.dot.style.backgroundColor;
    this.dot.style.backgroundColor = amount < 0 ? "#00ff00" : "#0000ff"; // Green for up, blue for down

    setTimeout(() => {
      this.dot.style.backgroundColor = originalColor;
    }, 200);
  }

  hide(): void {
    this.dot.style.display = "none";
    this.isVisible = false;
    // Clear position history when hiding
    this.positionHistory = [];
  }

  destroy(): void {
    if (this.dot.parentElement) {
      this.dot.parentElement.removeChild(this.dot);
    }
  }
}
