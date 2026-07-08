/** エディション設定。ビルド時の VITE_EDITION（"free" | "pro"）で全分岐を一元管理する。
 *
 * - free: 現行の部活向け無料版（insightface buffalo_sc、非営利限定）。挙動は従来と完全に同一。
 * - pro : 一般公開・商用版（YuNet + EdgeFace、共にMIT）。ランディング/マネタイズUI/Pro機能あり。
 */

export type Edition = "free" | "pro";

export const EDITION: Edition =
  (import.meta.env.VITE_EDITION as Edition | undefined) === "pro" ? "pro" : "free";

export const IS_PRO_EDITION = EDITION === "pro";

/** worker へ渡すモデル構成 */
export interface ModelConfig {
  detector: "scrfd" | "yunet";
  detectorUrl: string;
  embedderUrl: string;
}

export function modelConfig(baseUrl: string): ModelConfig {
  if (IS_PRO_EDITION) {
    return {
      detector: "yunet",
      detectorUrl: `${baseUrl}models/pro/yunet_2023mar.onnx`,
      embedderUrl: `${baseUrl}models/pro/edgeface_s_gamma_05.onnx`,
    };
  }
  return {
    detector: "scrfd",
    detectorUrl: `${baseUrl}models/det_500m.onnx`,
    embedderUrl: `${baseUrl}models/w600k_mbf.onnx`,
  };
}

/** クラスタリング既定値（埋め込み空間がエディションで異なるため別々に持つ）。
 * pro の値は実写真56枚での閾値スイープで決定（2026-07-08）:
 *  - YuNet はスコアが高めに出るため minScore を 0.8 に引き上げ
 *  - 極小顔（幅2.5%未満）が「一般的な埋め込み」になり巨大クラスタへ癒着するため minBoxW で除外
 *  - EdgeFace の類似度分布は ArcFace より高めのため thr/mergeThr を 0.45/0.50 に */
export const EDITION_CLUSTER_PARAMS = IS_PRO_EDITION
  ? { thr: 0.45, mergeThr: 0.5, minScore: 0.8, minPhotos: 1, minBoxW: 0.025 }
  : { thr: 0.4, mergeThr: 0.46, minScore: 0.6, minPhotos: 1, minBoxW: 0 };

/** 商用版のみ: 無料利用の1プロジェクト上限枚数（Proで無制限）。free版は無制限。 */
export const FREE_PHOTO_LIMIT = IS_PRO_EDITION ? 300 : Infinity;

/** 機能フラグ */
export const FEATURES = {
  landing: IS_PRO_EDITION,
  monetizeUI: IS_PRO_EDITION,
  proGating: IS_PRO_EDITION,
} as const;
