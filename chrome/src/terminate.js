(function terminate() {
  var frame = document.getElementById("wp_frame");

  if (frame && frame.camera) {
    frame.camera.stopStream();
  }
})();
