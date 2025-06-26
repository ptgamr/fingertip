/// <reference types="chrome"/>

// FingerTip Options Page Script
// Migrated from chrome/src/options.js

interface OptionSettings {
  shape: string;
  position: string;
  mirror: boolean;
  trackTabs: boolean;
  trackPresentation: boolean;
}

function saveOptions(): void {
  const shape = (document.getElementById("shape") as HTMLSelectElement).value;
  const position = (document.getElementById("position") as HTMLSelectElement)
    .value;
  const mirror = (document.getElementById("mirror") as HTMLInputElement)
    .checked;
  const trackTabs = (document.getElementById("trackTabs") as HTMLInputElement)
    .checked;
  const trackPresentation = (
    document.getElementById("trackPresentation") as HTMLInputElement
  ).checked;

  const settings: OptionSettings = {
    shape,
    position,
    mirror,
    trackTabs,
    trackPresentation,
  };

  chrome.storage.sync.set(settings, () => {
    // Update status to let user know options were saved.
    const status = document.getElementById("status")!;
    status.textContent = "Options saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 750);
  });
}

function restoreOptions(): void {
  // Use default values
  chrome.storage.sync.get(
    {
      shape: "oval",
      position: "leftBottom",
      mirror: true,
      trackTabs: true,
      trackPresentation: true,
    },
    (items: OptionSettings) => {
      (document.getElementById("shape") as HTMLSelectElement).value =
        items.shape;
      (document.getElementById("position") as HTMLSelectElement).value =
        items.position;
      (document.getElementById("mirror") as HTMLInputElement).checked =
        items.mirror;
      (document.getElementById("trackTabs") as HTMLInputElement).checked =
        items.trackTabs;
      (
        document.getElementById("trackPresentation") as HTMLInputElement
      ).checked = items.trackPresentation;
    }
  );
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save")!.addEventListener("click", saveOptions);
