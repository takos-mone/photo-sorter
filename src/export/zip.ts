/** fflate によるストリーミングZIP（JPEGは再圧縮せずSTORE）。 */
import { Zip, ZipPassThrough } from "fflate";

export interface ZipEntry {
  /** ZIP内のファイル名 */
  name: string;
  /** 元ファイル取得関数（1枚ずつ遅延読み込みでメモリを抑える） */
  getFile: () => Promise<File | Blob>;
}

/** entries を順にZIP化して1つのBlobにする */
export async function makeZip(entries: ZipEntry[]): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  let error: Error | null = null;
  let resolveDone: () => void;
  const done = new Promise<void>((res) => (resolveDone = res));

  const zip = new Zip((err, chunk, final) => {
    if (err) error = err;
    else {
      chunks.push(chunk);
      if (final) resolveDone();
    }
  });

  for (const e of entries) {
    const file = await e.getFile();
    const z = new ZipPassThrough(e.name); // STORE（無圧縮）
    zip.add(z);
    const buf = new Uint8Array(await file.arrayBuffer());
    z.push(buf, true);
    if (error) throw error;
  }
  zip.end();
  await done;
  if (error) throw error;
  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}

/** BlobをブラウザDLとして保存 */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
