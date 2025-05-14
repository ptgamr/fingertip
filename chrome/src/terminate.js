(function terminate() {
  var frame = document.getElementById("wp_frame");

  if (frame) {
    // Stop hand tracking if active
    if (frame.handTracking) {
      frame.handTracking.stopTracking();
    }

    // Stop camera stream
    if (frame.camera) {
      frame.camera.stopStream();
    }
  }
})();
