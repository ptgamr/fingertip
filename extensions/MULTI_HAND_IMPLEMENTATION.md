# Multi-Hand Finger Tracking Implementation

## Overview

This document describes the new multi-hand finger tracking implementation that replaces the single-hand `FingerTracker2` with the new `FingerTracker3` architecture.

## Architecture

The new implementation follows a modular architecture with clear separation of concerns:

### 1. **FingerTracker3** (`finger-tracker-3.ts`)

- Main orchestrator class
- Handles multi-hand landmark processing
- Coordinates between all components
- Provides backward compatibility with single-hand API

### 2. **PinchDetector** (`pinch-detector.ts`)

- Core pinch detection logic
- Manages state for both hands independently
- Implements hysteresis thresholds to prevent flickering
- Emits pinch events (start, held, released, move)

### 3. **ScrollController** (`scroll-controller.ts`)

- Handles scrolling behavior for each hand
- Each hand can scroll different areas simultaneously
- Uses GSAP for smooth scroll animations
- Finds scrollable parent elements automatically

### 4. **VisualFeedback** (`visual-feedback.ts`)

- Manages visual dots for both hands
- Left hand: Red dot
- Right hand: Blue dot
- Visual states:
  - Normal: Hand color (red/blue)
  - Pinching: Green
  - Scrolling: Yellow
- Optional debug panel showing hand states

### 5. **Types** (`finger-tracker-types.ts`)

- Shared TypeScript interfaces and types
- Configuration objects with defaults
- Event types and hand state structures

## Key Features

### Multi-Hand Support

- Tracks both left and right hands simultaneously
- Each hand operates independently
- Hands are identified by MediaPipe's handedness detection

### Independent Scrolling

- Each hand can scroll different elements at the same time
- Scroll targets are determined by the element under the pinch position
- Smooth scrolling with configurable speed

### Visual Feedback

- Two dots (red for left, blue for right)
- Color changes indicate state (green for pinching, yellow for scrolling)
- Smooth position tweening for natural movement
- Debug panel shows real-time hand tracking info

### Pinch Detection

- Index finger + thumb pinch gesture
- Hysteresis thresholds prevent accidental triggers
- Frame counting for stable detection
- Configurable sensitivity

## Configuration

```typescript
const tracker = new FingerTracker3({
  pinch: {
    pinchEnterThreshold: 0.04,
    pinchExitThreshold: 0.06,
    framesToConfirmPinch: 3,
    framesToReleasePinch: 5,
  },
  scroll: {
    scrollSpeed: 1,
    tweenDuration: 1,
    tweenEase: "linear.easeNone",
  },
  visual: {
    leftHandColor: "#ff0000",
    rightHandColor: "#0000ff",
    dotSize: 12,
    showDebug: true,
  },
});
```

## Usage

```typescript
// Update with multi-hand landmarks from MediaPipe
tracker.updateWithMultiHandLandmarks(
  multiHandLandmarks, // Array of hand landmarks
  multiHandedness, // Array of handedness info
  videoWidth,
  videoHeight,
  isMirrored
);

// Listen to pinch events
tracker.addEventListener("pinch-start", (event) => {
  console.log(`${event.hand} hand started pinching at`, event.position);
});

tracker.addEventListener("pinch-held", (event) => {
  console.log(`${event.hand} hand is scrolling`);
});
```

## Migration from FingerTracker2

1. Replace imports:

   ```typescript
   // Old
   import { FingerTracker2 } from "./finger-tracker-2";

   // New
   import { FingerTracker3 } from "./finger-tracker-3";
   ```

2. Update instantiation:

   ```typescript
   // Old
   this.fingerTracker = new FingerTracker2();

   // New
   this.fingerTracker = new FingerTracker3();
   ```

3. The new tracker maintains backward compatibility with the single-hand `updateWithLandmarks` method.

## CSS Classes

The implementation uses these CSS classes:

- `.fingertip-tracker-dot` - Base class for dots
- `#fingertip-tracker-dot-left` - Left hand dot
- `#fingertip-tracker-dot-right` - Right hand dot
- `.pinching` - Applied when pinching
- `.scrolling` - Applied when scrolling
- `#fingertip-tracker-debug` - Debug panel

## Testing

To test the multi-hand functionality:

1. Ensure both hands are visible to the camera
2. Make pinch gestures with index finger and thumb
3. Verify that:
   - Red dot appears for left hand
   - Blue dot appears for right hand
   - Dots turn green when pinching
   - Dots turn yellow when scrolling
   - Each hand can scroll different areas independently

## Future Enhancements

The architecture supports future expansion to:

- Multi-finger gestures (middle, ring, pinky)
- Custom gesture recognition
- Hand pose detection
- Gesture-based commands
