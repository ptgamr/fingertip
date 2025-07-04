# Webcam Visibility Fix for Offscreen Implementation

## Problem

After implementing the offscreen camera access, the webcam preview was no longer visible to users because:

1. Camera access moved to the offscreen document (invisible)
2. Canvas was hidden for offscreen detector
3. No video feed was being displayed in the content script

## Solution

The fix involved streaming video frames from the offscreen document to the content script for display:

### 1. Canvas Visibility Restored

```typescript
// Before: Canvas was hidden for offscreen detector
if (detectorType === "offscreen") {
  this.canvas.style.display = "none";
}

// After: Canvas is always visible
this.canvas.style.display = "block";
```

### 2. Video Frame Streaming

Added `getVideoFrame()` method to offscreen document:

- Captures current video frame to canvas
- Converts to base64 data URL
- Returns frame data via Chrome messaging

### 3. Content Script Video Display

Updated `drawVideoToCanvas()` to handle offscreen mode:

- Requests video frames from offscreen document
- Creates Image object from base64 data
- Draws image to canvas with proper mirroring
- Maintains original video preview experience

### 4. Coordinate Mapping Fix

Updated coordinate calculations for offscreen detector:

- Uses default camera resolution (640x480) for calculations
- Ensures proper hand tracking coordinate conversion
- Maintains compatibility with page coordinate mapping

## Message Flow for Video Display

```
Content Script → Background → Offscreen Document
     ↓              ↓              ↓
Request Frame → Forward Msg → Capture Frame
     ↓              ↓              ↓
Display Video ← Relay Response ← Return Base64
```

## Performance Considerations

- Video frames are captured on-demand during render loop
- Base64 encoding is optimized with 0.8 JPEG quality
- Async operations don't block hand detection

## Files Modified

1. **offscreen.ts**: Added `getVideoFrame()` method
2. **background.ts**: Added message forwarding for `get-video-frame`
3. **fgt-camera.ts**:
   - Made canvas always visible
   - Updated `drawVideoToCanvas()` for offscreen mode
   - Fixed coordinate calculations
   - Made rendering loop async-compatible

## Result

- ✅ Webcam preview is now visible with offscreen implementation
- ✅ Hand tracking coordinates work correctly
- ✅ Mirroring and visual effects maintained
- ✅ Performance remains good with async video streaming
- ✅ All existing functionality preserved

Users can now see the webcam feed and hand tracking overlays exactly as before, while benefiting from the improved performance and security of offscreen camera access.
