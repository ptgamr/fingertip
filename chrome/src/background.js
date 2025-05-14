var activeTabId = null;
var isRunning = false;
var MODE_ON = chrome.i18n.getMessage("modeOn") || "on";
var MODE_TAB = chrome.i18n.getMessage("modeTab") || "tab";
var mode = MODE_ON;

function updateMode(newMode) {
  if (newMode) {
    mode = newMode;
  }

  if (isRunning) {
    chrome.browserAction.setBadgeText({ text: mode });
    chrome.browserAction.setBadgeBackgroundColor({ color: "#FF5757" });
  } else {
    chrome.browserAction.setBadgeText({ text: "" });
  }
}

function startWp(tabId) {
  chrome.tabs.insertCSS(tabId, { file: "res/wp-style.css" });
  chrome.tabs.insertCSS(tabId, { file: "res/hand-pointer.css" });

  // Load TensorFlow.js as an externally injected script
  chrome.tabs.executeScript(tabId, {
    code: `
    if (!window.tfLoaded) {
      window.tfLoaded = true;
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js';
        script.onload = () => {
          console.log('TensorFlow.js loaded successfully');
          resolve(true);
        };
        script.onerror = (err) => {
          console.error('Failed to load TensorFlow.js', err);
          resolve(false);
        };
        document.head.appendChild(script);
      });
    }
    `,
  });

  chrome.tabs.executeScript(tabId, { file: "src/camera.js" });
  chrome.tabs.executeScript(tabId, { file: "src/rightMenu.js" });
  chrome.tabs.executeScript(tabId, { file: "src/handTracking.js" });
  chrome.tabs.executeScript(tabId, { file: "src/start.js" });

  isRunning = true;
  updateMode();
}

function terminateWP(tabId) {
  chrome.tabs.executeScript(tabId, { file: "src/terminate.js" });

  isRunning = false;
  updateMode();
}

chrome.browserAction.onClicked.addListener(function (tab) {
  var url = tab.url;
  var isSecure = url.match(/^https:\/\//i);

  if (isRunning) {
    if (activeTabId) {
      terminateWP(activeTabId);
    }
  } else {
    if (isSecure) {
      activeTabId = tab.id;
      startWp(activeTabId);
    } else {
      alert("Sorry, only HTTPS:// sites can show web camera preview!");
    }
  }
});

function updateTab(tabId) {
  chrome.tabs.get(tabId, function (tab) {
    var url = tab.url;
    var isSecure = url.match(/^https:\/\//i);

    if (isRunning && activeTabId && isSecure) {
      terminateWP(activeTabId);

      activeTabId = tabId;

      startWp(activeTabId);
    }
  });
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo && changeInfo.status === "complete") {
    updateTab(tabId);
  }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  var tabId = activeInfo.tabId;

  chrome.storage.sync.get(
    {
      trackTabs: true,
    },
    function (settings) {
      updateMode(settings.trackTabs ? MODE_ON : MODE_TAB);
      if (settings.trackTabs) {
        updateTab(tabId);
      }
    }
  );
});
