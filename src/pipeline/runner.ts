/** メインスレッド側のパイプライン制御。File→bitmap化→workerへ逐次投入→結果をDBへ永続化。 */
import type { FaceRec, PhotoRec, WorkerResponse } from "../types";
import { DEFAULT_CLUSTER_PARAMS } from "../types";
import * as db from "../state/db";
import {
  backend,
  clusters,
  faces,
  initError,
  phase,
  photos,
  progress,
} from "../state/store";
import { loadFaceCropUrls, loadThumbUrls, photoIdOf } from "../state/project";
import { clusterFaces } from "../cluster/cluster";
import { decodeFile } from "./decode";
import { readTakenAt } from "./exif";

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let cancelled = false;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  ready = new Promise<void>((resolve, reject) => {
    const w = worker!;
    const fail = (msg: string) => {
      initError.value = msg;
      w.removeEventListener("message", onMsg);
      reject(new Error(msg));
    };
    const onMsg = (ev: MessageEvent<WorkerResponse>) => {
      if (ev.data.type === "READY") {
        backend.value = ev.data.backend;
        w.removeEventListener("message", onMsg);
        resolve();
      } else if (ev.data.type === "INIT_ERROR") {
        fail(ev.data.message);
      }
    };
    w.addEventListener("message", onMsg);
    // worker 内の未捕捉エラー（import失敗など）も拾う
    w.onerror = (e) => fail(`worker error: ${e.message || e.filename || "unknown"}`);
    w.onmessageerror = () => fail("worker message error");
    w.postMessage({ type: "INIT", baseUrl: import.meta.env.BASE_URL });
  });
  return worker;
}

export function cancelPipeline(): void {
  cancelled = true;
}

/** 1枚をworkerで処理して結果を待つ */
function processOne(w: Worker, photoId: string, bitmap: ImageBitmap): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    const onMsg = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if ((m.type === "RESULT" || m.type === "ERROR") && m.photoId === photoId) {
        w.removeEventListener("message", onMsg);
        resolve(m);
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "PROCESS", photoId, bitmap }, [bitmap]);
  });
}

/** ファイル一覧をパイプラインに流す（処理済みはスキップ済み前提） */
export async function runPipeline(files: File[]): Promise<void> {
  if (!files.length) {
    await recluster();
    return;
  }
  cancelled = false;
  phase.value = "detecting";
  progress.value = { done: 0, total: files.length, msg: "顔認識モデルを読み込み中…" };

  const w = ensureWorker();
  try {
    await ready;
  } catch (e) {
    phase.value = photos.value.length ? "ready" : "idle";
    initError.value = String((e as Error).message ?? e);
    // 次回リトライ時に作り直せるよう破棄
    worker?.terminate();
    worker = null;
    ready = null;
    return;
  }

  let done = 0;
  for (const file of files) {
    if (cancelled) break;
    progress.value = { done, total: files.length, msg: file.name };

    const id = photoIdOf(file);
    const takenAt = await readTakenAt(file);
    const bitmap = await decodeFile(file);
    if (!bitmap) {
      // デコード不能: 未処理のまま記録して続行
      const rec: PhotoRec = {
        id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        width: 0,
        height: 0,
        dhash: null,
        processed: false,
        takenAt,
      };
      await db.putPhoto(rec);
      photos.value = [...photos.value.filter((p) => p.id !== id), rec];
      done++;
      continue;
    }

    const res = await processOne(w, id, bitmap);
    if (res.type === "RESULT") {
      const rec: PhotoRec = {
        id,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        width: res.width,
        height: res.height,
        dhash: res.dhash,
        processed: true,
        takenAt,
      };
      const faceRecs: FaceRec[] = res.faces.map((f, i) => ({
        id: `${id}#${i}`,
        photoId: id,
        box: f.box,
        score: f.score,
        kps: f.kps,
        emb: f.emb,
      }));
      await db.putPhoto(rec);
      await db.putFaces(faceRecs);
      await db.putThumb(id, res.thumb);
      for (let i = 0; i < res.faceCrops.length; i++) {
        await db.putFaceCrop(`${id}#${i}`, res.faceCrops[i]);
      }
      // ストアへ反映（逐次表示）
      photos.value = [...photos.value.filter((p) => p.id !== id), rec];
      faces.value = [...faces.value.filter((f) => f.photoId !== id), ...faceRecs];
      await loadThumbUrls([id]);
      await loadFaceCropUrls(faceRecs.map((f) => f.id));
    }
    done++;
  }

  progress.value = { done, total: files.length, msg: "クラスタリング中…" };
  await recluster();
}

/** 全埋め込みからクラスタを再計算 */
export async function recluster(): Promise<void> {
  phase.value = "clustering";
  const meta = await db.loadProject();
  const params = meta?.clusterParams ?? DEFAULT_CLUSTER_PARAMS;
  clusters.value = clusterFaces(faces.value, params);
  phase.value = "ready";
}
