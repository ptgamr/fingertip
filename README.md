### Hand Pose tracking journey

- `Tensorflowjs` is easier to integrate. Got it working the first try via content script. But detection is not reliable
- Mediapipe vision-tasks does not work with content script as it wanting to load WASM, also tricky interm of loading the `.js` script to load the `.wasm` file.

  - if we don't manually load the `.js` file via `content-scripts` section in manifest, it'll be loaded in `Page` world, and will not visible in `Content Script` world
  - once we explicitly say to load `vision_wasm_nosimd_internal.js` in content scripts, we pass that issue but then WASM loading doesn't work, as Manifest V3 no longer support WebAssembly

- Ended up using `offscreen` page, to load MediaPipe... and it works quite well.
  - offscreen page will request the camera and perform handpose detection
  - Have to refactor the Camera logic, to constantly request FrameData from offscreen page, to draw in canvas so the camera is visible to user
  - TODO: we should just have the Offscreen approach, as it seems more reliable.
