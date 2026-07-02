/** 修正学習フック（v1では未使用・保留機能）。
 * ユーザーが確定したラベルから人ごとのプロトタイプ（正規化平均ベクトル）を計算し、
 * 未確定の顔を類似度+マージンでランク付けして「候補」を提示する。
 * 学習ではなく純粋な数値計算なので、ラベル変更のたびに debounce 再計算すればよい。
 */
import type { Corrections, FaceRec } from "../types";
import { l2normalize } from "../pipeline/embedder";

const DIM = 512;

/** 確定ラベル（peopleLabels の付いた実効クラスタ）→ 人ごとのプロトタイプ */
export function computePrototypes(
  faces: FaceRec[],
  faceToRoot: Map<string, number>,
  corrections: Corrections,
): Map<string, Float32Array> {
  const byLabel = new Map<string, Float32Array[]>();
  for (const f of faces) {
    const root = faceToRoot.get(f.id);
    if (root === undefined) continue;
    const label = corrections.peopleLabels[root];
    if (!label) continue;
    (byLabel.get(label) ?? byLabel.set(label, []).get(label)!).push(f.emb);
  }
  const out = new Map<string, Float32Array>();
  for (const [label, embs] of byLabel) {
    const m = new Float32Array(DIM);
    for (const e of embs) for (let i = 0; i < DIM; i++) m[i] += e[i];
    for (let i = 0; i < DIM; i++) m[i] /= embs.length;
    out.set(label, l2normalize(m));
  }
  return out;
}

export interface Suggestion {
  faceId: string;
  label: string;
  sim: number;
  /** top1 - top2 の差。大きいほど自信あり */
  margin: number;
}

/** 未確定の顔をプロトタイプ類似度でランク付け */
export function rankSuggestions(
  unassigned: FaceRec[],
  prototypes: Map<string, Float32Array>,
  minSim = 0.35,
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const f of unassigned) {
    let top1: { label: string; sim: number } | null = null;
    let top2 = -1;
    for (const [label, proto] of prototypes) {
      let s = 0;
      for (let i = 0; i < DIM; i++) s += proto[i] * f.emb[i];
      if (!top1 || s > top1.sim) {
        if (top1) top2 = top1.sim;
        top1 = { label, sim: s };
      } else if (s > top2) top2 = s;
    }
    if (top1 && top1.sim >= minSim) {
      out.push({
        faceId: f.id,
        label: top1.label,
        sim: top1.sim,
        margin: top2 < 0 ? top1.sim : top1.sim - top2,
      });
    }
  }
  return out.sort((a, b) => b.sim - a.sim);
}
