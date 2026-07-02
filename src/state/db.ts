/** IndexedDB ラッパ。写真メタ・顔・サムネ・修正状態・フォルダハンドルを永続化する。 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Corrections, FaceRec, PhotoRec, ProjectMeta } from "../types";

interface SorterDB extends DBSchema {
  project: { key: string; value: ProjectMeta };
  handles: { key: string; value: FileSystemDirectoryHandle };
  photos: { key: string; value: PhotoRec };
  faces: {
    key: string;
    value: Omit<FaceRec, "emb"> & { emb: ArrayBuffer };
    indexes: { byPhoto: string };
  };
  thumbs: { key: string; value: Blob };
  faceCrops: { key: string; value: Blob };
  corrections: { key: string; value: Corrections };
}

let dbp: Promise<IDBPDatabase<SorterDB>> | null = null;

export function db(): Promise<IDBPDatabase<SorterDB>> {
  dbp ??= openDB<SorterDB>("photo-sorter", 1, {
    upgrade(d) {
      d.createObjectStore("project");
      d.createObjectStore("handles");
      d.createObjectStore("photos", { keyPath: "id" });
      const f = d.createObjectStore("faces", { keyPath: "id" });
      f.createIndex("byPhoto", "photoId");
      d.createObjectStore("thumbs");
      d.createObjectStore("faceCrops");
      d.createObjectStore("corrections");
    },
  });
  return dbp;
}

// ---- project / handle ----
export async function saveProject(meta: ProjectMeta): Promise<void> {
  await (await db()).put("project", meta, "current");
}
export async function loadProject(): Promise<ProjectMeta | undefined> {
  return (await db()).get("project", "current");
}
export async function saveDirHandle(h: FileSystemDirectoryHandle): Promise<void> {
  await (await db()).put("handles", h, "root");
}
export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await db()).get("handles", "root");
}

// ---- photos ----
export async function putPhoto(p: PhotoRec): Promise<void> {
  await (await db()).put("photos", p);
}
export async function allPhotos(): Promise<PhotoRec[]> {
  return (await db()).getAll("photos");
}

// ---- faces（埋め込みは ArrayBuffer で保存） ----
export async function putFaces(faces: FaceRec[]): Promise<void> {
  const d = await db();
  const tx = d.transaction("faces", "readwrite");
  for (const f of faces) {
    void tx.store.put({ ...f, emb: f.emb.buffer.slice(0) as ArrayBuffer });
  }
  await tx.done;
}
export async function allFaces(): Promise<FaceRec[]> {
  const raw = await (await db()).getAll("faces");
  return raw.map((f) => ({ ...f, emb: new Float32Array(f.emb) }));
}

// ---- blobs ----
export async function putThumb(photoId: string, blob: Blob): Promise<void> {
  await (await db()).put("thumbs", blob, photoId);
}
export async function getThumb(photoId: string): Promise<Blob | undefined> {
  return (await db()).get("thumbs", photoId);
}
export async function putFaceCrop(faceId: string, blob: Blob): Promise<void> {
  await (await db()).put("faceCrops", blob, faceId);
}
export async function getFaceCrop(faceId: string): Promise<Blob | undefined> {
  return (await db()).get("faceCrops", faceId);
}

// ---- corrections ----
export async function saveCorrections(c: Corrections): Promise<void> {
  await (await db()).put("corrections", c, "current");
}
export async function loadCorrections(): Promise<Corrections | undefined> {
  return (await db()).get("corrections", "current");
}

/** プロジェクトを完全に破棄（新しいフォルダで始める時） */
export async function clearAll(): Promise<void> {
  const d = await db();
  await Promise.all(
    (["project", "handles", "photos", "faces", "thumbs", "faceCrops", "corrections"] as const).map(
      (s) => d.clear(s),
    ),
  );
}
