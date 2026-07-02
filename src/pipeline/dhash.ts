/** 64bit dHash（dedup_photos.py の移植）。9x8グレースケールの横方向差分。 */

/** OffscreenCanvas 上で 9x8 に縮小して dHash を計算 */
export function dhashOf(bitmap: ImageBitmap): [number, number] {
  const c = new OffscreenCanvas(9, 8);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);

  let hi = 0;
  let lo = 0;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4;
      const j = i + 4;
      const a = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const b = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
      if (a > b) {
        if (bit < 32) lo |= 1 << bit;
        else hi |= 1 << (bit - 32);
      }
      bit++;
    }
  }
  // >>> 0 で符号なしに
  return [hi >>> 0, lo >>> 0];
}

export function hamming(a: [number, number], b: [number, number]): number {
  return popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);
}

function popcount(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/** union-find で近重複グループを作る（dedup_photos.py の _groups() 移植） */
export function dupGroups(
  items: Array<{ id: string; hash: [number, number] }>,
  maxDist: number,
): string[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hamming(items[i].hash, items[j].hash) <= maxDist) union(i, j);
    }
  }
  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(items[i].id);
  }
  return [...groups.values()].filter((g) => g.length >= 2);
}
