/** 顔クラスタリング — face_sort.py cluster()（貪欲割当+セントロイド統合）の移植。 */
import type { Cluster, ClusterParams, FaceRec } from "../types";
import { l2normalize } from "../pipeline/embedder";

const DIM = 512;

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i] * b[i];
  return s;
}

function meanNormalized(embs: Float32Array[]): Float32Array {
  const m = new Float32Array(DIM);
  for (const e of embs) for (let i = 0; i < DIM; i++) m[i] += e[i];
  for (let i = 0; i < DIM; i++) m[i] /= embs.length;
  return l2normalize(m);
}

export function clusterFaces(faces: FaceRec[], params: ClusterParams): Cluster[] {
  // スコア降順（信頼できる顔から核を作る — face_sort.py と同じ）
  // 極小顔（minBoxW 未満）は埋め込みが不安定で誤ったクラスタ癒着を起こすため除外
  const minW = params.minBoxW ?? 0;
  const usable = faces.filter((f) => f.score >= params.minScore && f.box[2] >= minW);
  const sorted = [...usable].sort((a, b) => b.score - a.score);

  // 1) 貪欲割当
  const centroids: Float32Array[] = [];
  const members: FaceRec[][] = [];
  for (const f of sorted) {
    let best = -1;
    let bestSim = -1;
    for (let c = 0; c < centroids.length; c++) {
      const sim = dot(centroids[c], f.emb);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }
    if (best >= 0 && bestSim > params.thr) {
      members[best].push(f);
      centroids[best] = meanNormalized(members[best].map((m) => m.emb));
    } else {
      centroids.push(f.emb);
      members.push([f]);
    }
  }

  // 2) セントロイド統合（最も近いペアを繰り返し統合）
  let merged = true;
  while (merged && centroids.length > 1) {
    merged = false;
    let bi = -1;
    let bj = -1;
    let bestSim = params.mergeThr;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const sim = dot(centroids[i], centroids[j]);
        if (sim > bestSim) {
          bestSim = sim;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi >= 0) {
      members[bi] = members[bi].concat(members[bj]);
      centroids[bi] = meanNormalized(members[bi].map((m) => m.emb));
      members.splice(bj, 1);
      centroids.splice(bj, 1);
      merged = true;
    }
  }

  // 3) min-photos フィルタ + Cluster へ整形（写真数の多い順に id 採番）
  const groups = members
    .map((ms) => {
      const photoSet = new Set(ms.map((m) => m.photoId));
      return { ms, photoSet };
    })
    .filter((g) => g.photoSet.size >= params.minPhotos)
    .sort((a, b) => b.photoSet.size - a.photoSet.size);

  return groups.map((g, i) => {
    let rep = g.ms[0];
    for (const m of g.ms) if (m.score > rep.score) rep = m;
    return {
      id: i + 1,
      count: g.photoSet.size,
      repFace: rep.id,
      photos: [...g.photoSet],
      faces: g.ms.map((m) => m.id),
    };
  });
}
