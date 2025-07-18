import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "./xmanifests/chrome/manifest.json",
          dest: "",
        },
        {
          src: "./offscreen.html",
          dest: "",
        },
        {
          src: "./node_modules/@mediapipe/tasks-vision/wasm/*",
          dest: "mediapipe/wasm/",
        },
        {
          src: "./public/hand_landmarker.task",
          dest: "models/",
        },
        {
          src: "./src/libs/jeelizFaceExpressionsNNC.json",
          dest: "models/",
        },
        {
          src: "./src/libs/jeelizFaceExpressions.js",
          dest: "",
        },
      ],
    }),
  ],
  build: {
    outDir: "dist/chrome",
    rollupOptions: {
      input: {
        background: "src/background.ts",
        options: "src/options.ts",
        offscreen: "src/offscreen.ts",
        "options-page": "options.html",
        // content-scripts are built separately because we don't want rollup to bundle them
        // Rollup enforces code-splitting when there are multiple entry-points
        // but content-scripts can't use import statements, everything need to be bundled into a single file
        // "content-scripts": "src/content-script.ts",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
