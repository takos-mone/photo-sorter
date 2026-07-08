/** 確認キュー（Pro機能）: 名前付け済みの人のプロトタイプ（平均顔ベクトル）を使い、
 * まだその人に割り当たっていない顔を確信度順に「この顔は◯◯さん？」とY/Nで高速確認する。
 * prototype.ts の computePrototypes / rankSuggestions を UI に接続したもの。
 */
import { useMemo, useState } from "preact/hooks";
import {
  clusterRoot,
  commit,
  corrections,
  effectiveClusters,
  faceCropUrls,
  faces,
} from "../state/store";
import { computePrototypes, rankSuggestions, type Suggestion } from "../cluster/prototype";

interface Props {
  onClose: () => void;
}

export function ReviewQueue({ onClose }: Props) {
  const [cursor, setCursor] = useState(0);
  const [decided, setDecided] = useState(0);

  // 名前→root の対応（ラベル付きクラスタのみ対象）
  const labelToRoot = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of effectiveClusters.value) {
      const label = corrections.value.peopleLabels[c.id];
      if (label) m.set(label, c.id);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 提案リスト（開いた時点で固定。処理済みは cursor で進める）
  const suggestions = useMemo<Suggestion[]>(() => {
    const cs = effectiveClusters.value;
    const labeled = cs.filter((c) => corrections.value.peopleLabels[c.id]);
    if (!labeled.length) return [];
    const faceToRoot = new Map<string, number>();
    for (const c of cs) for (const fid of c.faces) faceToRoot.set(fid, c.id);
    const protos = computePrototypes(faces.value, faceToRoot, corrections.value);
    // 「名前付きクラスタに属していない」顔が確認対象
    const labeledFaceIds = new Set(labeled.flatMap((c) => c.faces));
    const over = corrections.value.faceOverrides;
    const unassigned = faces.value.filter(
      (f) => !labeledFaceIds.has(f.id) && over[f.id] === undefined,
    );
    return rankSuggestions(unassigned, protos, 0.35);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = suggestions[cursor];

  const answer = (yes: boolean) => {
    if (!current) return;
    if (yes) {
      const root = labelToRoot.get(current.label);
      if (root !== undefined) {
        corrections.value = {
          ...corrections.value,
          faceOverrides: { ...corrections.value.faceOverrides, [current.faceId]: clusterRoot(root) },
        };
        commit();
      }
    }
    setDecided((n) => n + 1);
    setCursor((c) => c + 1);
  };

  const skip = () => setCursor((c) => c + 1);

  if (!labelToRoot.size) {
    return (
      <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div class="sheet">
          <h3 style="margin-top:0">確認キュー</h3>
          <p class="hint">先にピープルで最低1人に名前を付けてください。名前付きの人に似ている未分類の顔を提案します。</p>
          <div style="text-align:right">
            <button class="btn" onClick={onClose}>閉じる</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" style="max-width:440px;text-align:center">
        <h3 style="margin-top:0">確認キュー（{cursor + (current ? 1 : 0)}/{suggestions.length}）</h3>
        {current ? (
          <>
            {faceCropUrls.value.get(current.faceId) ? (
              <img
                src={faceCropUrls.value.get(current.faceId)}
                alt=""
                style="width:180px;height:180px;object-fit:cover;border-radius:14px;margin:8px auto;display:block"
              />
            ) : (
              <div style="width:180px;height:180px;background:#000;border-radius:14px;margin:8px auto" />
            )}
            <p style="font-size:18px;margin:6px 0">
              この顔は <b style="color:var(--accent)">{current.label}</b> さん？
              <span class="hint">（類似度 {(current.sim * 100).toFixed(0)}%）</span>
            </p>
            <div style="display:flex;gap:10px;justify-content:center">
              <button class="btn primary" style="min-width:110px" onClick={() => answer(true)}>
                ✓ はい (Y)
              </button>
              <button class="btn" style="min-width:110px" onClick={() => answer(false)}>
                ✗ いいえ (N)
              </button>
              <button class="btn" onClick={skip}>
                スキップ
              </button>
            </div>
          </>
        ) : (
          <p>
            ✅ 確認できる顔は以上です。
            {decided > 0 && <span class="hint">（{decided}件を処理しました）</span>}
          </p>
        )}
        <div style="text-align:right;margin-top:12px">
          <button class="btn" onClick={onClose}>
            終了
          </button>
        </div>
      </div>
    </div>
  );
}
