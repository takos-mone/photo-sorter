/** プロジェクトの開始・再開・フォルダ権限の再取得フロー。 */
import type { PhotoRec } from "../types";
import { DEFAULT_CLUSTER_PARAMS } from "../types";
import * as db from "./db";
import {
  clusters,
  corrections,
  faceCropUrls,
  faces,
  initUndo,
  phase,
  photos,
  thumbUrls,
} from "./store";
import { emptyCorrections } from "../types";
import { clusterFaces } from "../cluster/cluster";

export const IMAGE_EXTS = /\.(jpe?g|png|webp|bmp|tiff?|heic|heif)$/i;

export function photoIdOf(f: File): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

/** ディレクトリハンドル配下の画像ファイルを再帰なし（直下のみ）で列挙 */
export async function listImages(dir: FileSystemDirectoryHandle): Promise<File[]> {
  const out: File[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && IMAGE_EXTS.test(entry.name)) {
      out.push(await entry.getFile());
    }
  }
  // 自然順ソート（数値を数値として比較）
  return out.sort((a, b) =>
    a.name.localeCompare(b.name, "ja", { numeric: true, sensitivity: "base" }),
  );
}

/** 新しいフォルダでプロジェクトを開始（既存データは破棄） */
export async function startProject(dir: FileSystemDirectoryHandle | null): Promise<void> {
  await db.clearAll();
  revokeUrls();
  photos.value = [];
  faces.value = [];
  clusters.value = [];
  corrections.value = emptyCorrections();
  initUndo();
  if (dir) await db.saveDirHandle(dir);
  await db.saveProject({
    id: "current",
    dirName: dir?.name ?? null,
    createdAt: Date.now(),
    clusterParams: DEFAULT_CLUSTER_PARAMS,
  });
}

/** 保存済みプロジェクトの復元。戻り値: 再接続が必要か */
export async function restoreProject(): Promise<{
  hasProject: boolean;
  needsPermission: boolean;
  dirName: string | null;
}> {
  const meta = await db.loadProject();
  if (!meta) return { hasProject: false, needsPermission: false, dirName: null };

  const [ph, fc, corr] = await Promise.all([
    db.allPhotos(),
    db.allFaces(),
    db.loadCorrections(),
  ]);
  photos.value = ph;
  faces.value = fc;
  corrections.value = corr ?? emptyCorrections();
  initUndo();
  // 保存済みの顔からクラスタを再計算（保存していないので毎回組み直す）
  if (fc.length) {
    clusters.value = clusterFaces(fc, meta.clusterParams ?? DEFAULT_CLUSTER_PARAMS);
  }
  await loadThumbUrls(ph.map((p) => p.id));
  await loadFaceCropUrls(fc.map((f) => f.id));

  const handle = await db.loadDirHandle();
  let needsPermission = false;
  if (handle) {
    const perm = await handle.queryPermission({ mode: "read" });
    needsPermission = perm !== "granted";
  }
  phase.value = ph.length ? "ready" : "idle";
  return { hasProject: true, needsPermission, dirName: meta.dirName };
}

/** 「前回のフォルダを再接続」ボタン（ユーザー操作から呼ぶ必要あり） */
export async function regrantPermission(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await db.loadDirHandle();
  if (!handle) return null;
  const perm = await handle.requestPermission({ mode: "read" });
  return perm === "granted" ? handle : null;
}

/** サムネURLをまとめて生成（ObjectURL） */
export async function loadThumbUrls(photoIds: string[]): Promise<void> {
  const m = new Map(thumbUrls.value);
  for (const id of photoIds) {
    if (m.has(id)) continue;
    const blob = await db.getThumb(id);
    if (blob) m.set(id, URL.createObjectURL(blob));
  }
  thumbUrls.value = m;
}

export async function loadFaceCropUrls(faceIds: string[]): Promise<void> {
  const m = new Map(faceCropUrls.value);
  for (const id of faceIds) {
    if (m.has(id)) continue;
    const blob = await db.getFaceCrop(id);
    if (blob) m.set(id, URL.createObjectURL(blob));
  }
  faceCropUrls.value = m;
}

function revokeUrls(): void {
  for (const u of thumbUrls.value.values()) URL.revokeObjectURL(u);
  for (const u of faceCropUrls.value.values()) URL.revokeObjectURL(u);
  thumbUrls.value = new Map();
  faceCropUrls.value = new Map();
}

/** 既処理分をスキップして未処理 File 一覧を返す */
export function diffNewFiles(files: File[], existing: PhotoRec[]): File[] {
  const done = new Set(existing.filter((p) => p.processed).map((p) => p.id));
  return files.filter((f) => !done.has(photoIdOf(f)));
}
