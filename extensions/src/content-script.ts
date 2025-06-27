/// <reference types="chrome"/>

// FingerTip Content Script with Handpose Tracking
// Migrated and combined from chrome/src/{camera.js, start.js, terminate.js, rightMenu.js}

import { WPCamera, Settings } from "./wp-camera";

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
      frame.camera = new WPCamera(frame, settings, "offscreen");
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
    frame.camera.destroy();
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
    wpFrame.camera.destroy();
  }
});
