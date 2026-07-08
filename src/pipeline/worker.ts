/** パイプラインworker: decode済みbitmapを受け取り、検出→整列→埋め込み→dHash→サムネを返す。 */
import * as ort from "onnxruntime-web";
import type { WorkerRequest, WorkerResponse } from "../types";
import { cropFace, makeThumb } from "./decode";
import { Detector, type FaceDetector } from "./detector";
import { YuNetDetector } from "./yunet";
import { ArcFaceEmbedder } from "./embedder";
import { dhashOf } from "./dhash";
import { warpFace } from "./align";

let detector: FaceDetector | null = null;
let embedder: ArcFaceEmbedder | null = null;

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

// worker 内の未捕捉エラーを詳細付きでメインへ送る
self.addEventListener("error", (e) => {
  const ev = e as ErrorEvent;
  post({
    type: "INIT_ERROR",
    message: `${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`,
  });
});
self.addEventListener("unhandledrejection", (e) => {
  post({ type: "INIT_ERROR", message: `unhandledrejection: ${String((e as PromiseRejectionEvent).reason)}` });
});

type Models = Extract<WorkerRequest, { type: "INIT" }>["models"];

async function loadBackends(models: Models, eps: string[]): Promise<void> {
  detector =
    models.detector === "yunet"
      ? await YuNetDetector.load(models.detectorUrl, eps)
      : await Detector.load(models.detectorUrl, eps);
  // EdgeFace は ArcFace と同一の前処理（112x112 / (x-127.5)/127.5 / RGB）なので同じ実装を使う
  embedder = await ArcFaceEmbedder.load(models.embedderUrl, eps);
}

async function init(baseUrl: string, models: Models): Promise<void> {
  // wasm/グルーmjs は public/ort/ に配置し、静的URLとして読み込む
  ort.env.wasm.wasmPaths = `${baseUrl}ort/`;
  ort.env.wasm.numThreads = 1; // GitHub Pages は COOP/COEP 不可 → SAB無し

  let eps: string[] = ["wasm"];
  let backend: "webgpu" | "wasm" = "wasm";
  try {
    // WebGPU が使えるか軽く判定（adapter要求がハングしても3秒で諦める）
    const nav = self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
    if (nav.gpu) {
      const adapter = await Promise.race([
        nav.gpu.requestAdapter(),
        new Promise((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (adapter) {
        eps = ["webgpu", "wasm"];
        backend = "webgpu";
      }
    }
  } catch {
    /* wasm にフォールバック */
  }

  try {
    await loadBackends(models, eps);
    post({ type: "READY", backend });
  } catch (e) {
    // WebGPU 初期化失敗時は wasm で再試行
    if (backend === "webgpu") {
      await loadBackends(models, ["wasm"]);
      post({ type: "READY", backend: "wasm" });
    } else {
      post({ type: "INIT_ERROR", message: String(e) });
    }
  }
}

async function process(photoId: string, bitmap: ImageBitmap): Promise<void> {
  try {
    if (!detector || !embedder) throw new Error("モデル未初期化");
    const W = bitmap.width;
    const H = bitmap.height;

    const dets = await detector.detect(bitmap);
    const faces: Array<{
      box: [number, number, number, number];
      score: number;
      kps: number[];
      emb: Float32Array;
    }> = [];
    const faceCrops: Blob[] = [];

    for (const d of dets) {
      const aligned = warpFace(bitmap, d.kps);
      const emb = await embedder.embed(aligned);
      const box: [number, number, number, number] = [
        Math.max(0, d.bbox[0] / W),
        Math.max(0, d.bbox[1] / H),
        Math.min(1, (d.bbox[2] - d.bbox[0]) / W),
        Math.min(1, (d.bbox[3] - d.bbox[1]) / H),
      ];
      faces.push({
        box,
        score: d.score,
        kps: d.kps.flatMap(([x, y]) => [x / W, y / H]),
        emb,
      });
      faceCrops.push(await cropFace(bitmap, box));
    }

    const dhash = dhashOf(bitmap);
    const thumb = await makeThumb(bitmap);
    bitmap.close();

    post(
      { type: "RESULT", photoId, width: W, height: H, faces, dhash, thumb, faceCrops },
      faces.map((f) => f.emb.buffer),
    );
  } catch (e) {
    bitmap.close();
    post({ type: "ERROR", photoId, message: String(e) });
  }
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === "INIT") void init(msg.baseUrl, msg.models);
  else if (msg.type === "PROCESS") void process(msg.photoId, msg.bitmap);
};
