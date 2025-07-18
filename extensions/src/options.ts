/// <reference types="chrome"/>

// FingerTip Options Page Script
// Migrated from chrome/src/options.js

interface OptionSettings {
  shape: string;
  position: string;
  mirror: boolean;
  trackTabs: boolean;
  trackPresentation: boolean;
  trackingMode: "hand" | "face";
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
  const trackingMode = (
    document.querySelector(
      'input[name="trackingMode"]:checked'
    ) as HTMLInputElement
  ).value as "hand" | "face";

  const settings: OptionSettings = {
    shape,
    position,
    mirror,
    trackTabs,
    trackPresentation,
    trackingMode,
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
      trackingMode: "hand" as "hand" | "face",
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

      console.log(items);

      // Set tracking mode radio buttons
      const handRadio = document.getElementById(
        "trackingModeHand"
      ) as HTMLInputElement;
      const faceRadio = document.getElementById(
        "trackingModeFace"
      ) as HTMLInputElement;
      if (items.trackingMode === "hand") {
        handRadio.checked = true;
      } else {
        faceRadio.checked = true;
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.getElementById("save")!.addEventListener("click", saveOptions);
