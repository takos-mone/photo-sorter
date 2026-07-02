/** カテゴリ（イベント）バー: 作成・フィルタ・リネーム・削除。ピープルとは独立。 */
import { useState } from "preact/hooks";
import {
  addCategory,
  corrections,
  deleteCategory,
  filter,
  photos,
  renameCategory,
} from "../state/store";

export function CategoryBar() {
  const [name, setName] = useState("");
  const cats = corrections.value.categories;
  const tags = corrections.value.photoTags;

  const countOf = (cat: string) =>
    photos.value.reduce((n, p) => n + (tags[p.id]?.includes(cat) ? 1 : 0), 0);

  const create = () => {
    addCategory(name);
    setName("");
  };

  const f = filter.value;

  return (
    <div class="catbar">
      <span class="catlabel">カテゴリ（イベント）</span>
      {cats.map((c) => {
        const active = f.kind === "category" && f.name === c;
        return (
          <span class={"catchip" + (active ? " on" : "")} key={c}>
            <button
              class="catchip-name"
              onClick={() =>
                (filter.value = active ? { kind: "all" } : { kind: "category", name: c })
              }
            >
              {c} <b>{countOf(c)}</b>
            </button>
            <button
              class="catchip-x"
              title="名前変更"
              onClick={() => {
                const nn = prompt("カテゴリ名を変更", c);
                if (nn) renameCategory(c, nn);
              }}
            >
              ✎
            </button>
            <button
              class="catchip-x"
              title="削除"
              onClick={() => {
                if (confirm(`カテゴリ「${c}」を削除しますか？（写真自体は消えません）`))
                  deleteCategory(c);
              }}
            >
              ×
            </button>
          </span>
        );
      })}
      <input
        type="text"
        class="catinput"
        placeholder="＋ 新しいカテゴリ（例: 夏合宿）"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
      />
      <button class="btn" onClick={create} disabled={!name.trim()}>
        追加
      </button>
    </div>
  );
}
