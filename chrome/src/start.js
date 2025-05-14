function enchantHtml() {
  var frame = document.getElementById("wp_frame");

  if (!frame) {
    frame = document.createElement("div");
    frame.id = "wp_frame";
    frame.className = "wp-main-frame";
    document.body.appendChild(frame);

    frame.menu = new WPRightMenu(frame);
  }

  return frame;
}

function getSettings(callback) {
  chrome.storage.sync.get(
    {
      shape: "oval",
      position: "leftBottom",
      mirror: true,
      trackTabs: true,
      trackPresentation: true,
    },
    function (items) {
      callback(items);
    }
  );
}

(function start() {
  getSettings(function (settings) {
    var frame = enchantHtml();

    if (!frame.camera) {
      frame.camera = new WPCamera(frame, settings);
    }

    if (frame.menu) {
      frame.menu.hide();

      frame.menu.onMenuClick = function (key, newValue) {
        if (key !== "visibility") {
          settings[key] = newValue;
          frame.camera.updateSettings(settings);

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
  });
})();
