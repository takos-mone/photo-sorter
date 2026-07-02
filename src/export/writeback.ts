/** File System Access API で人ごとのフォルダへ直接書き出す（sort_photos.py 相当）。 */

export interface WritePlan {
  /** フォルダ名（人名） → 書き出すファイル */
  folders: Map<string, Array<{ name: string; getFile: () => Promise<File | Blob> }>>;
}

/** 出力先フォルダを選ばせて、人ごとのサブフォルダにコピーする。
 * 戻り値: フォルダごとの書き込み枚数。
 */
export async function writeBack(
  plan: WritePlan,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> {
  const dest = await window.showDirectoryPicker({ mode: "readwrite", id: "photo-sorter-out" });
  const result = new Map<string, number>();
  let total = 0;
  for (const files of plan.folders.values()) total += files.length;
  let done = 0;

  for (const [folder, files] of plan.folders) {
    const sub = await dest.getDirectoryHandle(sanitize(folder), { create: true });
    let n = 0;
    for (const f of files) {
      const src = await f.getFile();
      const fh = await sub.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await src.stream().pipeTo(w);
      n++;
      done++;
      onProgress?.(done, total);
    }
    result.set(folder, n);
  }
  return result;
}

/** フォルダ名に使えない文字を除去 */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "unnamed";
}
