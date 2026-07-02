/** SCRFD-500M（buffalo_sc の det_500m.onnx）による顔検出。
 * insightface の SCRFD 後処理（distance2bbox / distance2kps + NMS）を移植。
 */
import * as ort from "onnxruntime-web";

const INPUT = 640;
const STRIDES = [8, 16, 32] as const;
const NUM_ANCHORS = 2;

export interface Detection {
  /** 入力画像ピクセル座標 [x1,y1,x2,y2] */
  bbox: [number, number, number, number];
  score: number;
  /** 5点 [x,y]×5（入力画像ピクセル座標） */
  kps: Array<[number, number]>;
}

export class Detector {
  private session: ort.InferenceSession;

  private constructor(session: ort.InferenceSession) {
    this.session = session;
  }

  static async load(modelUrl: string, eps: string[]): Promise<Detector> {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: eps,
      graphOptimizationLevel: "all",
    });
    return new Detector(session);
  }

  /** bitmap 全体から顔を検出（レターボックスで 640x640 に収めて推論） */
  async detect(bitmap: ImageBitmap, scoreThr = 0.5, nmsThr = 0.4): Promise<Detection[]> {
    const scale = Math.min(INPUT / bitmap.width, INPUT / bitmap.height);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(INPUT, INPUT);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, INPUT, INPUT);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, INPUT, INPUT);

    // NCHW / (x-127.5)/128, RGB
    const input = new Float32Array(3 * INPUT * INPUT);
    const plane = INPUT * INPUT;
    for (let i = 0; i < plane; i++) {
      input[i] = (data[i * 4] - 127.5) / 128;
      input[i + plane] = (data[i * 4 + 1] - 127.5) / 128;
      input[i + plane * 2] = (data[i * 4 + 2] - 127.5) / 128;
    }

    const feeds: Record<string, ort.Tensor> = {
      [this.session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, INPUT, INPUT]),
    };
    const out = await this.session.run(feeds);
    // 出力は 9 テンソル: scores(3スケール), bboxes(3), kps(3) の順（insightface準拠）
    const names = this.session.outputNames;

    const dets: Detection[] = [];
    for (let s = 0; s < STRIDES.length; s++) {
      const stride = STRIDES[s];
      const scores = out[names[s]].data as Float32Array;
      const bboxes = out[names[s + 3]].data as Float32Array;
      const kpss = out[names[s + 6]].data as Float32Array;
      const side = INPUT / stride;

      for (let idx = 0; idx < scores.length; idx++) {
        const score = scores[idx];
        if (score < scoreThr) continue;
        const anchor = Math.floor(idx / NUM_ANCHORS) ; // 位置インデックス
        const ax = (anchor % side) * stride;
        const ay = Math.floor(anchor / side) * stride;

        const bo = idx * 4;
        const x1 = ax - bboxes[bo] * stride;
        const y1 = ay - bboxes[bo + 1] * stride;
        const x2 = ax + bboxes[bo + 2] * stride;
        const y2 = ay + bboxes[bo + 3] * stride;

        const kps: Array<[number, number]> = [];
        const ko = idx * 10;
        for (let k = 0; k < 5; k++) {
          kps.push([ax + kpss[ko + k * 2] * stride, ay + kpss[ko + k * 2 + 1] * stride]);
        }
        dets.push({
          bbox: [x1 / scale, y1 / scale, x2 / scale, y2 / scale],
          score,
          kps: kps.map(([x, y]) => [x / scale, y / scale]),
        });
      }
    }
    return nms(dets, nmsThr);
  }
}

function nms(dets: Detection[], thr: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of sorted) {
    let ok = true;
    for (const k of keep) {
      if (iou(d.bbox, k.bbox) > thr) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(d);
  }
  return keep;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-10);
}
