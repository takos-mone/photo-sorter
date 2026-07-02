/** ピープルパネル: クラスタごとの代表顔・枚数・名前付け・統合・この人だけ表示・ZIP DL。 */
import { useState } from "preact/hooks";
import {
  commit,
  corrections,
  effectiveClusters,
  faceCropUrls,
  filter,
  mergeSel,
  personName,
} from "../state/store";

interface Props {
  onZipPerson: (root: number) => void;
}

export function PeoplePanel({ onZipPerson }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const clusters = effectiveClusters.value;
  if (!clusters.length) return null;

  const labeled = clusters.filter((c) => corrections.value.peopleLabels[c.id]).length;
  const sel = mergeSel.value;

  const doMerge = () => {
    const ids = [...sel];
    if (ids.length < 2) return;
    const root = Math.min(...ids);
    const m = { ...corrections.value.mergeMap };
    for (const id of ids) if (id !== root) m[id] = root;
    corrections.value = { ...corrections.value, mergeMap: m };
    mergeSel.value = new Set();
    commit();
  };

  const resetMerge = () => {
    if (!confirm("グループの統合をすべて解除しますか？")) return;
    corrections.value = { ...corrections.value, mergeMap: {} };
    mergeSel.value = new Set();
    commit();
  };

  const setLabel = (root: number, name: string) => {
    const labels = { ...corrections.value.peopleLabels };
    if (name.trim()) labels[root] = name.trim();
    else delete labels[root];
    corrections.value = { ...corrections.value, peopleLabels: labels };
    commit();
  };

  const togglePersonFilter = (root: number) => {
    const f = filter.value;
    filter.value = f.kind === "person" && f.root === root ? { kind: "all" } : { kind: "person", root };
  };

  return (
    <div class={"people" + (collapsed ? " collapsed" : "")}>
      <div class="phead" onClick={() => setCollapsed(!collapsed)}>
        <h2>ピープル</h2>
        <span class="hint">
          名前を入力→その人の写真をまとめて管理。☑で同一人物を統合。名前済み {labeled}/
          {clusters.length}（クリックで開閉）
        </span>
        <button
          class="btn"
          style="margin-left:auto"
          disabled={sel.size < 2}
          onClick={(e) => {
            e.stopPropagation();
            doMerge();
          }}
        >
          選択を統合
        </button>
        <button
          class="btn"
          onClick={(e) => {
            e.stopPropagation();
            resetMerge();
          }}
        >
          統合リセット
        </button>
      </div>
      <div class="prow">
        {clusters.map((c) => {
          const label = corrections.value.peopleLabels[c.id] ?? "";
          const active = filter.value.kind === "person" && filter.value.root === c.id;
          const repUrl = faceCropUrls.value.get(c.repFace);
          return (
            <div class={"person" + (label ? " done" : "") + (active ? " sel" : "")} key={c.id}>
              <input
                class="mchk"
                type="checkbox"
                checked={sel.has(c.id)}
                onChange={(e) => {
                  const s = new Set(sel);
                  if ((e.target as HTMLInputElement).checked) s.add(c.id);
                  else s.delete(c.id);
                  mergeSel.value = s;
                }}
              />
              {repUrl ? (
                <img src={repUrl} alt="" onClick={() => togglePersonFilter(c.id)} />
              ) : (
                <div style="width:112px;height:112px;background:#000;border-radius:9px" />
              )}
              <div class="cnt">{c.count}枚</div>
              <input
                type="text"
                placeholder={`人${c.id}（名前を入力）`}
                value={label}
                onChange={(e) => setLabel(c.id, (e.target as HTMLInputElement).value)}
              />
              <div class="pact">
                <button class="btn" onClick={() => togglePersonFilter(c.id)}>
                  👁 この人
                </button>
                <button class="btn" title={`${personName(c.id)}の写真をZIPで保存`} onClick={() => onZipPerson(c.id)}>
                  ⬇️ ZIP
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
