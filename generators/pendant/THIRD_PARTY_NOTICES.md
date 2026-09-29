# Third-party notices

Hotend HQ includes or loads the following third-party software. Each remains under its own licence.

## Bundled in this repository (`ai/`)

### Depth Anything V2 (Small)
- Files: `ai/depth2.0.onnx.wasm` … `ai/depth2.3.onnx.wasm` — the ONNX export `depth_anything_v2_vits_dynamic.onnx` from Depth-Anything-ONNX v2.0.0 (Apache-2.0, https://github.com/fabio-sim/Depth-Anything-ONNX), split into four parts. The `.wasm` extension is only there so static hosts serve the files; they are ONNX model data.
- Source: https://github.com/DepthAnything/Depth-Anything-V2 (Small model)
- Changes: the float32 weights are stored as float16, each followed by a Cast back to float32 (computation stays float32); nothing else.
- Licence: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0

### IS-Net (general use)
- Files: `ai/isnet.0.onnx.wasm` … `ai/isnet.3.onnx.wasm` — the ONNX export `isnet-general-use.onnx` distributed with rembg (MIT, https://github.com/danielgatis/rembg, release v0.0.0), split into four parts. The `.wasm` extension is only there so static hosts serve the files; they are ONNX model data.
- Source: https://github.com/xuebinqin/DIS (Highly Accurate Dichotomous Image Segmentation, Qin et al., ECCV 2022)
- Licence: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Changes: weights stored as symmetric per-channel int8, each followed by a DequantizeLinear back to float32 (computation stays float32); nothing else.

### ONNX Runtime Web 1.20.1
- Files: `ai/ort.wasm.min.mjs`, `ai/ort-wasm-simd-threaded.mjs`, `ai/ort-wasm-simd-threaded.wasm` (processor build) and `ai/ort.webgpu.min.mjs`, `ai/ort-wasm-simd-threaded.jsep.mjs`, `ai/ort-wasm-simd-threaded.jsep.wasm` (graphics-card build, used where WebGPU is available)
- Source: https://github.com/microsoft/onnxruntime (npm package `onnxruntime-web@1.20.1`)
- Licence: MIT — Copyright (c) Microsoft Corporation. https://github.com/microsoft/onnxruntime/blob/main/LICENSE

### face-api 1.7.15 (with TensorFlow.js)
- Files: `ai/face/face-api.esm.js`, `ai/face/tiny_face_detector_model*`, `ai/face/face_landmark_68_model*`
- Source: https://github.com/vladmandic/face-api (npm package `@vladmandic/face-api@1.7.15`), a maintained fork of https://github.com/justadudewhohacks/face-api.js
- Licence: MIT — Copyright (c) Vladimir Mandic; model weights MIT — Copyright (c) 2018 Vincent Mühler
- Bundles TensorFlow.js — Apache License 2.0, Copyright Google LLC. https://github.com/tensorflow/tfjs/blob/master/LICENSE

## Loaded at runtime from cdn.jsdelivr.net

### three.js 0.169.0
- Licence: MIT — Copyright © three.js authors. https://github.com/mrdoob/three.js/blob/dev/LICENSE

### fflate 0.8.2
- Licence: MIT — Copyright (c) Arjun Barrett. https://github.com/101arrowz/fflate/blob/master/LICENSE

## Fonts

Lettering fonts are loaded from Google Fonts and are licensed under the SIL Open Font License or the Apache License 2.0, as listed on https://fonts.google.com.
