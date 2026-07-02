/** 重複候補の確認・削除ビュー。近い写真をグループ表示し、
 * ユーザーが本当に重複か確認してから削除する（既定は最高解像度を残す）。
 */
import { useMemo, useState } from "preact/hooks";
import { corrections, photos, removePhotos, thumbUrls } from "../state/store";
import { dupGroups } from "../pipeline/dhash";
import type { PhotoRec } from "../types";

export function DedupView() {
  const [dist, setDist] = useState(8);
  // 「重複ではない」と判断して除外したグループ（代表IDで識別）
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const removed = corrections.value.removed;

  const groups = useMemo(() => {
    const list = photos.value.filter((p) => !removed[p.id] && p.dhash);
    const byId = new Map(list.map((p) => [p.id, p]));
    const raw = dupGroups(
      list.map((p) => ({ id: p.id, hash: p.dhash! })),
      dist,
    );
    // 各グループを解像度の高い順に並べる（先頭=残す推奨）
    return raw
      .map((ids) => ids.map((id) => byId.get(id)!).filter(Boolean))
      .map((ps) => [...ps].sort((a, b) => b.width * b.height - a.width * a.height))
      .filter((ps) => ps.length >= 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dist, photos.value, removed]);

  // 既定の削除印: 各グループの先頭以外（未dismissed）を削除対象に
  const defaultMarks = useMemo(() => {
    const s = new Set<string>();
    for (const ps of groups) {
      const key = ps[0].id;
      if (dismissed.has(key)) continue;
      for (let i = 1; i < ps.length; i++) s.add(ps[i].id);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, dismissed]);

  // 実効の削除印 = defaultMarks を base に、ユーザーのトグル差分を適用
  const [touched, setTouched] = useState<Map<string, boolean>>(new Map());
  const isMarked = (id: string) => (touched.has(id) ? touched.get(id)! : defaultMarks.has(id));

  const toggle = (id: string) => {
    const m = new Map(touched);
    m.set(id, !isMarked(id));
    setTouched(m);
  };

  const dismissGroup = (key: string) => {
    const d = new Set(dismissed);
    d.add(key);
    setDismissed(d);
    // そのグループの touched を消す
  };

  const allMarked: string[] = [];
  for (const ps of groups) {
    if (dismissed.has(ps[0].id)) continue;
    for (const p of ps) if (isMarked(p.id)) allMarked.push(p.id);
  }

  const doDelete = () => {
    if (!allMarked.length) return;
    if (
      !confirm(
        `重複と判断した ${allMarked.length} 枚を削除します。\n各グループで「残す」写真は削除されません。\n（元の写真ファイルは消えません／「元に戻す」で復活できます）\n\n実行しますか？`,
      )
    )
      return;
    removePhotos(allMarked);
    setTouched(new Map());
  };

  if (!groups.length) {
    return (
      <div class="dedup">
        <div class="dedup-head">
          <b>重複候補</b>
          <span class="hint">近い写真は見つかりませんでした。</span>
          <label class="hint" style="margin-left:auto">
            判定の厳しさ
            <input
              type="range"
              min={2}
              max={12}
              value={dist}
              onInput={(e) => setDist(Number((e.target as HTMLInputElement).value))}
            />
            {dist}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div class="dedup">
      <div class="dedup-head">
        <b>重複候補 {groups.length} 組</b>
        <span class="hint">
          各組で<b>残す1枚</b>以外が削除印（赤）です。写真クリックで残す/削除を切替、「重複ではない」で組ごと除外。
        </span>
        <label class="hint" style="margin-left:auto">
          判定の厳しさ（小さいほど厳密）
          <input
            type="range"
            min={2}
            max={12}
            value={dist}
            onInput={(e) => {
              setDist(Number((e.target as HTMLInputElement).value));
              setTouched(new Map());
              setDismissed(new Set());
            }}
          />
          {dist}
        </label>
        <button class="btn danger" disabled={!allMarked.length} onClick={doDelete}>
          🗑 印を付けた {allMarked.length} 枚を削除
        </button>
      </div>

      {groups.map((ps) => {
        const key = ps[0].id;
        if (dismissed.has(key)) return null;
        return (
          <div class="dupgroup" key={key}>
            <div class="dupgroup-bar">
              <span class="hint">{ps.length}枚が似ています</span>
              <button class="btn" onClick={() => dismissGroup(key)}>
                これは重複ではない
              </button>
            </div>
            <div class="dupgroup-row">
              {ps.map((p) => (
                <DupCard key={p.id} p={p} marked={isMarked(p.id)} onToggle={() => toggle(p.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DupCard({ p, marked, onToggle }: { p: PhotoRec; marked: boolean; onToggle: () => void }) {
  return (
    <div class={"dupcard" + (marked ? " del" : " keep")} onClick={onToggle} title="クリックで残す/削除">
      <img loading="lazy" src={thumbUrls.value.get(p.id) ?? ""} alt={p.name} />
      <div class="dupcard-meta">
        <span class="dupcard-name">{p.name}</span>
        <span class="hint">
          {p.width}×{p.height}
        </span>
      </div>
      <div class="dupcard-badge">{marked ? "削除" : "★ 残す"}</div>
    </div>
  );
}
