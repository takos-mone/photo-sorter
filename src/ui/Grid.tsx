/** 写真グリッド。フィルタ・選択モード・ライトボックス起動。 */
import {
  corrections,
  effectiveClusters,
  filter,
  lightbox,
  personName,
  photoClusters,
  photos,
  selectMode,
  selection,
  thumbUrls,
} from "../state/store";
import type { PhotoRec } from "../types";
import { dupGroups } from "../pipeline/dhash";

/** 現フィルタで表示する写真一覧 */
export function visiblePhotos(): PhotoRec[] {
  const f = filter.value;
  const pc = photoClusters.value;
  const all = photos.value;
  if (f.kind === "all") return all;
  if (f.kind === "unassigned") return all.filter((p) => !(pc.get(p.id)?.size ?? 0));
  if (f.kind === "person") {
    const c = effectiveClusters.value.find((c) => c.id === (f as { root: number }).root);
    const set = new Set(c?.photos ?? []);
    return all.filter((p) => set.has(p.id));
  }
  if (f.kind === "dup") {
    const withHash = all.filter((p) => p.dhash);
    const groups = dupGroups(
      withHash.map((p) => ({ id: p.id, hash: p.dhash! })),
      8,
    );
    const set = new Set(groups.flat());
    return all.filter((p) => set.has(p.id));
  }
  return all;
}

export function Grid() {
  const list = visiblePhotos();
  const pc = photoClusters.value;
  const sel = selection.value;
  const skip = corrections.value.skip;

  if (!list.length) return <div class="grid"><div class="empty">該当する写真はありません</div></div>;

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
        const names = roots
          ? [...roots]
              .map((r) => corrections.value.peopleLabels[r])
              .filter((n): n is string => !!n)
          : [];
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
            {names.length > 0 && (
              <div class="tags">
                {names.map((n) => (
                  <span class="tag" key={n}>
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

export { personName };
