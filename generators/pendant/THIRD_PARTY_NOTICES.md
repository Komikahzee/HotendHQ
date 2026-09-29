# Third-party notices

Hotend HQ includes or loads the following third-party software. Each remains under its own licence.

## Bundled in this repository (`ai/`)

### Depth Anything V2 (Small)
- Files: `ai/depth2.0.onnx.wasm` … `ai/depth2.3.onnx.wasm` — the ONNX export `depth_anything_v2_vits_dynamic.onnx` from Depth-Anything-ONNX v2.0.0 (Apache-2.0, https://github.com/fabio-sim/Depth-Anything-ONNX), split into four parts. The `.wasm` extension is only there so static hosts serve the files; they are ONNX model data.
- Source: https://github.com/DepthAnything/Depth-Anything-V2 (Small model)
- Changes: the float32 weights are stored as float16, each followed by a Cast back to float32 (computation stays float32); nothing else.
- Licence: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0

### MODNet
- File: `ai/modnet.onnx.wasm` — the ONNX export `Xenova/modnet` (`onnx/model_quantized.onnx`). The `.wasm` extension is only there so static hosts serve the file.
- Source: https://huggingface.co/Xenova/modnet (original: https://github.com/ZHKKKe/MODNet)
- Licence: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Changes: none (renamed only).

### ONNX Runtime Web 1.20.1
- Files: `ai/ort.wasm.min.mjs`, `ai/ort-wasm-simd-threaded.mjs`, `ai/ort-wasm-simd-threaded.wasm`
- Source: https://github.com/microsoft/onnxruntime (npm package `onnxruntime-web@1.20.1`)
- Licence: MIT — Copyright (c) Microsoft Corporation. https://github.com/microsoft/onnxruntime/blob/main/LICENSE

## Loaded at runtime from cdn.jsdelivr.net

### three.js 0.169.0
- Licence: MIT — Copyright © three.js authors. https://github.com/mrdoob/three.js/blob/dev/LICENSE

### fflate 0.8.2
- Licence: MIT — Copyright (c) Arjun Barrett. https://github.com/101arrowz/fflate/blob/master/LICENSE

## Fonts

Lettering fonts are loaded from Google Fonts and are licensed under the SIL Open Font License or the Apache License 2.0, as listed on https://fonts.google.com.
