/** アプリ本体: ヘッダー/フィルタ/進捗/ピープル/グリッド/ライトボックス/エクスポート。 */
import { useEffect, useState } from "preact/hooks";
import {
  backend,
  canUndo,
  corrections,
  effectiveClusters,
  filter,
  initError,
  personName,
  phase,
  photos,
  progress,
  selectMode,
  selection,
  undo,
} from "./state/store";
import * as db from "./state/db";
import {
  diffNewFiles,
  listImages,
  regrantPermission,
  restoreProject,
} from "./state/project";
import { photoIdOf } from "./state/project";
import { runPipeline } from "./pipeline/runner";
import { makeZip, downloadBlob, type ZipEntry } from "./export/zip";
import { writeBack } from "./export/writeback";
import { BrowserGate } from "./ui/BrowserGate";
import { Ingest } from "./ui/Ingest";
import { PeoplePanel } from "./ui/PeoplePanel";
import { Grid, visiblePhotos } from "./ui/Grid";
import { Lightbox } from "./ui/Lightbox";

/** ドロップ取り込み時の File 参照（ハンドルなしでもZIP可能に） */
const fileCache = new Map<string, File>();

async function getOriginalFile(photoId: string, name: string): Promise<File | Blob> {
  const cached = fileCache.get(photoId);
  if (cached) return cached;
  const dir = await db.loadDirHandle();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(name);
      return await fh.getFile();
    } catch {
      /* fallthrough */
    }
  }
  const thumb = await db.getThumb(photoId); // 最後の手段: サムネ
  if (thumb) return thumb;
  throw new Error(`元ファイルが見つかりません: ${name}`);
}

export function App() {
  const [reconnect, setReconnect] = useState<{ dirName: string | null } | null>(null);
  const [restored, setRestored] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await restoreProject();
      if (r.hasProject && r.needsPermission) setReconnect({ dirName: r.dirName });
      setRestored(true);
    })();
  }, []);

  const ingest = async (files: File[], _dir: FileSystemDirectoryHandle | null) => {
    for (const f of files) fileCache.set(photoIdOf(f), f);
    await runPipeline(files);
  };

  const doReconnect = async () => {
    const dir = await regrantPermission();
    if (!dir) return;
    setReconnect(null);
    const files = await listImages(dir);
    for (const f of files) fileCache.set(photoIdOf(f), f);
    await runPipeline(diffNewFiles(files, photos.value));
  };

  const zipPhotos = async (photoIds: string[], zipName: string) => {
    const byId = new Map(photos.value.map((p) => [p.id, p]));
    const entries: ZipEntry[] = [];
    const seen = new Set<string>();
    for (const id of photoIds) {
      const p = byId.get(id);
      if (!p || seen.has(id) || corrections.value.skip[id]) continue;
      seen.add(id);
      entries.push({ name: p.name, getFile: () => getOriginalFile(id, p.name) });
    }
    if (!entries.length) {
      alert("対象の写真がありません");
      return;
    }
    setBusyMsg(`⬇️ ${entries.length}枚をZIPにまとめています…`);
    try {
      const blob = await makeZip(entries);
      downloadBlob(blob, `${zipName}.zip`);
      setBusyMsg(`✅ ${entries.length}枚を ${zipName}.zip で保存しました`);
    } catch (e) {
      setBusyMsg(`⚠️ 失敗: ${String(e)}`);
    }
  };

  const zipPerson = (root: number) => {
    const c = effectiveClusters.value.find((c) => c.id === root);
    if (c) void zipPhotos(c.photos, personName(root));
  };

  const zipSelection = () => void zipPhotos([...selection.value], "selected_photos");

  const exportFolders = async () => {
    const named = effectiveClusters.value.filter((c) => corrections.value.peopleLabels[c.id]);
    if (!named.length) {
      alert("先にピープルで名前を付けてください（名前を付けた人だけ書き出します）");
      return;
    }
    const folders = new Map<string, Array<{ name: string; getFile: () => Promise<File | Blob> }>>();
    const byId = new Map(photos.value.map((p) => [p.id, p]));
    for (const c of named) {
      const files = c.photos
        .filter((id) => !corrections.value.skip[id])
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ name: p.name, getFile: () => getOriginalFile(p.id, p.name) }));
      if (files.length) folders.set(personName(c.id), files);
    }
    setBusyMsg("📂 フォルダへ書き出し中…");
    try {
      const res = await writeBack(folders.size ? { folders } : { folders }, (d, t) =>
        setBusyMsg(`📂 書き出し中… ${d}/${t}`),
      );
      const summary = [...res].map(([k, v]) => `${k}: ${v}枚`).join(" / ");
      setBusyMsg(`✅ 書き出し完了 — ${summary}`);
    } catch (e) {
      if (!String(e).includes("AbortError")) setBusyMsg(`⚠️ 失敗: ${String(e)}`);
      else setBusyMsg("");
    }
  };

  const resetAll = async () => {
    if (!confirm("プロジェクトを破棄して最初からやり直しますか？（写真自体は消えません）")) return;
    const { clearAll } = db;
    await clearAll();
    location.reload();
  };

  // Cmd/Ctrl+Z で Undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!restored) return null;
  const hasPhotos = photos.value.length > 0;
  const p = progress.value;
  const f = filter.value;

  return (
    <BrowserGate>
      <header class="appbar">
        <div class="titlerow">
          <h1 class="logo">
            PHOTO <span class="sub">SORTER</span>
          </h1>
          <span class="hint">
            顔で写真を自動仕分け — 写真はPCの外に出ません
            {backend.value && `（エンジン: ${backend.value === "webgpu" ? "WebGPU 高速" : "WASM"}）`}
          </span>
        </div>
        {hasPhotos && (
          <div class="toolbar">
            <div class="seg">
              {(
                [
                  ["all", "すべて"],
                  ["unassigned", "未分類"],
                  ["dup", "重複候補"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  class={f.kind === k ? "on" : ""}
                  onClick={() => (filter.value = { kind: k } as never)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button class="btn" disabled={!canUndo.value} onClick={undo}>
              ↶ 元に戻す
            </button>
            <button
              class={"btn" + (selectMode.value ? " primary" : "")}
              onClick={() => {
                selectMode.value = !selectMode.value;
                if (!selectMode.value) selection.value = new Set();
              }}
            >
              {selectMode.value ? "✓ 選択中（写真をクリック）" : "⬇️ 写真を選んでZIP"}
            </button>
            <button class="btn primary" onClick={exportFolders}>
              📂 人ごとにフォルダ書き出し
            </button>
            <button class="btn danger" onClick={resetAll}>
              最初から
            </button>
            {f.kind === "person" && (
              <span class="hint">表示中: {personName(f.root)} — もう一度👁で解除</span>
            )}
          </div>
        )}
        {busyMsg && <div class="hint" style="margin-top:6px">{busyMsg}</div>}
      </header>

      {initError.value && (
        <div class="progressbox" style="border-color:var(--danger)">
          <b style="color:var(--danger)">⚠️ 顔認識エンジンの初期化に失敗しました</b>
          <p class="hint" style="margin-bottom:0;white-space:pre-wrap">{initError.value}</p>
        </div>
      )}
      {(phase.value === "detecting" || phase.value === "clustering") && (
        <div class="progressbox">
          <b>
            {phase.value === "detecting"
              ? `顔を解析中… ${p.done}/${p.total}`
              : "人ごとにまとめています…"}
          </b>
          <span class="hint" style="margin-left:10px">
            {p.msg}
          </span>
          <div class="bar">
            <i style={{ width: p.total ? `${(p.done / p.total) * 100}%` : "30%" }} />
          </div>
          <p class="hint" style="margin-bottom:0">
            処理中もグリッドは順次更新されます。タブを閉じても再開できます。
          </p>
        </div>
      )}

      {!hasPhotos && phase.value === "idle" ? (
        <Ingest
          onFiles={ingest}
          reconnect={reconnect ? { ...reconnect, onReconnect: doReconnect } : null}
        />
      ) : (
        <>
          {reconnect && (
            <div class="progressbox">
              前回のフォルダ「{reconnect.dirName}」への接続が必要です（ZIP保存・書き出しに使用）。
              <button class="btn primary" style="margin-left:10px" onClick={doReconnect}>
                🔄 再接続
              </button>
            </div>
          )}
          <PeoplePanel onZipPerson={zipPerson} />
          <Grid />
          <Lightbox />
          {selectMode.value && (
            <div class="actionbar">
              <b>{selection.value.size}</b>
              <span class="hint">枚を選択中</span>
              <button
                class="btn"
                onClick={() => {
                  const s = new Set(selection.value);
                  for (const ph of visiblePhotos()) s.add(ph.id);
                  selection.value = s;
                }}
              >
                表示中を全選択
              </button>
              <button class="btn" onClick={() => (selection.value = new Set())}>
                選択クリア
              </button>
              <button class="btn primary" onClick={zipSelection}>
                ⬇️ ZIPでダウンロード
              </button>
              <button
                class="btn"
                style="margin-left:auto"
                onClick={() => {
                  selectMode.value = false;
                  selection.value = new Set();
                }}
              >
                選択モード終了
              </button>
            </div>
          )}
        </>
      )}
    </BrowserGate>
  );
}
