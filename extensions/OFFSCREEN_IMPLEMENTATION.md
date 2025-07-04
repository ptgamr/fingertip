# Offscreen Camera Access Implementation

This document explains the new offscreen camera access implementation for the FingerTip extension.

## Overview

The FingerTip extension now uses Chrome's Offscreen API to handle camera access and MediaPipe hand detection in a separate offscreen document, rather than directly in the content script. This approach provides better performance, security, and resource management.

## Architecture

### Components

1. **Offscreen Document** (`offscreen.html`, `offscreen.ts`)

   - Handles camera access via `getUserMedia()`
   - Runs MediaPipe hand detection models
   - Processes video frames and detects hand landmarks
   - Communicates results back to content script

2. **Background Script** (`background.ts`)

   - Manages offscreen document lifecycle
   - Creates/closes offscreen documents as needed
   - Relays messages between content script and offscreen document

3. **Content Script** (`content-script.ts`)

   - Uses `OffscreenHandDetector` instead of direct MediaPipe access
   - Communicates with offscreen document via Chrome messaging API
   - Displays visual feedback and handles user interaction

4. **Offscreen Hand Detector** (`offscreen-hand-detector.ts`)
   - Implements the `HandDetector` interface
   - Proxies hand detection requests to the offscreen document
   - Converts results back to the expected format

## Message Flow

```
Content Script → Background Script → Offscreen Document
             ↓                    ↓
   OffscreenHandDetector    Camera + MediaPipe
             ↓                    ↓
        Hand tracking      ← Detection Results
```

### Message Types

1. **start-camera**: Initialize camera in offscreen document
2. **stop-camera**: Stop camera and cleanup resources
3. **get-hand-detection**: Request hand detection from current video frame

## Benefits

1. **Better Performance**: Camera access and heavy ML processing happens off the main thread
2. **Security**: Camera permissions are better isolated
3. **Resource Management**: Easier to manage MediaPipe model lifecycle
4. **Compatibility**: Works with Chrome's Manifest V3 requirements

## Usage

The implementation is automatically used when creating a `WPCamera` instance:

```typescript
// Content script automatically uses offscreen detector
const camera = new WPCamera(element, settings, "offscreen");
```

## Files Modified

- `manifest.json`: Added `offscreen` permission
- `background.ts`: Added offscreen document management
- `wp-camera.ts`: Updated to support offscreen mode
- `content-script.ts`: Changed default detector to "offscreen"
- `vite.config.chrome.ts`: Added offscreen.html and offscreen.ts to build

## Files Added

- `offscreen.html`: Offscreen document HTML
- `offscreen.ts`: Offscreen document script with camera and MediaPipe
- `offscreen-hand-detector.ts`: Proxy detector for content script
- `hand-detector-factory.ts`: Updated to include offscreen option

## Configuration

The offscreen implementation uses the same MediaPipe configuration as the original:

- Model: `hand_landmarker.task`
- Running mode: VIDEO
- Max hands: 2
- Confidence thresholds: 0.5 for detection, presence, and tracking

## Building

Use the standard build commands:

```bash
npm run build:chrome
```

The build process automatically includes the offscreen document and related files in the output.
