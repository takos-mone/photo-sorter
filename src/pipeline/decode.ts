/** 画像デコードと縮小。HEIC はメインスレッド側で heic.ts が事前変換する。 */

/** File → ImageBitmap（失敗時は null）。長辺 maxSide に縮小。 */
export async function decodeFile(file: File, maxSide = 1600): Promise<ImageBitmap | null> {
  try {
    const full = await createImageBitmap(file);
    return shrink(full, maxSide);
  } catch {
    return null;
  }
}

/** 長辺 maxSide 以下に縮小（既に小さければそのまま返す） */
export function shrink(bmp: ImageBitmap, maxSide: number): ImageBitmap {
  const scale = maxSide / Math.max(bmp.width, bmp.height);
  if (scale >= 1) return bmp;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return c.transferToImageBitmap();
}

/** JPEGサムネイル生成（長辺 size） */
export async function makeThumb(bmp: ImageBitmap, size = 320, quality = 0.8): Promise<Blob> {
  const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return c.convertToBlob({ type: "image/jpeg", quality });
}

/** 顔クロップJPEG（box は正規化座標、少しマージンを付けて切り出し） */
export async function cropFace(
  bmp: ImageBitmap,
  box: [number, number, number, number],
  out = 112,
  margin = 0.25,
): Promise<Blob> {
  const [nx, ny, nw, nh] = box;
  const cx = (nx + nw / 2) * bmp.width;
  const cy = (ny + nh / 2) * bmp.height;
  const side = Math.max(nw * bmp.width, nh * bmp.height) * (1 + margin * 2);
  const sx = Math.max(0, cx - side / 2);
  const sy = Math.max(0, cy - side / 2);
  const sw = Math.min(bmp.width - sx, side);
  const sh = Math.min(bmp.height - sy, side);
  const c = new OffscreenCanvas(out, out);
  c.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, out, out);
  return c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}
