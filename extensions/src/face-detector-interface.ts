export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface FaceDetectionResult {
  translation: [number, number, number]; // x, y, z position
  rotation: [number, number, number]; // pitch, yaw, roll in radians
  morphTargets?: number[]; // Face expression morph targets
  isDetected: boolean;
  score?: number; // Confidence score
}

export interface FaceDetector {
  isLoaded: boolean;

  /**
   * Initialize the face detection model
   */
  initialize(): Promise<void>;

  /**
   * Detect face in a video element
   * @param video - The video element to analyze
   * @returns Face detection result
   */
  detectFace(video: HTMLVideoElement): Promise<FaceDetectionResult | null>;

  /**
   * Start face tracking (for continuous detection)
   */
  startTracking(cb?: (detectState: any) => void): Promise<boolean>;

  /**
   * Stop face tracking
   */
  stopTracking(): void;

  /**
   * Clean up resources
   */
  dispose(): void;
}
