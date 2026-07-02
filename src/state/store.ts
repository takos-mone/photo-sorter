/** アプリ全体の状態（@preact/signals）。既存 仕分けツール.html の state 構造を移植。 */
import { computed, signal } from "@preact/signals";
import type { Cluster, Corrections, FaceRec, PhotoRec } from "../types";
import { emptyCorrections } from "../types";
import { saveCorrections } from "./db";

// ---- 基本データ ----
export const photos = signal<PhotoRec[]>([]);
export const faces = signal<FaceRec[]>([]);
export const clusters = signal<Cluster[]>([]);
export const thumbUrls = signal<Map<string, string>>(new Map());
export const faceCropUrls = signal<Map<string, string>>(new Map());

// ---- 処理進捗 ----
export type Phase = "idle" | "ingesting" | "detecting" | "clustering" | "ready";
export const phase = signal<Phase>("idle");
export const progress = signal<{ done: number; total: number; msg: string }>({
  done: 0,
  total: 0,
  msg: "",
});
export const backend = signal<"webgpu" | "wasm" | null>(null);
export const initError = signal<string | null>(null);

// ---- 修正状態（Undo対象） ----
export const corrections = signal<Corrections>(emptyCorrections());

// ---- UI状態 ----
export type Filter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "person"; root: number }
  | { kind: "category"; name: string }
  | { kind: "dup" };
export const filter = signal<Filter>({ kind: "all" });
export const selection = signal<Set<string>>(new Set());
export const selectMode = signal(false);
export const lightbox = signal<string | null>(null); // photoId
export const mergeSel = signal<Set<number>>(new Set());
export type SortBy = "name" | "date";
export const sortBy = signal<SortBy>("name");
export const hideSmallPeople = signal(false); // 1〜2枚の人を隠す

/** 撮影日時（無ければ lastModified）でのソートキー */
export function photoTime(p: PhotoRec): number {
  return p.takenAt ?? p.lastModified ?? 0;
}

// ---- Undo（スナップショットスタック、既存ツールの snap()/undo() を移植） ----
const undoStack: string[] = [];
let lastTs = 0;

function snap(): string {
  return JSON.stringify(corrections.value);
}

// undoStack の深さを signal で公開（canUndo をリアクティブにするため）
const undoDepth = signal(1);

export function commit(): void {
  const s = snap();
  const now = Date.now();
  if (s !== undoStack[undoStack.length - 1]) {
    if (now - lastTs < 500 && undoStack.length > 1) undoStack[undoStack.length - 1] = s;
    else {
      undoStack.push(s);
      if (undoStack.length > 100) undoStack.shift();
    }
    lastTs = now;
  }
  undoDepth.value = undoStack.length;
  void saveCorrections(corrections.value);
}

export function initUndo(): void {
  undoStack.length = 0;
  undoStack.push(snap());
  undoDepth.value = 1;
}

export function undo(): void {
  if (undoStack.length <= 1) return;
  undoStack.pop();
  corrections.value = JSON.parse(undoStack[undoStack.length - 1]) as Corrections;
  undoDepth.value = undoStack.length;
  void saveCorrections(corrections.value);
}

export const canUndo = computed(() => undoDepth.value > 1);

// ---- クラスタ統合の解決（既存 clusterRoot() の移植） ----
export function clusterRoot(id: number): number {
  const m = corrections.value.mergeMap;
  let cur = id;
  let guard = 0;
  while (m[cur] !== undefined && m[cur] !== cur && guard++ < 50) cur = m[cur];
  return cur;
}

/** 統合・顔単位修正を反映した実効クラスタ一覧（既存 effectivePeople() の移植+faceOverrides対応） */
export const effectiveClusters = computed<Cluster[]>(() => {
  const over = corrections.value.faceOverrides;
  const removed = corrections.value.removed;
  const faceById = new Map(
    faces.value.filter((f) => !removed[f.photoId]).map((f) => [f.id, f]),
  );
  const byRoot = new Map<number, { faces: string[]; photos: Set<string> }>();

  for (const c of clusters.value) {
    const root = clusterRoot(c.id);
    const g = byRoot.get(root) ?? { faces: [], photos: new Set<string>() };
    for (const fid of c.faces) {
      if (!faceById.has(fid)) continue; // 削除された写真の顔は除外
      // 顔単位の付け替えがあればそちらを優先
      const ov = over[fid];
      const dest = ov !== undefined ? (ov === 0 ? 0 : clusterRoot(ov)) : root;
      if (dest !== root) continue; // 別クラスタへ移動済み → ここには入れない
      g.faces.push(fid);
      const ph = faceById.get(fid)?.photoId;
      if (ph) g.photos.add(ph);
    }
    byRoot.set(root, g);
  }
  // 付け替えで他クラスタへ移ってきた顔を合流
  for (const [fid, ov] of Object.entries(over)) {
    if (ov === 0 || !faceById.has(fid)) continue;
    const root = clusterRoot(ov);
    const g = byRoot.get(root) ?? { faces: [], photos: new Set<string>() };
    if (!g.faces.includes(fid)) {
      g.faces.push(fid);
      const ph = faceById.get(fid)?.photoId;
      if (ph) g.photos.add(ph);
    }
    byRoot.set(root, g);
  }

  const out: Cluster[] = [];
  for (const [root, g] of byRoot) {
    if (!g.faces.length) continue;
    // 代表顔 = スコア最大
    let rep = g.faces[0];
    let best = -1;
    for (const fid of g.faces) {
      const s = faceById.get(fid)?.score ?? 0;
      if (s > best) {
        best = s;
        rep = fid;
      }
    }
    out.push({ id: root, count: g.photos.size, repFace: rep, photos: [...g.photos], faces: g.faces });
  }
  return out.sort((a, b) => b.count - a.count);
});

/** photoId → 実効クラスタroot集合 */
export const photoClusters = computed<Map<string, Set<number>>>(() => {
  const m = new Map<string, Set<number>>();
  const faceById = new Map(faces.value.map((f) => [f.id, f]));
  for (const c of effectiveClusters.value) {
    for (const fid of c.faces) {
      const ph = faceById.get(fid)?.photoId;
      if (!ph) continue;
      (m.get(ph) ?? m.set(ph, new Set()).get(ph)!).add(c.id);
    }
  }
  return m;
});

/** クラスタrootの表示名（ラベル未設定なら「人N」） */
export function personName(root: number): string {
  return corrections.value.peopleLabels[root] || `人${root}`;
}

// ---- カテゴリ（イベント等、ユーザー定義） ----
export function addCategory(name: string): void {
  const n = name.trim();
  if (!n || corrections.value.categories.includes(n)) return;
  corrections.value = { ...corrections.value, categories: [...corrections.value.categories, n] };
  commit();
}

export function renameCategory(oldName: string, newName: string): void {
  const n = newName.trim();
  if (!n || n === oldName) return;
  const cats = corrections.value.categories.map((c) => (c === oldName ? n : c));
  const tags: Record<string, string[]> = {};
  for (const [pid, list] of Object.entries(corrections.value.photoTags)) {
    tags[pid] = list.map((c) => (c === oldName ? n : c));
  }
  corrections.value = { ...corrections.value, categories: cats, photoTags: tags };
  commit();
}

export function deleteCategory(name: string): void {
  const cats = corrections.value.categories.filter((c) => c !== name);
  const tags: Record<string, string[]> = {};
  for (const [pid, list] of Object.entries(corrections.value.photoTags)) {
    const kept = list.filter((c) => c !== name);
    if (kept.length) tags[pid] = kept;
  }
  corrections.value = { ...corrections.value, categories: cats, photoTags: tags };
  commit();
}

/** 複数写真に対してカテゴリの付与/解除をまとめて行う */
export function tagPhotos(photoIds: string[], category: string, on: boolean): void {
  const tags = { ...corrections.value.photoTags };
  for (const id of photoIds) {
    const cur = new Set(tags[id] ?? []);
    if (on) cur.add(category);
    else cur.delete(category);
    if (cur.size) tags[id] = [...cur];
    else delete tags[id];
  }
  corrections.value = { ...corrections.value, photoTags: tags };
  commit();
}

/** 複数写真をプロジェクトから削除（Undoで戻せる） */
export function removePhotos(photoIds: string[]): void {
  const removed = { ...corrections.value.removed };
  for (const id of photoIds) removed[id] = true;
  corrections.value = { ...corrections.value, removed };
  commit();
}

/** 選択写真を「写っている人」のカテゴリへ自動振り分け（人名ラベルをカテゴリタグとして付与） */
export function autoAssignPhotos(photoIds: string[]): { tagged: number; skipped: number } {
  const pc = photoClusters.value;
  const labels = corrections.value.peopleLabels;
  const tags = { ...corrections.value.photoTags };
  const cats = new Set(corrections.value.categories);
  let tagged = 0;
  let skipped = 0;
  for (const id of photoIds) {
    const roots = pc.get(id);
    const names = roots ? [...roots].map((r) => labels[r]).filter((n): n is string => !!n) : [];
    if (!names.length) {
      skipped++;
      continue;
    }
    const cur = new Set(tags[id] ?? []);
    for (const n of names) {
      cur.add(n);
      cats.add(n);
    }
    tags[id] = [...cur];
    tagged++;
  }
  corrections.value = { ...corrections.value, photoTags: tags, categories: [...cats] };
  commit();
  return { tagged, skipped };
}
