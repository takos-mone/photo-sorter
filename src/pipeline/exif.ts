/** 最小限の EXIF 撮影日時パーサ。JPEG の APP1(Exif) から DateTimeOriginal(0x9003) を読む。
 * 依存なし。先頭 128KB だけ読めば十分（Exif は必ず先頭付近）。
 */

const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;

/** File → 撮影日時(epoch ms)。取得できなければ null。 */
export async function readTakenAt(file: File): Promise<number | null> {
  try {
    const head = await file.slice(0, 128 * 1024).arrayBuffer();
    const s = parseExifDate(new DataView(head));
    return s ? exifDateToMs(s) : null;
  } catch {
    return null;
  }
}

function parseExifDate(view: DataView): string | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // SOI (JPEG)
  let off = 2;
  while (off + 4 < view.byteLength) {
    if (view.getUint8(off) !== 0xff) break;
    const marker = view.getUint8(off + 1);
    const size = view.getUint16(off + 2);
    if (marker === 0xe1) {
      // APP1: "Exif\0\0" の後に TIFF ヘッダ
      const start = off + 4;
      if (view.getUint32(start) === 0x45786966) {
        return parseTiff(view, start + 6);
      }
    }
    if (marker === 0xda) break; // SOS 以降は画像データ
    off += 2 + size;
  }
  return null;
}

function parseTiff(view: DataView, tiff: number): string | null {
  const le = view.getUint16(tiff) === 0x4949; // "II"=little endian
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);

  const ifd0 = tiff + u32(tiff + 4);
  const findInIfd = (ifd: number, tag: number): number | null => {
    if (ifd + 2 > view.byteLength) return null;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      if (u16(e) === tag) return e;
    }
    return null;
  };
  const readAscii = (entry: number): string => {
    const count = u32(entry + 4);
    let p = count > 4 ? tiff + u32(entry + 8) : entry + 8;
    let out = "";
    for (let i = 0; i < count && p < view.byteLength; i++, p++) {
      const c = view.getUint8(p);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out;
  };

  // Exif サブ IFD の DateTimeOriginal を優先、無ければ IFD0 の DateTime
  const exifPtr = findInIfd(ifd0, TAG_EXIF_IFD);
  if (exifPtr) {
    const exifIfd = tiff + u32(exifPtr + 8);
    const dto = findInIfd(exifIfd, TAG_DATETIME_ORIGINAL);
    if (dto) return readAscii(dto);
  }
  const dt = findInIfd(ifd0, TAG_DATETIME);
  return dt ? readAscii(dt) : null;
}

/** "YYYY:MM:DD HH:MM:SS" → epoch ms（ローカル時刻として解釈） */
function exifDateToMs(s: string): number | null {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  const t = new Date(y, mo - 1, d, h, mi, se).getTime();
  return Number.isNaN(t) ? null : t;
}
