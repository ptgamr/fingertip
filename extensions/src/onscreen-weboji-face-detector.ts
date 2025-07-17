import { FaceDetectionResult, FaceDetector } from "./face-detector-interface";

// Declare Jeeliz global
declare global {
  interface Window {
    JEELIZFACEEXPRESSIONS: any;
  }
}

export class OnscreenWebojiFaceDetector implements FaceDetector {
  isLoaded: boolean = true;
  jeelizInstance: any;

  constructor(private canvas: HTMLCanvasElement) {}

  async initialize(): Promise<void> {}

  async startTracking(cb?: (detectState: any) => void): Promise<boolean> {
    // Get the extension URL for local files
    const extensionUrl = chrome.runtime.getURL("");

    return new Promise((resolve, reject) => {
      // Initialize Jeeliz with configuration
      const jeelizConfig = {
        canvas: this.canvas,
        NNCPath: `${extensionUrl}/models`, // Path to neural network models
        videoSettings: {
          width: 640,
          height: 480,
        },
        callbackReady: (errCode: number, spec: any) => {
          if (errCode) {
            console.error("Jeeliz initialization failed:", errCode);
            reject(errCode);
            return;
          }
          console.log("Jeeliz face tracking initialized successfully");
          this.isLoaded = true;
          // this.startDetectionLoop();
          resolve(true);
        },
        callbackTrack: (detectState: any) => {
          if (cb) cb(detectState);
          // this.processFaceData(detectState);
        },
      };

      // Initialize Jeeliz
      this.jeelizInstance = window.JEELIZFACEEXPRESSIONS.init(jeelizConfig);
    });
  }

  stopTracking(): void {
    // TODO
  }

  async detectFace(
    video: HTMLVideoElement
  ): Promise<FaceDetectionResult | null> {
    // TODO
    return null;
  }

  dispose(): void {
    if (this.jeelizInstance && this.jeelizInstance.destroy) {
      this.jeelizInstance.destroy();
      this.jeelizInstance = null;
    }
  }
}
