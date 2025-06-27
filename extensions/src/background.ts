// Background service worker for FingerTip extension
// Migrated from chrome/src/background.js to Manifest V3

/// <reference types="chrome"/>

interface ExtensionState {
  activeTabId: number | null;
  isRunning: boolean;
  mode: string;
  offscreenDocumentId: string | null;
}

const MODE_ON = "on";
const MODE_TAB = "tab";

// Offscreen document management
let offscreenDocument: {
  url: string;
  reasons: chrome.offscreen.Reason[];
  justification: string;
} = {
  url: "offscreen.html",
  reasons: [chrome.offscreen.Reason.USER_MEDIA],
  justification: "Camera access for hand tracking",
};

async function getState(): Promise<ExtensionState> {
  const result = await chrome.storage.session.get({
    activeTabId: null,
    isRunning: false,
    mode: MODE_ON,
    offscreenDocumentId: null,
  });
  return result as ExtensionState;
}

async function setState(state: Partial<ExtensionState>): Promise<void> {
  await chrome.storage.session.set(state);
}

async function updateMode(newMode?: string): Promise<void> {
  const state = await getState();
  const mode = newMode || state.mode;

  await setState({ mode });

  if (state.isRunning) {
    await chrome.action.setBadgeText({ text: mode });
    await chrome.action.setBadgeBackgroundColor({ color: "#FF5757" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

async function createOffscreenDocument(): Promise<void> {
  const state = await getState();

  if (state.offscreenDocumentId) {
    return; // Already created
  }

  try {
    await chrome.offscreen.createDocument(offscreenDocument);
    await setState({ offscreenDocumentId: "offscreen" });
    console.log("Offscreen document created for camera access");
  } catch (error) {
    console.error("Failed to create offscreen document:", error);
    throw error;
  }
}

async function closeOffscreenDocument(): Promise<void> {
  const state = await getState();

  if (!state.offscreenDocumentId) {
    return; // Already closed
  }

  try {
    await chrome.offscreen.closeDocument();
    await setState({ offscreenDocumentId: null });
    console.log("Offscreen document closed");
  } catch (error) {
    console.error("Failed to close offscreen document:", error);
  }
}

async function startWp(tabId: number): Promise<void> {
  try {
    // Create offscreen document for camera access
    await createOffscreenDocument();

    // Send message to content script to start the webcam preview
    await chrome.tabs.sendMessage(tabId, { command: "start" });

    await setState({
      isRunning: true,
      activeTabId: tabId,
    });

    await updateMode();
  } catch (error) {
    console.error("Failed to start webcam preview:", error);
  }
}

async function terminateWP(tabId: number): Promise<void> {
  try {
    // Send message to content script to terminate the webcam preview
    await chrome.tabs.sendMessage(tabId, { command: "terminate" });

    // Close offscreen document
    await closeOffscreenDocument();

    await setState({
      isRunning: false,
      activeTabId: null,
    });

    await updateMode();
  } catch (error) {
    console.error("Failed to terminate webcam preview:", error);
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
  if (!tab.id) return;

  const url = tab.url || "";
  const isSecure = url.match(/^https:\/\//i);
  const state = await getState();

  if (state.isRunning) {
    if (state.activeTabId) {
      await terminateWP(state.activeTabId);
    }
  } else {
    if (isSecure) {
      await startWp(tab.id);
    } else {
      // In Manifest V3, we can't use alert() in service workers
      // Instead, we could send a message to the content script to show an error
      // or use chrome.notifications API
      console.log("Sorry, only HTTPS:// sites can show web camera preview!");

      // Optionally show a notification
      chrome.notifications.create({
        type: "basic",
        iconUrl: "res/128.png",
        title: "FingerTip",
        message: "Sorry, only HTTPS:// sites can show web camera preview!",
      });
    }
  }
});

async function updateTab(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url || "";
    const isSecure = url.match(/^https:\/\//i);
    const state = await getState();

    if (state.isRunning && state.activeTabId && isSecure) {
      await terminateWP(state.activeTabId);
      await startWp(tabId);
    }
  } catch (error) {
    console.error("Failed to update tab:", error);
  }
}

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo && changeInfo.status === "complete") {
    await updateTab(tabId);
  }
});

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;

  try {
    const settings = await chrome.storage.sync.get({
      trackTabs: true,
    });

    const mode = settings.trackTabs ? MODE_ON : MODE_TAB;
    await updateMode(mode);

    if (settings.trackTabs) {
      await updateTab(tabId);
    }
  } catch (error) {
    console.error("Failed to handle tab activation:", error);
  }
});

// Initialize badge on startup
chrome.runtime.onStartup.addListener(async () => {
  await updateMode();
});

chrome.runtime.onInstalled.addListener(async () => {
  await updateMode();
});

// Handle messages from content script to offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages from content scripts that should be forwarded to offscreen
  if (
    sender.tab &&
    (message.command === "start-camera" ||
      message.command === "stop-camera" ||
      message.command === "get-hand-detection")
  ) {
    // Forward message to offscreen document
    chrome.runtime
      .sendMessage(message)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error("Failed to forward message to offscreen:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Will respond asynchronously
  }
});
