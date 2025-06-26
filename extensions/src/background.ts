// Background service worker for FingerTip extension
// Migrated from chrome/src/background.js to Manifest V3

/// <reference types="chrome"/>

interface ExtensionState {
  activeTabId: number | null;
  isRunning: boolean;
  mode: string;
}

const MODE_ON = "on";
const MODE_TAB = "tab";

async function getState(): Promise<ExtensionState> {
  const result = await chrome.storage.session.get({
    activeTabId: null,
    isRunning: false,
    mode: MODE_ON,
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

async function startWp(tabId: number): Promise<void> {
  try {
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
