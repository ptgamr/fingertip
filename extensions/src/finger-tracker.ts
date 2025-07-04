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

export class FingerTracker {
  private dot: HTMLElement;
  private isVisible: boolean = false;
  private positionHistory: Position[] = [];
  private pinchHistory: PinchData[] = [];
  private readonly HISTORY_LIMIT = 10; // Keep last 10 positions
  private readonly FLICK_THRESHOLD = 30; // Minimum distance for flick detection
  private readonly FLICK_TIME_WINDOW = 300; // Time window in ms for flick detection
  private readonly SCROLL_AMOUNT = 100; // Pixels to scroll
  private readonly PINCH_ENTER_THRESHOLD = 0.04; // Lower threshold to enter pinch mode
  private readonly PINCH_EXIT_THRESHOLD = 0.06; // Higher threshold to exit pinch mode (hysteresis)
  private readonly PINCH_MOVEMENT_THRESHOLD = 20; // Minimum movement for scroll
  private readonly PINCH_SMOOTHING_FRAMES = 3; // Number of frames to smooth pinch detection
  private lastFlickTime = 0;
  private readonly FLICK_COOLDOWN = 500; // Cooldown between flicks in ms
  private isPinching: boolean = false;
  private pinchDistanceHistory: number[] = [];
  private lastScrollTime = 0;
  private readonly SCROLL_COOLDOWN = 100; // Cooldown between scrolls in ms
  // Debounce counters for stable pinch state transitions
  private pinchConfirmCount = 0;
  private pinchReleaseCount = 0;
  private smoothedPinchDistance: number | null = null;
  private readonly PINCH_EMA_ALPHA = 0.6; // Exponential moving average alpha (0..1)
  // Momentum scrolling parameters
  private readonly MOMENTUM_MULTIPLIER = 1000; // Multiplier to convert velocity (px/ms) to scroll distance
  private readonly MAX_MOMENTUM_SCROLL = 3000; // Cap scroll distance
  private readonly MIN_MOMENTUM_SCROLL = 100; // Ensure at least base amount

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

    // Note: Flick gesture detection is disabled as requested
    // this.detectFlickGesture();

    // Update visual position
    this.dot.style.left = `${x}px`;
    this.dot.style.top = `${y}px`;

    if (!this.isVisible) {
      this.dot.style.display = "block";
      this.isVisible = true;
    }
  }

  updateWithLandmarks(landmarks: Array<{x: number, y: number, z?: number}>, videoWidth: number, videoHeight: number, isMirrored: boolean = false): void {
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
    const pinchDistance = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) + 
      Math.pow(indexTip.y - thumbTip.y, 2)
    ) / Math.max(videoWidth, videoHeight);

    // Update exponential moving average for pinch-distance smoothing
    if (this.smoothedPinchDistance === null) {
      this.smoothedPinchDistance = pinchDistance;
    } else {
      this.smoothedPinchDistance = this.PINCH_EMA_ALPHA * pinchDistance +
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

    // Debounce: require two consecutive frames to change pinch state
    if (isCurrentlyPinching && !this.isPinching) {
      this.pinchConfirmCount++;
      if (this.pinchConfirmCount < 2) {
        isCurrentlyPinching = false;
      }
    } else if (!isCurrentlyPinching && this.isPinching) {
      this.pinchReleaseCount++;
      if (this.pinchReleaseCount < 2) {
        isCurrentlyPinching = true;
      }
    } else {
      // Reset counters when state is stable
      this.pinchConfirmCount = 0;
      this.pinchReleaseCount = 0;
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

    // Detect pinch scroll gestures
    this.detectPinchScroll();

    // Clear histories when pinch ends to prevent stale data causing flicker
    if (!isCurrentlyPinching && this.isPinching) {
      this.pinchHistory = [];
      this.pinchDistanceHistory = [];
      this.smoothedPinchDistance = null;
    }

    // Update visual feedback based on pinching state
    if (isCurrentlyPinching && !this.isPinching) {
      // Just started pinching
      this.dot.style.backgroundColor = "#00ff00"; // Green when pinching
      this.dot.style.boxShadow = "0 0 20px rgba(0, 255, 0, 0.9)";
    } else if (!isCurrentlyPinching && this.isPinching) {
      // Just stopped pinching
      this.dot.style.backgroundColor = "#ff0000"; // Red when not pinching
      this.dot.style.boxShadow = "0 0 15px rgba(255, 0, 0, 0.9)";
    }

    this.isPinching = isCurrentlyPinching;

    // Update visual position
    this.dot.style.left = `${indexScreenX}px`;
    this.dot.style.top = `${indexScreenY}px`;

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

  private detectPinchScroll(): void {
    if (this.pinchHistory.length < 3) {
      return;
    }

    const currentTime = Date.now();

    // Check cooldown
    if (currentTime - this.lastScrollTime < this.SCROLL_COOLDOWN) {
      return;
    }

    // Get recent pinching positions
    const recentPinchData = this.pinchHistory.filter(
      (data) => data.isPinching && currentTime - data.timestamp <= 300
    );

    if (recentPinchData.length < 3) {
      return;
    }

    // Calculate vertical movement during pinching
    const startPos = recentPinchData[0];
    const endPos = recentPinchData[recentPinchData.length - 1];
    const verticalMovement = endPos.y - startPos.y;
    const timeElapsed = endPos.timestamp - startPos.timestamp;

    // Check if movement is significant enough
    if (Math.abs(verticalMovement) >= this.PINCH_MOVEMENT_THRESHOLD) {
      // Calculate velocity (pixels per millisecond)
      const velocity = Math.abs(verticalMovement) / Math.max(timeElapsed, 1);
      
      // Convert velocity to scroll distance with momentum
      let momentumScroll = velocity * this.MOMENTUM_MULTIPLIER;
      
      // Clamp the scroll distance within bounds
      momentumScroll = Math.min(this.MAX_MOMENTUM_SCROLL, Math.max(this.MIN_MOMENTUM_SCROLL, momentumScroll));

      // Invert the scroll direction: hand up = scroll down, hand down = scroll up
      const scrollAmount = -Math.sign(verticalMovement) * momentumScroll;
      this.scrollPage(scrollAmount);
      this.lastScrollTime = currentTime;
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
    this.dot.style.backgroundColor = amount < 0 ? "#00ffff" : "#ff00ff"; // Cyan for up, magenta for down

    setTimeout(() => {
      this.dot.style.backgroundColor = this.isPinching ? "#00ff00" : "#ff0000";
    }, 200);
  }

  hide(): void {
    this.dot.style.display = "none";
    this.isVisible = false;
    // Clear position history when hiding
    this.positionHistory = [];
    this.pinchHistory = [];
    this.pinchDistanceHistory = [];
    this.isPinching = false;
    this.pinchConfirmCount = 0;
    this.pinchReleaseCount = 0;
    this.smoothedPinchDistance = null;
  }

  destroy(): void {
    if (this.dot.parentElement) {
      this.dot.parentElement.removeChild(this.dot);
    }
  }
}
