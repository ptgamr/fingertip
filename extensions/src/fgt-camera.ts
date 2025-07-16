/// <reference types="chrome"/>

import { FingerTracker3 } from "./finger-tracker-3";
import {
  HandDetector,
  HandDetectionResult,
  HandLandmark,
} from "./hand-detector-interface";
import { HandDetectorFactory, HandDetectorType } from "./hand-detector-factory";
import { OffscreenHandDetector } from "./offscreen-hand-detector";

export interface Settings {
  shape: string;
  mirror: boolean;
  width: number;
  position: string;
  trackTabs: boolean;
  trackPresentation: boolean;
}

// HandPose interface moved to hand-detector-interface.ts

export class FGTCamera {
  frame: HTMLElement;
  settings: Settings;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  videoStream: MediaStream | null = null;
  isRunning: boolean = false;
  isWaitingStream: boolean = false;
  fullscreenElementAttached: Element | null = null;
  container: HTMLDivElement;
  observer?: MutationObserver;
  handDetector: HandDetector | null = null;
  animationId: number | null = null;
  fingerTracker: FingerTracker3 | null = null;
  handDetectorType: HandDetectorType = "offscreen";

  constructor(
    element: HTMLElement,
    settings: Settings,
    detectorType: HandDetectorType = "offscreen"
  ) {
    this.frame = element;
    this.settings = settings || {
      shape: "oval",
      mirror: true,
      width: 240,
      position: "leftBottom",
      trackTabs: true,
      trackPresentation: true,
    };

    this.video = document.createElement("video");
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;

    // For offscreen detector, video element is hidden but canvas is visible to show feed
    this.video.style.display = "none";
    this.canvas.style.display = "block";

    this.videoStream = null;
    this.isRunning = false;
    this.isWaitingStream = false;
    this.fullscreenElementAttached = null;
    this.handDetectorType = detectorType;

    this.container = document.createElement("div");
    this.container.style.position = "relative";

    // Add elements to container
    this.container.appendChild(this.video);
    this.container.appendChild(this.canvas);

    element.appendChild(this.container);

    // Initialize hand detector
    this.initializeHandDetector(detectorType);
  }

  async initializeHandDetector(detectorType: HandDetectorType): Promise<void> {
    try {
      this.handDetector = HandDetectorFactory.create(detectorType);
      await this.handDetector.initialize();
      console.log(`Hand detector (${detectorType}) initialized successfully`);
    } catch (error) {
      console.error(
        `Failed to initialize hand detector (${detectorType}):`,
        error
      );
    }
  }

  async detectHands(): Promise<void> {
    if (!this.handDetector || !this.handDetector.isLoaded) {
      return;
    }

    // For offscreen detector, skip video readiness check since camera is handled offscreen
    if (!(this.handDetector instanceof OffscreenHandDetector)) {
      if (!this.video || this.video.readyState !== 4) {
        return;
      }
    }

    try {
      // Detect hands using the modular hand detector
      const predictions = await this.handDetector.detectHands(this.video);

      // Debug logging
      if (predictions.length > 0) {
        console.log(`Detected ${predictions.length} hands`);
      }

      this.drawHandKeypoints(predictions);
      this.trackIndexFinger(predictions);
    } catch (error) {
      console.error("Hand detection error:", error);
    }
  }

  trackIndexFinger(predictions: HandDetectionResult[]): void {
    if (predictions.length === 0) {
      this.fingerTracker?.hide();
      return;
    }

    if (!this.fingerTracker) {
      console.error("[FGTCamera] FingerTracker not initialized!");
      return;
    }

    // Get video dimensions
    let videoWidth, videoHeight;
    if (this.handDetector instanceof OffscreenHandDetector) {
      videoWidth = 640; // Default width used in offscreen
      videoHeight = 480; // Default height used in offscreen
    } else {
      videoWidth = this.video.videoWidth;
      videoHeight = this.video.videoHeight;
    }

    // Convert predictions to multi-hand format for FingerTracker3
    const multiHandLandmarks = predictions
      .map((pred) => pred.landmarks)
      .filter(Boolean);
    const multiHandedness = predictions.map((pred, index) => {
      // Use handedness from detection result
      const label = pred.handedness || "Right";
      const score = pred.score || 1.0;

      return {
        index,
        score,
        label,
      };
    });

    // Update with multi-hand landmarks
    this.fingerTracker?.updateWithMultiHandLandmarks(
      multiHandLandmarks,
      multiHandedness,
      videoWidth,
      videoHeight,
      this.settings.mirror
    );
  }

  videoToPageCoordinates(
    videoX: number,
    videoY: number
  ): { x: number; y: number } {
    // For offscreen detector, assume standard camera resolution (640x480)
    // since we don't have direct access to video element
    let videoWidth, videoHeight;

    if (this.handDetector instanceof OffscreenHandDetector) {
      videoWidth = 640; // Default width used in offscreen
      videoHeight = 480; // Default height used in offscreen
    } else {
      videoWidth = this.video.videoWidth;
      videoHeight = this.video.videoHeight;
    }

    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Convert video coordinates (0 to videoWidth/videoHeight) to normalized coordinates (0 to 1)
    let normalizedX = videoX / videoWidth;
    let normalizedY = videoY / videoHeight;

    // Handle mirroring - if video is mirrored, flip the X coordinate
    if (this.settings.mirror) {
      normalizedX = 1 - normalizedX;
    }

    // Map normalized coordinates to full viewport
    const pageX = normalizedX * viewportWidth;
    const pageY = normalizedY * viewportHeight;

    return { x: pageX, y: pageY };
  }

  async drawVideoToCanvas(predictions?: HandDetectionResult[]): Promise<void> {
    if (!this.ctx) {
      return;
    }

    // For offscreen detector, get video frame from offscreen document
    if (this.handDetector instanceof OffscreenHandDetector) {
      try {
        const response = await chrome.runtime.sendMessage({
          command: "get-video-frame",
          target: "offscreen",
        });

        if (response.success && response.data) {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              // Clear the canvas
              this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

              // Apply mirroring if enabled
              this.ctx.save();
              if (this.settings.mirror) {
                this.ctx.scale(-1, 1);
                this.ctx.translate(-this.canvas.width, 0);
              }

              // Draw the image frame to canvas
              this.ctx.drawImage(
                img,
                0,
                0,
                this.canvas.width,
                this.canvas.height
              );
              this.ctx.restore();

              // Draw hand keypoints on top of the video frame if provided
              if (predictions && predictions.length > 0) {
                this.drawHandKeypoints(predictions);
              }

              resolve();
            };
            img.src = response.data;
          });
        }
      } catch (error) {
        console.error("Failed to get video frame from offscreen:", error);
      }
      return;
    }

    // Original implementation for non-offscreen detectors
    if (!this.video || this.video.readyState !== 4) {
      return;
    }

    // Clear the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply mirroring if enabled
    this.ctx.save();
    if (this.settings.mirror) {
      this.ctx.scale(-1, 1);
      this.ctx.translate(-this.canvas.width, 0);
    }

    // Draw the video frame to canvas
    this.ctx.drawImage(
      this.video,
      0,
      0,
      this.video.videoWidth,
      this.video.videoHeight,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );

    this.ctx.restore();
  }

  drawHandKeypoints(predictions: HandDetectionResult[]): void {
    if (!this.ctx) {
      return;
    }

    // Calculate scale factors to map video coordinates to canvas coordinates
    let videoWidth, videoHeight;

    if (this.handDetector instanceof OffscreenHandDetector) {
      videoWidth = 640; // Default width used in offscreen
      videoHeight = 480; // Default height used in offscreen
    } else {
      videoWidth = this.video.videoWidth;
      videoHeight = this.video.videoHeight;
    }

    const scaleX = this.canvas.width / videoWidth;
    const scaleY = this.canvas.height / videoHeight;

    // Don't clear canvas - video is already drawn
    // Apply mirroring if enabled (matching the video mirroring)
    this.ctx.save();
    if (this.settings.mirror) {
      this.ctx.scale(-1, 1);
      this.ctx.translate(-this.canvas.width, 0);
    }

    predictions.forEach((prediction) => {
      // Draw keypoints
      if (prediction.landmarks) {
        this.ctx.fillStyle = "#ff0000";
        this.ctx.strokeStyle = "#00ff00";
        this.ctx.lineWidth = 2;

        // Scale landmarks to match canvas size
        // For offscreen detector, landmarks are normalized (0-1), so scale by canvas size
        // For other detectors, landmarks are in video pixels, so scale by scale factors
        const scaledLandmarks = prediction.landmarks.map(
          (landmark: HandLandmark) => {
            if (this.handDetector instanceof OffscreenHandDetector) {
              // Normalized coordinates (0-1) -> canvas coordinates
              return [
                landmark.x * this.canvas.width,
                landmark.y * this.canvas.height,
              ];
            } else {
              // Video pixel coordinates -> canvas coordinates
              return [landmark.x * scaleX, landmark.y * scaleY];
            }
          }
        );

        // Draw landmarks
        scaledLandmarks.forEach((landmark, index) => {
          const [x, y] = landmark;
          this.ctx.beginPath();
          this.ctx.arc(x, y, 4, 0, 2 * Math.PI);

          // Highlight index finger tip (landmark 8) differently
          if (index === 8) {
            this.ctx.fillStyle = "#ff00ff"; // Magenta for index finger tip
            this.ctx.fill();
            this.ctx.fillStyle = "#ff0000"; // Reset to red for other landmarks
          } else {
            this.ctx.fill();
          }
        });

        // Draw connections between keypoints
        this.drawHandConnections(scaledLandmarks);
      }
    });

    this.ctx.restore();
  }

  drawHandConnections(scaledLandmarks: number[][]): void {
    if (!this.ctx) return;

    // Define hand connections based on hand anatomy
    const connections = [
      // Thumb
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      // Index finger
      [0, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      // Middle finger
      [0, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      // Ring finger
      [0, 13],
      [13, 14],
      [14, 15],
      [15, 16],
      // Pinky
      [0, 17],
      [17, 18],
      [18, 19],
      [19, 20],
    ];

    this.ctx.strokeStyle = "#00ff00";
    this.ctx.lineWidth = 2;

    connections.forEach(([startIdx, endIdx]) => {
      if (scaledLandmarks[startIdx] && scaledLandmarks[endIdx]) {
        const [startX, startY] = scaledLandmarks[startIdx];
        const [endX, endY] = scaledLandmarks[endIdx];

        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
      }
    });
  }

  startVideoRenderingLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    const renderLoop = async () => {
      // For offscreen detector, combine video rendering and hand detection
      if (this.handDetector instanceof OffscreenHandDetector) {
        try {
          // Get hand detection results first
          const predictions = await this.handDetector.detectHands(this.video);

          // Render video with hand keypoints overlaid
          await this.drawVideoToCanvas(predictions);

          // Track finger for cursor
          this.trackIndexFinger(predictions);
        } catch (error) {
          console.error("Render loop error:", error);
        }
      } else {
        // Original implementation for non-offscreen detectors
        await this.drawVideoToCanvas();
        await this.detectHands();
      }

      this.animationId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }

  stopHandposeDetection(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Hide finger tracker
    this.fingerTracker?.hide();
  }

  setFlip(): void {
    // Mirroring is now handled in the canvas rendering
    // No need to transform the container since video is hidden
    // and canvas handles its own mirroring
  }

  setShape(): void {
    const shape = this.settings.shape || "oval";
    const video = this.video;
    const canvas = this.canvas;
    const container = this.container;
    const width = this.settings.width || 240;
    const height = (width * 3) / 4;
    const leftShift = -(width - height) / 2;

    video.style.width = `${width}px`;
    video.style.marginRight = "0";
    video.style.marginTop = "0";
    video.style.marginBottom = "0";
    container.style.overflow = "hidden";

    // Set canvas size to match video
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    switch (shape) {
      case "rectangle":
        video.style.marginLeft = "0px";
        canvas.style.marginLeft = "0px";
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "square":
        video.style.marginLeft = `${leftShift}px`;
        canvas.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "circle":
        video.style.marginLeft = `${leftShift}px`;
        canvas.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "50%";
        break;
      default:
        video.style.marginLeft = "0";
        canvas.style.marginLeft = "0";
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = `${height}px`;
        break;
    }
  }

  setPosition(): void {
    const settings = this.settings;
    const frame = this.frame;
    const paddingH = "10px";
    const paddingV = "20px";

    switch (settings.position) {
      case "leftTop":
        frame.style.left = paddingH;
        frame.style.bottom = "";
        frame.style.right = "";
        frame.style.top = paddingV;
        break;
      case "rightTop":
        frame.style.left = "";
        frame.style.bottom = "";
        frame.style.right = paddingH;
        frame.style.top = paddingV;
        break;
      case "rightBottom":
        frame.style.left = "";
        frame.style.bottom = paddingV;
        frame.style.right = paddingH;
        frame.style.top = "";
        break;
      default:
        frame.style.left = paddingH;
        frame.style.bottom = paddingV;
        frame.style.right = "";
        frame.style.top = "";
    }
  }

  updateSettings(newSettings: Settings): void {
    if (newSettings) {
      this.settings = newSettings;
    }

    this.setFlip();
    this.setShape();
    this.setPosition();
  }

  watchPunch(): void {
    if (!this.settings.trackPresentation) {
      return;
    }

    this.observer = new MutationObserver(() => {
      const fullscreenElement =
        document.fullscreenElement || (document as any).webkitFullscreenElement;
      this.switchFrameParent(fullscreenElement);
    });

    this.observer.observe(document.body, { childList: true });
  }

  switchFrameParent(newParent: Element | null): void {
    if (newParent && newParent !== this.fullscreenElementAttached) {
      this.video.pause();

      if (this.frame.parentElement) {
        this.frame.parentElement.removeChild(this.frame);
      }
      newParent.appendChild(this.frame);
      this.fullscreenElementAttached = newParent;

      this.video.play();
    }

    if (!newParent && this.fullscreenElementAttached) {
      this.video.pause();

      if (this.frame.parentElement) {
        this.frame.parentElement.removeChild(this.frame);
      }
      document.body.appendChild(this.frame);
      this.fullscreenElementAttached = null;

      this.video.play();
    }
  }

  stopWatchingPunch(): void {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.switchFrameParent(null);
  }

  handleError(e: any): void {
    if (e.name === "PermissionDeniedError") {
      alert("Sorry, only HTTPS:// sites can show web camera preview!");
    } else {
      console.log(e);
    }

    this.isWaitingStream = false;
  }

  handleVideo(stream: MediaStream): void {
    this.video.onloadedmetadata = () => {
      this.video.play();
      this.isRunning = true;
      this.isWaitingStream = false;

      // Create finger tracker when video stream starts
      if (!this.fingerTracker) {
        console.log("[FGTCamera] Creating FingerTracker3 instance");
        this.fingerTracker = new FingerTracker3({
          visual: {
            showDebug: true, // Force debug mode for troubleshooting
          },
        });
      }

      this.watchPunch();

      // Start video rendering loop once video is ready
      this.startVideoRenderingLoop();
    };

    this.videoStream = stream;
    this.video.srcObject = stream;
  }

  async startStream(): Promise<void> {
    if (this.isRunning || this.isWaitingStream) {
      return;
    }

    if (!this.handDetector) {
      await this.initializeHandDetector(this.handDetectorType);
    }

    // For offscreen detector, we don't need to request camera access here
    // Camera access is handled in the offscreen document
    if (this.handDetector instanceof OffscreenHandDetector) {
      this.isWaitingStream = true;

      // Simulate video loading for offscreen detector
      setTimeout(() => {
        this.isRunning = true;
        this.isWaitingStream = false;

        // Create finger tracker when video stream starts
        if (!this.fingerTracker) {
          console.log(
            "[FGTCamera] Creating FingerTracker3 instance (offscreen mode)"
          );
          this.fingerTracker = new FingerTracker3({
            visual: {
              showDebug: true, // Force debug mode for troubleshooting
            },
          });
        }

        this.watchPunch();

        // Start detection loop for offscreen detector
        this.startVideoRenderingLoop();
      }, 100);

      return;
    }

    this.isWaitingStream = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => this.handleVideo(stream))
          .catch((error) => this.handleError(error));
      } catch (e) {
        this.handleError(e);
      }
    } else {
      // Legacy fallback
      const getUserMedia =
        (navigator as any).getUserMedia ||
        (navigator as any).webkitGetUserMedia ||
        (navigator as any).mozGetUserMedia ||
        (navigator as any).msGetUserMedia ||
        (navigator as any).oGetUserMedia;

      if (getUserMedia) {
        try {
          getUserMedia.call(
            navigator,
            { video: true },
            (stream: MediaStream) => this.handleVideo(stream),
            (error: any) => this.handleError(error)
          );
        } catch (e) {
          this.handleError(e);
        }
      }
    }
  }

  stopStream(): void {
    if (!this.isRunning || this.isWaitingStream) {
      return;
    }

    this.video.pause();
    this.stopHandposeDetection();

    if (this.videoStream) {
      if (this.videoStream.getTracks) {
        const tracks = this.videoStream.getTracks();
        tracks.forEach((track) => track.stop());
      } else if ((this.videoStream as any).stop) {
        (this.videoStream as any).stop();
      }
    }
    this.videoStream = null;
    this.video.srcObject = null;
    this.isRunning = false;
    this.stopWatchingPunch();

    // Destroy finger tracker when camera stops
    if (this.fingerTracker) {
      this.fingerTracker.destroy();
      this.fingerTracker = null;
    }
  }

  destroy(): void {
    this.stopStream();

    // Clean up hand detector
    if (this.handDetector) {
      this.handDetector.dispose();
      this.handDetector = null;
    }
  }
}
