/** 写真1枚のメタ情報（IndexedDB `photos` ストアの1レコード） */
export interface PhotoRec {
  /** 一意ID: `${name}|${size}|${lastModified}` */
  id: string;
  name: string;
  size: number;
  lastModified: number;
  width: number;
  height: number;
  /** 64bit dHash を u32 ×2 で保持 */
  dhash: [number, number] | null;
  /** パイプライン処理済みか（顔検出まで完了） */
  processed: boolean;
  /** EXIF 撮影日時（epoch ms）。無ければ lastModified を使う。 */
  takenAt: number | null;
}

/** 検出された顔1つ（IndexedDB `faces` ストアの1レコード） */
export interface FaceRec {
  /** 一意ID: `${photoId}#${index}` */
  id: string;
  photoId: string;
  /** 正規化 [x, y, w, h]（写真サイズ比） */
  box: [number, number, number, number];
  /** 検出スコア 0-1 */
  score: number;
  /** 5点ランドマーク（正規化座標、[x,y]×5） */
  kps: number[];
  /** ArcFace 512次元埋め込み（L2正規化済み） */
  emb: Float32Array;
}

/** クラスタ（ピープル1人分）— face_clusters.json 互換 */
export interface Cluster {
  id: number;
  /** 写真枚数（ユニーク） */
  count: number;
  /** 代表顔の faceId */
  repFace: string;
  /** 所属写真ID */
  photos: string[];
  /** 全所属 faceId */
  faces: string[];
}

/** ユーザーの修正状態（Undo対象） */
export interface Corrections {
  /** クラスタ統合: id → 統合先root */
  mergeMap: Record<number, number>;
  /** クラスタ→人名ラベル */
  peopleLabels: Record<number, string>;
  /** 顔単位の付け替え: faceId → クラスタid（0=どこにも属さない） */
  faceOverrides: Record<string, number>;
  /** ユーザー定義カテゴリ（イベント名など。例: "夏合宿旅行"） */
  categories: string[];
  /** 写真ごとのカテゴリタグ: photoId → カテゴリ名[] */
  photoTags: Record<string, string[]>;
  /** プロジェクトから除外した（削除した）写真 */
  removed: Record<string, boolean>;
  /** 使わない写真 */
  skip: Record<string, boolean>;
}

export const emptyCorrections = (): Corrections => ({
  mergeMap: {},
  peopleLabels: {},
  faceOverrides: {},
  categories: [],
  photoTags: {},
  removed: {},
  skip: {},
});

/** プロジェクト全体メタ */
export interface ProjectMeta {
  id: string; // 固定 "current"（v1は単一プロジェクト）
  dirName: string | null;
  createdAt: number;
  clusterParams: ClusterParams;
}

export interface ClusterParams {
  thr: number; // 貪欲割当のcos類似度しきい値
  mergeThr: number; // セントロイド統合しきい値
  minScore: number; // 顔検出スコア下限
  minPhotos: number; // クラスタ採用の最小写真数
}

export const DEFAULT_CLUSTER_PARAMS: ClusterParams = {
  thr: 0.4,
  mergeThr: 0.46,
  minScore: 0.6,
  // 1 にして検出された人は全員ピープルに出す（小グループは UI 側トグルで隠す）
  minPhotos: 1,
};

/** パイプラインworkerへの要求 */
export type WorkerRequest =
  | { type: "INIT"; baseUrl: string }
  | {
      type: "PROCESS";
      photoId: string;
      bitmap: ImageBitmap;
    };

/** worker からの応答 */
export type WorkerResponse =
  | { type: "READY"; backend: "webgpu" | "wasm" }
  | { type: "INIT_ERROR"; message: string }
  | {
      type: "RESULT";
      photoId: string;
      width: number;
      height: number;
      faces: Array<{
        box: [number, number, number, number];
        score: number;
        kps: number[];
        emb: Float32Array;
      }>;
      dhash: [number, number];
      thumb: Blob;
      /** 代表用 顔クロップ (112x112 JPEG)。顔ごと */
      faceCrops: Blob[];
    }
  | { type: "ERROR"; photoId: string; message: string };
