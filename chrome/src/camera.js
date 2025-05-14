"use strict";

class WPCamera {
  constructor(element, settings) {
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
  }

  setFlip() {
    const containerStyle = this.container.style;
    const transform = this.settings.mirror ? "scaleX(-1)" : "";
    const flip = this.settings.mirror ? "FlipH" : "";

    containerStyle.webkitTransform = transform;
    containerStyle.mozTransform = transform;
    containerStyle.msTransform = transform;
    containerStyle.oTransform = transform;
    containerStyle.transform = transform;
    containerStyle.filter = flip;
    containerStyle.msFilter = flip;
  }

  setShape() {
    const shape = this.settings.shape || "oval";
    const video = this.video;
    const container = this.container;
    const width = this.settings.width || 240;
    const height = (width * 3) / 4;
    const leftShift = -(width - height) / 2;

    video.style.width = `${width}px`;
    video.style.marginRight = "0";
    video.style.marginTop = "0";
    video.style.marginBottom = "0";
    container.style.overflow = "hidden";

    switch (shape) {
      case "rectangle":
        video.style.marginLeft = "0px";
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "square":
        video.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "0";
        break;
      case "circle":
        video.style.marginLeft = `${leftShift}px`;
        container.style.width = `${height}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = "50%";
        break;
      default:
        video.style.marginLeft = "0";
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        container.style.borderRadius = `${height}px`;
        break;
    }
  }

  setPosition() {
    const settings = this.settings;
    const frame = this.frame;
    const paddingH = "10px";
    const paddingV = "20px";

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
  }

  getDocument() {
    return window.document;
  }

  updateSettings(newSettings) {
    if (newSettings) {
      this.settings = newSettings;
    }

    this.setFlip();
    this.setShape();
    this.setPosition();
  }

  watchPunch() {
    if (!this.settings.trackPresentation) {
      return;
    }

    this.observer = new MutationObserver(() => {
      const fullscreenElement =
        document.fullscreenElement || document.webkitFullscreenElement;
      this.switchFrameParent(fullscreenElement);
    });

    this.observer.observe(document.body, { childList: true });
  }

  switchFrameParent(newParent) {
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
  }

  stopWatchingPunch() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.switchFrameParent(null);
  }

  handleError(e) {
    if (e.name === "PermissionDeniedError") {
      alert("Sorry, only HTTPS:// sites can show web camera preview!");
    } else {
      console.log(e);
    }

    this.isWaitingStream = false;
  }

  handleVideo(stream) {
    this.video.onloadedmetadata = () => {
      this.video.play();
      this.isRunning = true;
      this.isWaitingStream = false;

      this.watchPunch();
    };

    this.videoStream = stream;
    this.video.srcObject = stream;
  }

  startStream() {
    if (this.isRunning || this.isWaitingStream) {
      return;
    }

    this.isWaitingStream = true;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => this.handleVideo(stream))
          .catch((error) => this.handleError(error));
      } catch (e) {
        this.handleError(e);
      }
    } else {
      // Legacy fallback
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
            (stream) => this.handleVideo(stream),
            (error) => this.handleError(error)
          );
        } catch (e) {
          this.handleError(e);
        }
      }
    }
  }

  stopStream() {
    if (!this.isRunning || this.isWaitingStream) {
      return;
    }

    this.video.pause();

    if (this.videoStream) {
      if (this.videoStream.getTracks) {
        const tracks = this.videoStream.getTracks();
        tracks.forEach((track) => track.stop());
      } else if (this.videoStream.stop) {
        this.videoStream.stop();
      }
    }
    this.videoStream = null;
    this.video.srcObject = null;
    this.isRunning = false;
    this.stopWatchingPunch();
  }
}
