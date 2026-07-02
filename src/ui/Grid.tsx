/** 写真グリッド。フィルタ・並び替え・選択モード・ライトボックス起動。 */
import {
  corrections,
  effectiveClusters,
  filter,
  lightbox,
  photoClusters,
  photos,
  photoTime,
  selectMode,
  selection,
  sortBy,
  thumbUrls,
} from "../state/store";
import type { PhotoRec } from "../types";
import { dupGroups } from "../pipeline/dhash";

/** 現フィルタ・並び順で表示する写真一覧 */
export function visiblePhotos(): PhotoRec[] {
  const f = filter.value;
  const pc = photoClusters.value;
  const removed = corrections.value.removed;
  const tags = corrections.value.photoTags;
  let all = photos.value.filter((p) => !removed[p.id]);

  if (f.kind === "unassigned") {
    all = all.filter((p) => !(pc.get(p.id)?.size ?? 0) && !(tags[p.id]?.length ?? 0));
  } else if (f.kind === "person") {
    const c = effectiveClusters.value.find((c) => c.id === (f as { root: number }).root);
    const set = new Set(c?.photos ?? []);
    all = all.filter((p) => set.has(p.id));
  } else if (f.kind === "category") {
    const name = (f as { name: string }).name;
    all = all.filter((p) => tags[p.id]?.includes(name));
  } else if (f.kind === "dup") {
    const withHash = all.filter((p) => p.dhash);
    const groups = dupGroups(
      withHash.map((p) => ({ id: p.id, hash: p.dhash! })),
      8,
    );
    const set = new Set(groups.flat());
    all = all.filter((p) => set.has(p.id));
  }

  const sorted = [...all];
  if (sortBy.value === "date") {
    sorted.sort((a, b) => photoTime(a) - photoTime(b));
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  }
  return sorted;
}

export function Grid() {
  const list = visiblePhotos();
  const pc = photoClusters.value;
  const sel = selection.value;
  const skip = corrections.value.skip;
  const tags = corrections.value.photoTags;

  if (!list.length)
    return (
      <div class="grid">
        <div class="empty">該当する写真はありません</div>
      </div>
    );

  const toggleSel = (id: string) => {
    const s = new Set(sel);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    selection.value = s;
  };

  return (
    <div class="grid">
      {list.map((p) => {
        const roots = pc.get(p.id);
        const cats = tags[p.id] ?? [];
        return (
          <div
            key={p.id}
            class={
              "card" +
              (selectMode.value && sel.has(p.id) ? " dlsel" : "") +
              (skip[p.id] ? " skip" : "")
            }
            onClick={() => {
              if (selectMode.value) toggleSel(p.id);
              else lightbox.value = p.id;
            }}
          >
            <div class="num">{p.name}</div>
            <img loading="lazy" src={thumbUrls.value.get(p.id) ?? ""} alt={p.name} />
            {roots && roots.size > 0 && <div class="npeople">👤{roots.size}</div>}
            {cats.length > 0 && (
              <div class="tags">
                {cats.map((n) => (
                  <span class="tag cat" key={n}>
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
