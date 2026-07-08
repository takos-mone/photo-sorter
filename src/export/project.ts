/** プロジェクトのエクスポート/インポート（Pro機能）。
 * .psort = ZIP（無圧縮）: project.json + embs.f32 + thumbs/ + crops/
 * 別のPCや別の部員が、元写真なしで仕分けの続き（名前付け・修正・ZIP出力の計画）をできる。
 * ※元写真そのものは含まないため、書き出し系は再接続が必要。
 */
import { unzipSync, zipSync } from "fflate";
import type { Corrections, FaceRec, PhotoRec, ProjectMeta } from "../types";
import * as db from "../state/db";
import { corrections, faces, photos } from "../state/store";
import { emptyCorrections } from "../types";
import { EDITION_CLUSTER_PARAMS } from "../config/edition";

const MAGIC = "psort/v1";

interface Manifest {
  magic: typeof MAGIC;
  exportedAt: number;
  photos: PhotoRec[];
  /** emb を除いた顔情報。埋め込みは embs.f32 に faces と同順で連結 */
  faces: Array<Omit<FaceRec, "emb">>;
  corrections: Corrections;
  clusterParams: ProjectMeta["clusterParams"];
}

export async function exportProject(): Promise<Blob> {
  const fs = faces.value;
  const embs = new Float32Array(fs.length * 512);
  fs.forEach((f, i) => embs.set(f.emb, i * 512));

  const manifest: Manifest = {
    magic: MAGIC,
    exportedAt: Date.now(),
    photos: photos.value,
    faces: fs.map(({ emb: _emb, ...rest }) => rest),
    corrections: corrections.value,
    clusterParams: (await db.loadProject())?.clusterParams ?? EDITION_CLUSTER_PARAMS,
  };

  const entries: Record<string, Uint8Array> = {
    "project.json": new TextEncoder().encode(JSON.stringify(manifest)),
    "embs.f32": new Uint8Array(embs.buffer),
  };
  // サムネと顔クロップも同梱（インデックスで対応付け）
  for (let i = 0; i < photos.value.length; i++) {
    const t = await db.getThumb(photos.value[i].id);
    if (t) entries[`thumbs/${i}.jpg`] = new Uint8Array(await t.arrayBuffer());
  }
  for (let i = 0; i < fs.length; i++) {
    const c = await db.getFaceCrop(fs[i].id);
    if (c) entries[`crops/${i}.jpg`] = new Uint8Array(await c.arrayBuffer());
  }

  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped as unknown as BlobPart], { type: "application/octet-stream" });
}

/** .psort を読み込んで現在のプロジェクトを置き換える。戻り値: 復元枚数。 */
export async function importProject(file: File): Promise<{ photos: number; faces: number }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf);
  const manifestRaw = entries["project.json"];
  if (!manifestRaw) throw new Error("project.json がありません（.psort ではないファイル？）");
  const manifest = JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest;
  if (manifest.magic !== MAGIC) throw new Error("対応していないファイル形式です");
  const embsRaw = entries["embs.f32"];
  if (!embsRaw) throw new Error("埋め込みデータがありません");
  // アライメントを保証するためコピーしてから view を作る
  const embBuf = embsRaw.slice().buffer;
  const embs = new Float32Array(embBuf);
  if (embs.length !== manifest.faces.length * 512) throw new Error("埋め込みサイズが不正です");

  // 既存プロジェクトを破棄して置き換え
  await db.clearAll();
  await db.saveProject({
    id: "current",
    dirName: null, // 元フォルダには未接続
    createdAt: Date.now(),
    clusterParams: manifest.clusterParams,
  });

  const faceRecs: FaceRec[] = manifest.faces.map((f, i) => ({
    ...f,
    emb: embs.slice(i * 512, (i + 1) * 512),
  }));
  for (const p of manifest.photos) await db.putPhoto(p);
  await db.putFaces(faceRecs);
  for (let i = 0; i < manifest.photos.length; i++) {
    const t = entries[`thumbs/${i}.jpg`];
    if (t) await db.putThumb(manifest.photos[i].id, new Blob([t.slice() as unknown as BlobPart], { type: "image/jpeg" }));
  }
  for (let i = 0; i < faceRecs.length; i++) {
    const c = entries[`crops/${i}.jpg`];
    if (c) await db.putFaceCrop(faceRecs[i].id, new Blob([c.slice() as unknown as BlobPart], { type: "image/jpeg" }));
  }
  await db.saveCorrections(manifest.corrections ?? emptyCorrections());

  return { photos: manifest.photos.length, faces: faceRecs.length };
}
