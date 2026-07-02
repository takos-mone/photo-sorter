/** 選択した写真にカテゴリ（イベント）を付与するモーダル。 */
import { useState } from "preact/hooks";
import { addCategory, corrections, tagPhotos } from "../state/store";

interface Props {
  photoIds: string[];
  onClose: () => void;
}

export function TagModal({ photoIds, onClose }: Props) {
  const [newCat, setNewCat] = useState("");
  const cats = corrections.value.categories;
  const tags = corrections.value.photoTags;

  // 選択全てに付いているカテゴリ = チェック済み表示
  const countWith = (c: string) => photoIds.filter((id) => tags[id]?.includes(c)).length;

  const apply = (c: string) => {
    const all = countWith(c) === photoIds.length;
    tagPhotos(photoIds, c, !all); // 全部付いていれば解除、そうでなければ付与
  };

  const createAndApply = () => {
    const n = newCat.trim();
    if (!n) return;
    addCategory(n);
    tagPhotos(photoIds, n, true);
    setNewCat("");
  };

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet">
        <h3 style="margin-top:0">選択した {photoIds.length} 枚にカテゴリを付ける</h3>
        {cats.length === 0 && <p class="hint">まだカテゴリがありません。下で作成してください。</p>}
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          {cats.map((c) => {
            const n = countWith(c);
            const state = n === 0 ? "" : n === photoIds.length ? " primary" : " partial";
            return (
              <button class={"btn" + state} key={c} onClick={() => apply(c)}>
                {n === photoIds.length ? "✓ " : n > 0 ? "◐ " : ""}
                {c}
                {n > 0 && n < photoIds.length ? `（${n}/${photoIds.length}）` : ""}
              </button>
            );
          })}
        </div>
        <div style="display:flex;gap:8px">
          <input
            type="text"
            style="flex:1"
            placeholder="新しいカテゴリ名（例: 追いコン）"
            value={newCat}
            onInput={(e) => setNewCat((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && createAndApply()}
          />
          <button class="btn primary" onClick={createAndApply} disabled={!newCat.trim()}>
            作成して付与
          </button>
        </div>
        <div style="text-align:right;margin-top:14px">
          <button class="btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
