export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface HandDetectionResult {
  landmarks: HandLandmark[];
  // Index finger tip is typically landmark 8
  indexFingerTip: HandLandmark;
}

export interface HandDetector {
  isLoaded: boolean;

  /**
   * Initialize the hand detection model
   */
  initialize(): Promise<void>;

  /**
   * Detect hands in a video element
   * @param video - The video element to analyze
   * @returns Array of hand detection results
   */
  detectHands(video: HTMLVideoElement): Promise<HandDetectionResult[]>;

  /**
   * Clean up resources
   */
  dispose(): void;
}
