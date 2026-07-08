/** YuNet（OpenCV Model Zoo, MIT）による顔検出。商用版で SCRFD の代替として使う。
 * OpenCV FaceDetectorYN の後処理を移植:
 *   出力: cls/obj/bbox/kps × stride {8,16,32}
 *   score = sqrt(cls * obj)
 *   cx = (col + bbox[0])*s, cy = (row + bbox[1])*s, w = exp(bbox[2])*s, h = exp(bbox[3])*s
 *   kps_i = ((col + kps[2i])*s, (row + kps[2i+1])*s)
 * 入力は BGR / 0-255 raw（平均減算・スケーリングなし）。
 */
import * as ort from "onnxruntime-web";
import { nms, type Detection, type FaceDetector } from "./detector";

const INPUT = 640; // 動的入力対応モデルだが、レターボックスで 640x640 に固定して使う
const STRIDES = [8, 16, 32] as const;

export class YuNetDetector implements FaceDetector {
  private session: ort.InferenceSession;

  private constructor(session: ort.InferenceSession) {
    this.session = session;
  }

  static async load(modelUrl: string, eps: string[]): Promise<YuNetDetector> {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: eps,
      graphOptimizationLevel: "all",
    });
    return new YuNetDetector(session);
  }

  async detect(bitmap: ImageBitmap, scoreThr = 0.6, nmsThr = 0.3): Promise<Detection[]> {
    const scale = Math.min(INPUT / bitmap.width, INPUT / bitmap.height);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(INPUT, INPUT);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, INPUT, INPUT);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, INPUT, INPUT);

    // NCHW / BGR / 0-255 raw（OpenCV blobFromImage の既定と同じ）
    const input = new Float32Array(3 * INPUT * INPUT);
    const plane = INPUT * INPUT;
    for (let i = 0; i < plane; i++) {
      input[i] = data[i * 4 + 2]; // B
      input[i + plane] = data[i * 4 + 1]; // G
      input[i + plane * 2] = data[i * 4]; // R
    }

    const feeds: Record<string, ort.Tensor> = {
      [this.session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, INPUT, INPUT]),
    };
    const out = await this.session.run(feeds);

    // 出力名は cls_8 / obj_8 / bbox_8 / kps_8 ... の形式。名前で対応付ける（順序に依存しない）。
    const get = (kind: string, stride: number): Float32Array | null => {
      const name = this.session.outputNames.find((n) => n === `${kind}_${stride}`);
      return name ? (out[name].data as Float32Array) : null;
    };

    const dets: Detection[] = [];
    for (const s of STRIDES) {
      const cls = get("cls", s);
      const obj = get("obj", s);
      const bbox = get("bbox", s);
      const kps = get("kps", s);
      if (!cls || !obj || !bbox || !kps) continue;
      const cols = INPUT / s;

      for (let idx = 0; idx < cls.length; idx++) {
        const c = Math.min(Math.max(cls[idx], 0), 1);
        const o = Math.min(Math.max(obj[idx], 0), 1);
        const score = Math.sqrt(c * o);
        if (score < scoreThr) continue;

        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const bo = idx * 4;
        const cx = (col + bbox[bo]) * s;
        const cy = (row + bbox[bo + 1]) * s;
        const bw = Math.exp(bbox[bo + 2]) * s;
        const bh = Math.exp(bbox[bo + 3]) * s;

        const pts: Array<[number, number]> = [];
        const ko = idx * 10;
        for (let k = 0; k < 5; k++) {
          pts.push([((col + kps[ko + k * 2]) * s) / scale, ((row + kps[ko + k * 2 + 1]) * s) / scale]);
        }
        dets.push({
          bbox: [
            (cx - bw / 2) / scale,
            (cy - bh / 2) / scale,
            (cx + bw / 2) / scale,
            (cy + bh / 2) / scale,
          ],
          score,
          kps: pts,
        });
      }
    }
    return nms(dets, nmsThr);
  }
}
