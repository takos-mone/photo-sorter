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
  | { kind: "label"; label: string }
  | { kind: "dup" };
export const filter = signal<Filter>({ kind: "all" });
export const selection = signal<Set<string>>(new Set());
export const selectMode = signal(false);
export const lightbox = signal<string | null>(null); // photoId
export const mergeSel = signal<Set<number>>(new Set());

// ---- Undo（スナップショットスタック、既存ツールの snap()/undo() を移植） ----
const undoStack: string[] = [];
let lastTs = 0;

function snap(): string {
  return JSON.stringify(corrections.value);
}

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
  void saveCorrections(corrections.value);
}

export function initUndo(): void {
  undoStack.length = 0;
  undoStack.push(snap());
}

export function undo(): void {
  if (undoStack.length <= 1) return;
  undoStack.pop();
  corrections.value = JSON.parse(undoStack[undoStack.length - 1]) as Corrections;
  void saveCorrections(corrections.value);
}

export const canUndo = computed(() => undoStack.length > 1);

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
  const faceById = new Map(faces.value.map((f) => [f.id, f]));
  const byRoot = new Map<number, { faces: string[]; photos: Set<string> }>();

  for (const c of clusters.value) {
    const root = clusterRoot(c.id);
    const g = byRoot.get(root) ?? { faces: [], photos: new Set<string>() };
    for (const fid of c.faces) {
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
    if (ov === 0) continue;
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
