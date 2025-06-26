/// <reference types="chrome"/>

// FingerTip Content Script
// Migrated and combined from chrome/src/{camera.js, start.js, terminate.js, rightMenu.js}

interface Settings {
  shape: string;
  mirror: boolean;
  width: number;
  position: string;
  trackTabs: boolean;
  trackPresentation: boolean;
}

class WPCamera {
  frame: HTMLElement;
  settings: Settings;
  video: HTMLVideoElement;
  videoStream: MediaStream | null = null;
  isRunning: boolean = false;
  isWaitingStream: boolean = false;
  fullscreenElementAttached: Element | null = null;
  container: HTMLDivElement;
  observer?: MutationObserver;

  constructor(element: HTMLElement, settings: Settings) {
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
    this.videoStream = null;
    this.isRunning = false;
    this.isWaitingStream = false;
    this.fullscreenElementAttached = null;

    this.container = document.createElement("div");
    this.container.appendChild(this.video);
    element.appendChild(this.container);
  }

  setFlip(): void {
    const containerStyle = this.container.style;
    const transform = this.settings.mirror ? "scaleX(-1)" : "";
    const flip = this.settings.mirror ? "FlipH" : "";

    containerStyle.webkitTransform = transform;
    containerStyle.transform = transform;
    containerStyle.filter = flip;
  }

  setShape(): void {
    const shape = this.settings.shape || "oval";
    const video = this.video;
    const container = this.container;
    const width = this.settings.width || 240;
    const height = (width * 3) / 4;
    const leftShift = -(width - height) / 2;

    video.style.width = `${width}px`;
    video.style.marginRight = "0";
    video.style.marginTop = "0";
    video.style.marginBottom = "0";
    container.style.overflow = "hidden";

    switch (shape) {
      case "rectangle":
        video.style.marginLeft = "0px";
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "square":
        video.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "circle":
        video.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "50%";
        break;
      default:
        video.style.marginLeft = "0";
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

      this.watchPunch();
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
      '  <div class="wp-menu-item" data-key="shape" data-value="circle">Circle</div>' +
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
        if (key !== "visibility") {
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
