/// <reference types="chrome"/>

export interface Settings {
  shape: string;
  mirror: boolean;
  width: number;
  position: string;
  trackTabs: boolean;
  trackPresentation: boolean;
}

export class WPCamera {
  frame: HTMLElement;
  settings: Settings;
  container: HTMLDivElement;

  constructor(element: HTMLElement, settings: Settings) {
    this.frame = element;
    this.settings = settings;
    this.container = document.createElement("div");
    element.appendChild(this.container);
  }

  updateSettings(newSettings: Settings): void {
    this.settings = newSettings;
  }

  startStream(): void {
    // No-op, camera is handled by background script's offscreen document
  }

  destroy(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
