/** フォルダ選択 / ドラッグ&ドロップの取り込み画面。 */
import { useState } from "preact/hooks";
import { IMAGE_EXTS, listImages, startProject } from "../state/project";

interface Props {
  onFiles: (files: File[], dir: FileSystemDirectoryHandle | null) => void;
  reconnect?: { dirName: string | null; onReconnect: () => void } | null;
}

export function Ingest({ onFiles, reconnect }: Props) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const pickFolder = async () => {
    try {
      const dir = await window.showDirectoryPicker({ id: "photo-sorter-in", mode: "read" });
      setBusy(true);
      await startProject(dir);
      const files = await listImages(dir);
      onFiles(files, dir);
    } catch {
      /* キャンセル */
    } finally {
      setBusy(false);
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const items = [...(e.dataTransfer?.items ?? [])];
    setBusy(true);
    try {
      // フォルダを1つドロップした場合はハンドル取得（再接続可能に）
      if (items.length === 1 && items[0].kind === "file") {
        const h = await items[0].getAsFileSystemHandle();
        if (h && h.kind === "directory") {
          const dir = h as FileSystemDirectoryHandle;
          await startProject(dir);
          onFiles(await listImages(dir), dir);
          return;
        }
      }
      // 複数ファイルドロップ
      const files: File[] = [];
      for (const item of items) {
        const f = item.getAsFile?.();
        if (f && IMAGE_EXTS.test(f.name)) files.push(f);
      }
      if (files.length) {
        await startProject(null);
        onFiles(
          files.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true })),
          null,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {reconnect && (
        <div class="dropzone" style="padding:28px 40px">
          <h2>前回のプロジェクトがあります</h2>
          <p class="hint">
            フォルダ「{reconnect.dirName ?? "（ドロップした写真）"}」の続きから再開できます。
          </p>
          <button class="btn primary" onClick={reconnect.onReconnect}>
            🔄 前回のフォルダを再接続して再開
          </button>
        </div>
      )}
      <div
        class={"dropzone" + (over ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <h2>写真フォルダを選択 / ここにドラッグ&ドロップ</h2>
        <p class="hint">JPEG / PNG / WebP 対応。数百枚でもOK。</p>
        <button class="btn primary" onClick={pickFolder} disabled={busy}>
          📁 フォルダを選択
        </button>
      </div>
      <div class="privacy">
        🔒 写真がPCの外に送信されることは一切ありません。
        <br />
        顔認識を含むすべての処理はブラウザの中だけで実行されます。
      </div>
    </div>
  );
}
