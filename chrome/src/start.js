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
      handTracking: true,
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

          if (key === "handTracking") {
            if (newValue && frame.handTracking) {
              frame.handTracking.startTracking();
            } else if (frame.handTracking) {
              frame.handTracking.stopTracking();
            }
          }

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

    frame.camera.video.addEventListener(
      "playing",
      function () {
        if (!frame.handTracking) {
          console.log(
            "Camera started playing, preparing to initialize hand tracking..."
          );

          const loadTensorFlow = () => {
            return new Promise((resolve) => {
              if (typeof tf !== "undefined") {
                console.log("TensorFlow.js is already loaded");
                resolve(true);
                return;
              }

              console.log("Loading TensorFlow.js from start.js");
              const script = document.createElement("script");
              script.src =
                "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js";
              script.onload = () => {
                console.log("TensorFlow.js loaded successfully from start.js");
                resolve(true);
              };
              script.onerror = () => {
                console.error("Failed to load TensorFlow.js from start.js");
                resolve(false);
              };
              document.head.appendChild(script);
            });
          };

          setTimeout(async () => {
            try {
              await loadTensorFlow();

              console.log("Initializing hand tracking...");
              frame.handTracking = new WPHandTracking(frame.camera.video);

              if (settings.handTracking) {
                console.log("Starting hand tracking...");
                frame.handTracking.startTracking();
              }
            } catch (e) {
              console.error("Hand tracking initialization failed:", e);
            }
          }, 2000);
        }
      },
      { once: true }
    );
  });
})();
