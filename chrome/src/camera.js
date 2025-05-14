"use strict";

function WPCamera(element) {
  this.initialize(element);
}

WPCamera.prototype.initialize = function (element, settings) {
  this.frame = element;
  this.settings = settings || {
    shape: "oval",
    mirror: true,
    width: 240,
    position: "leftBottom",
  };
  this.video = this.getDocument().createElement("video");
  this.videoStream = null;
  this.isRunning = false;
  this.isWaitingStream = false;
  this.fullscreenElementAttached = null;

  this.container = this.getDocument().createElement("div");

  this.container.appendChild(this.video);
  element.appendChild(this.container);
};

WPCamera.prototype.setFlip = function () {
  var containerStyle = this.container.style;
  var transform = this.settings.mirror ? "scaleX(-1)" : "";
  var flip = this.settings.mirror ? "FlipH" : "";

  containerStyle.webkitTransform = transform;
  containerStyle.mozTransform = transform;
  containerStyle.msTransform = transform;
  containerStyle.oTransform = transform;
  containerStyle.transform = transform;
  containerStyle.filter = flip;
  containerStyle.msFilter = flip;
};

WPCamera.prototype.setShape = function () {
  var shape = this.settings.shape || "oval";
  var video = this.video;
  var container = this.container;
  var width = this.settings.width || 240;
  var height = (width * 3) / 4;
  var leftShift = -(width - height) / 2;

  video.style.width = width + "px";
  video.style.marginRight = "0";
  video.style.marginTop = "0";
  video.style.marginBottom = "0";
  container.style.overflow = "hidden";

  switch (shape) {
    case "rectangle":
      video.style.marginLeft = "0px";
      container.style.width = width + "px";
      container.style.height = height + "px";
      container.style.borderRadius = "0";
      break;
    case "square":
      video.style.marginLeft = leftShift + "px";
      container.style.width = height + "px";
      container.style.height = height + "px";
      container.style.borderRadius = "0";
      break;
    case "circle":
      video.style.marginLeft = leftShift + "px";
      container.style.width = height + "px";
      container.style.height = height + "px";
      container.style.borderRadius = "50%";
      break;
    default:
      video.style.marginLeft = "0";
      container.style.width = width + "px";
      container.style.height = height + "px";
      container.style.borderRadius = height + "px";
      break;
  }
};

WPCamera.prototype.setPosition = function () {
  var settings = this.settings;
  var frame = this.frame;
  var paddingH = "10px";
  var paddingV = "20px";

  switch (settings.position) {
    case "leftTop":
      frame.style.left = paddingH;
      frame.style.bottom = "";
      frame.style.right = "";
      frame.style.top = paddingV;
      break;
    case "rightTop":
      frame.style.left = "";
      frame.style.bottom = "";
      frame.style.right = paddingH;
      frame.style.top = paddingV;
      break;
    case "rightBottom":
      frame.style.left = "";
      frame.style.bottom = paddingV;
      frame.style.right = paddingH;
      frame.style.top = "";
      break;
    default:
      frame.style.left = paddingH;
      frame.style.bottom = paddingV;
      frame.style.right = "";
      frame.style.top = "";
  }
};

WPCamera.prototype.getDocument = function () {
  return window.document;
};

WPCamera.prototype.updateSettings = function (newSettings) {
  if (newSettings) {
    this.settings = newSettings;
  }

  this.setFlip();
  this.setShape();
  this.setPosition();
};

WPCamera.prototype.watchPunch = function () {
  var _this = this;

  if (!_this.settings.trackPresentation) {
    return;
  }

  _this.observer = new MutationObserver(function () {
    var fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement;
    _this.switchFrameParent(fullscreenElement);
  });

  _this.observer.observe(document.body, { childList: true });
};

WPCamera.prototype.switchFrameParent = function (newParent) {
  if (newParent && newParent != this.fullscreenElementAttached) {
    this.video.pause();

    this.frame.parentElement.removeChild(this.frame);
    newParent.appendChild(this.frame);
    this.fullscreenElementAttached = newParent;

    this.video.play();
  }

  if (!newParent && this.fullscreenElementAttached) {
    this.video.pause();

    this.frame.parentElement.removeChild(this.frame);
    document.body.appendChild(this.frame);
    this.fullscreenElementAttached = null;

    this.video.play();
  }
};

WPCamera.prototype.stopWatchingPunch = function () {
  if (this.observer) {
    this.observer.disconnect();
  }

  this.switchFrameParent(null);
};

WPCamera.prototype.handleError = function (e) {
  if (e.name === "PermissionDeniedError") {
    alert("Sorry, only HTTPS:// sites can show web camera preview!");
  } else {
    console.log(e);
  }

  this.isWaitingStream = false;
};

WPCamera.prototype.handleVideo = function (stream) {
  var _this = this;

  this.video.onloadedmetadata = function () {
    _this.video.play();
    _this.isRunning = true;
    _this.isWaitingStream = false;

    _this.watchPunch();
  };

  this.videoStream = stream;
  this.video.srcObject = stream;
};

WPCamera.prototype.startStream = function () {
  if (this.isRunning || this.isWaitingStream) {
    return;
  }

  var _this = this;
  this.isWaitingStream = true;

  navigator.getUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia ||
    navigator.oGetUserMedia;

  if (navigator.getUserMedia) {
    try {
      navigator.getUserMedia(
        { video: true },
        function (s) {
          _this.handleVideo(s);
        },
        function (e) {
          _this.handleError(e);
        }
      );
    } catch (e) {
      this.handleError(e);
    }
  }
};

WPCamera.prototype.stopStream = function () {
  if (!this.isRunning || this.isWaitingStream) {
    return;
  }

  this.video.pause();

  if (this.videoStream) {
    if (this.videoStream.getTracks) {
      var track = this.videoStream.getTracks()[0];
      track.stop();
    } else if (this.videoStream.stop) {
      this.videoStream.stop();
    }
  }
  this.videoStream = null;
  this.video.srcObject = null;
  this.isRunning = false;
  this.stopWatchingPunch();
};
