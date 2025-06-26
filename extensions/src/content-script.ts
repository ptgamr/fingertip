/// <reference types="chrome"/>

// FingerTip Content Script with Handpose Tracking
// Migrated and combined from chrome/src/{camera.js, start.js, terminate.js, rightMenu.js}

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as handpose from "@tensorflow-models/handpose";

interface Settings {
  shape: string;
  mirror: boolean;
  width: number;
  position: string;
  trackTabs: boolean;
  trackPresentation: boolean;
  showHandpose: boolean;
}

interface HandPose {
  annotations: {
    [key: string]: number[][];
  };
  landmarks: number[][];
}

class WPCamera {
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
  handposeModel: handpose.HandPose | null = null;
  handposeLoaded: boolean = false;
  animationId: number | null = null;

  constructor(element: HTMLElement, settings: Settings) {
    this.frame = element;
    this.settings = settings || {
      shape: "oval",
      mirror: true,
      width: 240,
      position: "leftBottom",
      trackTabs: true,
      trackPresentation: true,
      showHandpose: true,
    };

    this.video = document.createElement("video");
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.videoStream = null;
    this.isRunning = false;
    this.isWaitingStream = false;
    this.fullscreenElementAttached = null;

    this.container = document.createElement("div");
    this.container.style.position = "relative";

    // Hide the video element since we'll render it to canvas
    this.video.style.display = "none";

    // Add video and canvas to container
    this.container.appendChild(this.video);
    this.container.appendChild(this.canvas);

    // Canvas will show the video content + handpose overlay
    this.canvas.style.display = "block";

    element.appendChild(this.container);

    // Load handpose model
    this.loadHandposeModel();
  }

  async loadHandposeModel(): Promise<void> {
    try {
      console.log("Loading handpose model...");
      await tf.ready();
      this.handposeModel = await handpose.load();
      this.handposeLoaded = true;
      console.log("Handpose model loaded successfully");
    } catch (error) {
      console.error("Failed to load handpose model:", error);
    }
  }

  async detectHands(): Promise<void> {
    if (
      !this.handposeModel ||
      !this.handposeLoaded ||
      !this.video ||
      this.video.readyState !== 4
    ) {
      return;
    }

    try {
      // Detect hands and draw keypoints on top of video
      const predictions = await this.handposeModel.estimateHands(this.video);
      this.drawHandKeypoints(predictions as HandPose[]);
    } catch (error) {
      console.error("Hand detection error:", error);
    }
  }

  drawVideoToCanvas(): void {
    if (!this.ctx || !this.video || this.video.readyState !== 4) {
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

  drawHandKeypoints(predictions: HandPose[]): void {
    if (!this.ctx || !this.settings.showHandpose) {
      return;
    }

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

        // Draw landmarks
        prediction.landmarks.forEach((landmark) => {
          const [x, y] = landmark;
          this.ctx.beginPath();
          this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
          this.ctx.fill();
        });

        // Draw connections between keypoints
        this.drawHandConnections(prediction.landmarks);
      }
    });

    this.ctx.restore();
  }

  drawHandConnections(landmarks: number[][]): void {
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
      if (landmarks[startIdx] && landmarks[endIdx]) {
        const [startX, startY] = landmarks[startIdx];
        const [endX, endY] = landmarks[endIdx];

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
      // Always render video to canvas
      this.drawVideoToCanvas();

      // Only detect hands if handpose is enabled
      if (this.settings.showHandpose) {
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
    const oldShowHandpose = this.settings.showHandpose;

    if (newSettings) {
      this.settings = newSettings;
    }

    this.setFlip();
    this.setShape();
    this.setPosition();

    // Handle handpose detection toggle
    // Note: Video rendering loop is always running, handpose is toggled within the loop
    // No need to start/stop the loop when toggling handpose
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

      this.watchPunch();

      // Start video rendering loop once video is ready
      this.startVideoRenderingLoop();
    };

    this.videoStream = stream;
    this.video.srcObject = stream;
  }

  startStream(): void {
    if (this.isRunning || this.isWaitingStream) {
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
  }
}

class WPRightMenu {
  element: HTMLElement;
  menu: HTMLElement;
  isMenuVisible: boolean = false;
  onMenuClick: ((key: string, newValue: string) => void) | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    this.isMenuVisible = false;
    this.onMenuClick = null;
    this.menu = this.buildMenu();
    this.initialize();
  }

  positionMenu(e: MouseEvent): void {
    const menu = this.menu;
    const clickX = e.clientX;
    const clickY = e.clientY;
    menu.style.left = clickX + "px";
    menu.style.top = clickY + "px";

    const menuWidth = menu.offsetWidth + 4;
    const menuHeight = menu.offsetHeight + 4;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (windowWidth - clickX < menuWidth) {
      menu.style.left = windowWidth - menuWidth + "px";
    }

    if (windowHeight - clickY < menuHeight) {
      menu.style.top = windowHeight - menuHeight + "px";
    }
  }

  initialize(): void {
    const menu = this.menu;

    menu.addEventListener(
      "blur",
      () => {
        if (!this.isMenuVisible) {
          return;
        }

        this.isMenuVisible = false;
        if (menu.parentElement) {
          menu.parentElement.removeChild(menu);
        }
      },
      false
    );

    this.element.addEventListener(
      "contextmenu",
      (e: MouseEvent) => {
        e.preventDefault();

        if (this.isMenuVisible) {
          return;
        }

        this.element.appendChild(menu);
        this.positionMenu(e);

        this.isMenuVisible = true;
        menu.focus();
      },
      false
    );

    this.element.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (!this.isMenuVisible) {
          return;
        }

        const target = e.target as HTMLElement;
        if (
          target &&
          target.dataset &&
          target.dataset.value &&
          target.dataset.key
        ) {
          if (this.onMenuClick) {
            const data = target.dataset;
            this.onMenuClick(data.key!, data.value!);
          }
        }

        this.isMenuVisible = false;
        if (menu.parentElement) {
          menu.parentElement.removeChild(menu);
        }
      },
      false
    );
  }

  hide(): void {
    this.menu.blur();
  }

  buildMenu(): HTMLElement {
    const menuContainer = document.createElement("div");
    menuContainer.tabIndex = -1;
    menuContainer.className = "wp-right-menu";
    menuContainer.innerHTML =
      "<div>" +
      '  <div class="wp-menu-item" data-key="position" data-value="leftBottom">Left Bottom</div>' +
      '  <div class="wp-menu-item" data-key="position" data-value="rightBottom">Right Bottom</div>' +
      '  <div class="wp-menu-item" data-key="position" data-value="rightTop">Right Top</div>' +
      '  <div class="wp-menu-item-separator" data-key="position" data-value="leftTop">Left Top</div>' +
      '  <div class="wp-menu-item" data-key="shape" data-value="oval">Oval</div>' +
      '  <div class="wp-menu-item" data-key="shape" data-value="rectangle">Rectangle</div>' +
      '  <div class="wp-menu-item" data-key="shape" data-value="square">Square</div>' +
      '  <div class="wp-menu-item-separator" data-key="shape" data-value="circle">Circle</div>' +
      '  <div class="wp-menu-item" data-key="showHandpose" data-value="toggle">Toggle Handpose</div>' +
      "</div>";

    return menuContainer;
  }
}

// Global state
let wpFrame: (HTMLElement & { camera?: WPCamera; menu?: WPRightMenu }) | null =
  null;

function enchantHtml(): HTMLElement & {
  camera?: WPCamera;
  menu?: WPRightMenu;
} {
  let frame = document.getElementById("wp_frame") as HTMLElement & {
    camera?: WPCamera;
    menu?: WPRightMenu;
  };

  if (!frame) {
    frame = document.createElement("div") as HTMLElement & {
      camera?: WPCamera;
      menu?: WPRightMenu;
    };
    frame.id = "wp_frame";
    frame.className = "wp-main-frame";
    document.body.appendChild(frame);

    frame.menu = new WPRightMenu(frame);
  }

  return frame;
}

function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        shape: "oval",
        position: "leftBottom",
        mirror: true,
        trackTabs: true,
        trackPresentation: true,
        width: 240,
        showHandpose: true,
      },
      (items) => {
        resolve(items as Settings);
      }
    );
  });
}

async function startFingerTip(): Promise<void> {
  try {
    const settings = await getSettings();
    const frame = enchantHtml();
    wpFrame = frame;

    if (!frame.camera) {
      frame.camera = new WPCamera(frame, settings);
    }

    if (frame.menu) {
      frame.menu.hide();

      frame.menu.onMenuClick = (key: string, newValue: string) => {
        if (key === "showHandpose" && newValue === "toggle") {
          settings.showHandpose = !settings.showHandpose;
          frame.camera!.updateSettings(settings);

          try {
            chrome.storage.sync.set(settings);
          } catch (e) {
            console.log("sync set fail: ", e);
          }
        } else if (key !== "visibility") {
          (settings as any)[key] = newValue;
          frame.camera!.updateSettings(settings);

          try {
            chrome.storage.sync.set(settings);
          } catch (e) {
            console.log("sync set fail: ", e);
          }
        }
      };
    }

    frame.camera.updateSettings(settings);
    frame.camera.startStream();
  } catch (error) {
    console.error("Failed to start FingerTip:", error);
  }
}

function terminateFingerTip(): void {
  const frame = document.getElementById("wp_frame") as HTMLElement & {
    camera?: WPCamera;
  };

  if (frame && frame.camera) {
    frame.camera.stopStream();
  }

  wpFrame = null;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command === "start") {
    startFingerTip()
      .then(() => sendResponse({ status: "started" }))
      .catch((error) => {
        console.error("Failed to start:", error);
        sendResponse({ status: "error", error: error.message });
      });
    return true; // Keep the message channel open for async response
  } else if (request.command === "terminate") {
    try {
      terminateFingerTip();
      sendResponse({ status: "terminated" });
    } catch (error) {
      console.error("Failed to terminate:", error);
      sendResponse({ status: "error", error: (error as Error).message });
    }
  }
});

// Auto-cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (wpFrame && wpFrame.camera) {
    wpFrame.camera.stopStream();
  }
});
