# サードパーティ・ライセンス表記

## 顔認識モデル（InsightFace buffalo_sc）

本アプリは顔検出・顔認識に [InsightFace](https://github.com/deepinsight/insightface) の
`buffalo_sc` モデル（`det_500m.onnx` / `w600k_mbf.onnx`）を使用しています。

- InsightFace の**コード**は MIT ライセンスです。
- 事前学習済み**モデル重み**は、InsightFace により **非営利研究目的（non-commercial research purposes only）** で提供されています。

本アプリは**非営利・無料**で提供されており、収益化は行いません。この用途は上記条件の範囲内と考えています。
商用利用を行う場合は、モデル重みを商用可能ライセンスのもの（例: MIT ライセンスの
[@vladmandic/human](https://github.com/vladmandic/human) 同梱モデル）へ差し替えてください。
差し替えは `src/pipeline/embedder.ts` の `FaceBackend` インターフェースを実装することで可能です。

参照: https://github.com/deepinsight/insightface/tree/master/model_zoo

## ONNX Runtime Web

推論エンジンとして [ONNX Runtime Web](https://onnxruntime.ai/)（MIT ライセンス）を使用しています。

---

## 商用版（photo-sorter-app）のモデルについて

一般公開版（`VITE_EDITION=pro` ビルド、photo-sorter-app リポジトリでデプロイ）は
insightface のモデルを**一切使用しません**。代わりに以下の商用利用可能なモデルを使用します:

- **YuNet**（顔検出）— MIT License（OpenCV Model Zoo）。`public/models/pro/LICENSE.yunet.txt`
- **EdgeFace-S**（顔認識埋め込み）— MIT License（yakhyo/edgeface-onnx、原論文: EdgeFace, IJCB 2023）。`public/models/pro/LICENSE.edgeface.txt`

無料版（本リポジトリの GitHub Pages）は従来どおり insightface buffalo_sc を使用し、
非営利のまま維持されます（広告・課金なし）。
