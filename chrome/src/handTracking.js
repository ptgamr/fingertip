"use strict";

class WPHandTracking {
  constructor(videoElement) {
    this.video = videoElement;
    this.model = null;
    this.isTracking = false;
    this.lastPointerPosition = { x: 0, y: 0 };
    this.pointerElement = null;
    this.detector = null;
    this.loadAttempts = 0;
  }

  async loadModels() {
    if (!this.model) {
      try {
        // Check if TensorFlow.js is available
        if (typeof tf === "undefined") {
          // Try loading TensorFlow.js if not available
          if (this.loadAttempts < 3) {
            this.loadAttempts++;
            console.log(
              `Attempting to load TensorFlow.js (attempt ${this.loadAttempts})`
            );

            await new Promise((resolve) => {
              const script = document.createElement("script");
              script.src =
                "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js";
              script.onload = () => {
                console.log("TensorFlow.js loaded in handTracking.js");
                resolve();
              };
              script.onerror = () => {
                console.error(
                  "Failed to load TensorFlow.js in handTracking.js"
                );
                resolve();
              };
              document.head.appendChild(script);
            });

            // If still not defined, wait a bit and retry
            if (typeof tf === "undefined") {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              return this.loadModels();
            }
          } else {
            throw new Error(
              "Failed to load TensorFlow.js after multiple attempts"
            );
          }
        }

        // Now load the hand-pose detection model
        await tf.ready();

        // Load hand pose detection model
        if (typeof handPoseDetection === "undefined") {
          await new Promise((resolve) => {
            const script = document.createElement("script");
            script.src =
              "https://cdn.jsdelivr.net/npm/@tensorflow-models/hand-pose-detection@2.0.0/dist/hand-pose-detection.js";
            script.onload = () => {
              console.log("Hand pose detection model loaded");
              resolve();
            };
            script.onerror = () => {
              console.error("Failed to load hand pose detection model");
              resolve();
            };
            document.head.appendChild(script);
          });

          // Wait a moment for the script to initialize
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // MediaPipe hands solution
        if (typeof window.handPoseDetection === "undefined") {
          console.error("HandPoseDetection library not available");
          return false;
        }

        // Create hand detector using MediaPipe Hands model
        this.detector = await window.handPoseDetection.createDetector(
          window.handPoseDetection.SupportedModels.MediaPipeHands,
          {
            runtime: "mediapipe",
            modelType: "lite",
            maxHands: 1,
            solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands",
          }
        );

        console.log("Hand tracking models loaded successfully");
        return true;
      } catch (error) {
        console.error("Error loading models:", error);
        return false;
      }
    }
    return true;
  }

  createPointer() {
    if (!this.pointerElement) {
      this.pointerElement = document.createElement("div");
      this.pointerElement.className = "wp-finger-pointer";
      this.pointerElement.style.position = "absolute";
      this.pointerElement.style.width = "20px";
      this.pointerElement.style.height = "20px";
      this.pointerElement.style.borderRadius = "50%";
      this.pointerElement.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
      this.pointerElement.style.zIndex = "99999";
      this.pointerElement.style.pointerEvents = "none"; // Don't interfere with actual clicking
      this.pointerElement.style.display = "none";
      document.body.appendChild(this.pointerElement);
    }
    return this.pointerElement;
  }

  async startTracking() {
    if (this.isTracking) return;

    try {
      this.createPointer();
      const modelsLoaded = await this.loadModels();

      if (!modelsLoaded) {
        console.error("Failed to load hand tracking models");
        return;
      }

      this.isTracking = true;
      this.track();
      console.log("Hand tracking started successfully");
    } catch (error) {
      console.error("Error starting hand tracking:", error);
    }
  }

  stopTracking() {
    this.isTracking = false;
    if (this.pointerElement) {
      this.pointerElement.style.display = "none";
    }
  }

  simulateClick(x, y) {
    const clickEvent = new MouseEvent("click", {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });

    // Find element at this position
    const element = document.elementFromPoint(x, y);
    if (element) {
      element.dispatchEvent(clickEvent);
    }
  }

  async track() {
    if (!this.isTracking) return;

    try {
      // Detect hands in the video feed
      const hands = await this.detector.estimateHands(this.video);

      if (hands && hands.length > 0) {
        const hand = hands[0];

        // Get the index finger tip position (keypoint 8)
        const indexFinger = hand.keypoints[8];

        if (indexFinger) {
          // Convert the coordinates from video space to page space
          const videoRect = this.video.getBoundingClientRect();
          const mirror = true; // Assume mirrored view as default in this extension

          let pageX = mirror
            ? videoRect.left +
              (videoRect.width -
                indexFinger.x * (videoRect.width / this.video.videoWidth))
            : videoRect.left +
              indexFinger.x * (videoRect.width / this.video.videoWidth);

          const pageY =
            videoRect.top +
            indexFinger.y * (videoRect.height / this.video.videoHeight);

          // Position the pointer element
          this.pointerElement.style.display = "block";
          this.pointerElement.style.left = `${pageX}px`;
          this.pointerElement.style.top = `${pageY}px`;

          // Get the middle finger tip position (keypoint 12) for click gesture detection
          const middleFinger = hand.keypoints[12];

          // Simple click gesture: middle finger tip close to index finger tip
          if (middleFinger) {
            const distance = Math.sqrt(
              Math.pow(indexFinger.x - middleFinger.x, 2) +
                Math.pow(indexFinger.y - middleFinger.y, 2)
            );

            // Click when fingers are close together
            if (distance < 20) {
              this.simulateClick(pageX, pageY);
              // Change pointer color briefly to indicate click
              this.pointerElement.style.backgroundColor =
                "rgba(0, 255, 0, 0.7)";
              setTimeout(() => {
                this.pointerElement.style.backgroundColor =
                  "rgba(255, 0, 0, 0.7)";
              }, 300);
            }
          }
        }
      } else {
        // Hide pointer when no hands detected
        this.pointerElement.style.display = "none";
      }
    } catch (error) {
      console.error("Error in hand tracking:", error);
    }

    // Continue tracking as long as isTracking is true
    if (this.isTracking) {
      requestAnimationFrame(() => this.track());
    }
  }
}
