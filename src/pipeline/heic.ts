/** HEIC/HEIF を遅延ロードのデコーダで JPEG Blob に変換する。
 * heic2any（libheif同梱）を、HEIC を初めて見たときだけ動的 import する。
 */

type Heic2Any = (opts: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

let converter: Heic2Any | null = null;

export function isHeic(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
}

async function loadConverter(): Promise<Heic2Any> {
  if (converter) return converter;
  const mod = (await import("heic2any")) as unknown as { default: Heic2Any };
  converter = mod.default;
  return converter;
}

/** HEIC File → JPEG Blob（失敗時は null） */
export async function heicToJpegBlob(file: File): Promise<Blob | null> {
  try {
    const conv = await loadConverter();
    const out = await conv({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  } catch {
    return null;
  }
}
