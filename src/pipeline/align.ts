/** 5点ランドマークによる顔整列（insightface の norm_crop 相当）。
 * Umeyama 相似変換で ArcFace テンプレートへ位置合わせし 112x112 を切り出す。
 */

/** ArcFace 標準テンプレート（112x112 空間の5点: 両目・鼻・口角） */
const ARCFACE_DST: ReadonlyArray<readonly [number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export interface Affine {
  a: number; // [ a  b  tx ]
  b: number; // [ c  d  ty ]
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** 相似変換（回転+一様スケール+平行移動、反射なし）を最小二乗で推定: src(kps) → ARCFACE_DST。
 * skimage の SimilarityTransform（insightface の norm_crop 相当）と同じ Procrustes 解。
 */
export function estimateSimilarity(src: Array<[number, number]>): Affine {
  const n = src.length;
  // 各点群の重心
  let mx = 0;
  let my = 0;
  let ux = 0;
  let uy = 0;
  for (let i = 0; i < n; i++) {
    mx += src[i][0];
    my += src[i][1];
    ux += ARCFACE_DST[i][0];
    uy += ARCFACE_DST[i][1];
  }
  mx /= n;
  my /= n;
  ux /= n;
  uy /= n;

  // Sa = Σ(dst·src), Sb = Σ(dst×src), varSrc = Σ|src|²（重心を引いた座標で）
  let sa = 0;
  let sb = 0;
  let varSrc = 0;
  for (let i = 0; i < n; i++) {
    const xs = src[i][0] - mx;
    const ys = src[i][1] - my;
    const xd = ARCFACE_DST[i][0] - ux;
    const yd = ARCFACE_DST[i][1] - uy;
    sa += xd * xs + yd * ys;
    sb += yd * xs - xd * ys;
    varSrc += xs * xs + ys * ys;
  }
  const v = varSrc || 1e-10;
  const A = sa / v; // s·cosθ
  const B = sb / v; // s·sinθ

  // dst = R(θ)·s·src + t、R = [cosθ -sinθ; sinθ cosθ]
  //   x' = A·x - B·y + tx
  //   y' = B·x + A·y + ty
  const a = A;
  const b = -B;
  const c = B;
  const d = A;
  return { a, b, c, d, tx: ux - (a * mx + b * my), ty: uy - (c * mx + d * my) };
}

/** ランドマークで整列した 112x112 の顔画像を作る */
export function warpFace(bitmap: ImageBitmap, kps: Array<[number, number]>): OffscreenCanvas {
  const t = estimateSimilarity(kps);
  const c = new OffscreenCanvas(112, 112);
  const ctx = c.getContext("2d")!;
  // canvas の setTransform(a, b, c, d, e, f) は列優先:
  //   x' = a*x + c*y + e,  y' = b*x + d*y + f
  ctx.setTransform(t.a, t.c, t.b, t.d, t.tx, t.ty);
  ctx.drawImage(bitmap, 0, 0);
  return c;
}
