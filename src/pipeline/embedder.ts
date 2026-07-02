/** ArcFace 埋め込み（buffalo_sc の w600k_mbf.onnx）。
 * FaceBackend インターフェースでモデル差し替え可能にしておく（ライセンス対応）。
 */
import * as ort from "onnxruntime-web";

export interface FaceBackend {
  /** 整列済み 112x112 顔画像 → L2 正規化 512 次元埋め込み */
  embed(aligned: OffscreenCanvas): Promise<Float32Array>;
}

export class ArcFaceEmbedder implements FaceBackend {
  private session: ort.InferenceSession;

  private constructor(session: ort.InferenceSession) {
    this.session = session;
  }

  static async load(modelUrl: string, eps: string[]): Promise<ArcFaceEmbedder> {
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: eps,
      graphOptimizationLevel: "all",
    });
    return new ArcFaceEmbedder(session);
  }

  async embed(aligned: OffscreenCanvas): Promise<Float32Array> {
    const ctx = aligned.getContext("2d", { willReadFrequently: true })!;
    const { data } = ctx.getImageData(0, 0, 112, 112);
    // NCHW / (x-127.5)/127.5, RGB
    const input = new Float32Array(3 * 112 * 112);
    const plane = 112 * 112;
    for (let i = 0; i < plane; i++) {
      input[i] = (data[i * 4] - 127.5) / 127.5;
      input[i + plane] = (data[i * 4 + 1] - 127.5) / 127.5;
      input[i + plane * 2] = (data[i * 4 + 2] - 127.5) / 127.5;
    }
    const feeds: Record<string, ort.Tensor> = {
      [this.session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 112, 112]),
    };
    const out = await this.session.run(feeds);
    const emb = out[this.session.outputNames[0]].data as Float32Array;
    return l2normalize(new Float32Array(emb));
  }
}

export function l2normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1e-10;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}
