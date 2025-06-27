// offscreen.ts
const video = document.querySelector("#webcam") as HTMLVideoElement;

navigator.mediaDevices
  .getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  })
  .then((stream) => {
    video.srcObject = stream;
    video.play();
    // Start sending frames to background
    sendFrameToBackground();
  })
  .catch((err) => {
    console.error("Error accessing webcam:", err);
  });

function sendFrameToBackground() {
  if (!video.srcObject) {
    return;
  }
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const processFrame = () => {
    if (video.readyState >= 2) {
      // Ensure video is ready
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = canvas
        .getContext("2d")
        ?.getImageData(0, 0, canvas.width, canvas.height);
      if (imageData) {
        chrome.runtime.sendMessage({
          command: "process-video",
          frame: imageData,
        });
      }
    }
    requestAnimationFrame(processFrame);
  };

  processFrame();
}
