/** Pro モーダル: ライセンス認証・購入導線・Pro機能（エクスポート/インポート）の入口。 */
import { useRef, useState } from "preact/hooks";
import { activateLicense, deactivateLicense, isPro } from "../state/license";
import { MONETIZE, hasProPurchase } from "../config/monetize";
import { exportProject, importProject } from "../export/project";
import { downloadBlob } from "../export/zip";
import { photos } from "../state/store";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export function ProModal({ onClose, onImported }: Props) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activate = async () => {
    setMsg("確認中…");
    const ok = await activateLicense(key);
    setMsg(ok ? "✅ Pro を有効化しました" : "⚠️ キーが正しくありません（PSPRO- で始まるキーを入力）");
  };

  const doExport = async () => {
    setMsg("📦 エクスポート中…");
    try {
      const blob = await exportProject();
      downloadBlob(blob, `photo-sorter-project-${new Date().toISOString().slice(0, 10)}.psort`);
      setMsg(`✅ ${photos.value.length}枚分のプロジェクトを書き出しました`);
    } catch (e) {
      setMsg(`⚠️ 失敗: ${String(e)}`);
    }
  };

  const doImport = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = "";
    if (!f) return;
    if (!confirm("現在のプロジェクトを破棄して、ファイルの内容に置き換えます。よろしいですか？")) return;
    setMsg("📥 インポート中…");
    try {
      const r = await importProject(f);
      setMsg(`✅ 読み込みました（写真${r.photos}枚 / 顔${r.faces}件）。再読み込みします…`);
      setTimeout(() => onImported(), 800);
    } catch (err) {
      setMsg(`⚠️ 失敗: ${String(err)}`);
    }
  };

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" style="max-width:520px">
        <h3 style="margin-top:0">⭐ Photo Sorter Pro</h3>

        {isPro.value ? (
          <>
            <p class="hint">Pro 有効化済み。すべての機能が使えます。</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
              <button class="btn primary" onClick={doExport}>
                📦 プロジェクトをエクスポート (.psort)
              </button>
              <button class="btn" onClick={() => fileRef.current?.click()}>
                📥 インポート
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".psort"
                style="display:none"
                onChange={doImport}
              />
            </div>
            <p class="hint">
              エクスポートには仕分け状態・顔データ・サムネイルが含まれます（元写真は含まれません）。
              別のPCや友人に渡して続きから作業できます。
            </p>
            <button class="btn danger" onClick={() => { deactivateLicense(); setMsg("Pro を無効化しました"); }}>
              ライセンスを解除
            </button>
          </>
        ) : (
          <>
            <ul style="line-height:2;margin:8px 0;padding-left:20px">
              <li>写真枚数 <b>無制限</b>（無料版は1プロジェクト300枚まで）</li>
              <li><b>確認キュー</b> — 似ている顔をY/Nで高速仕分け</li>
              <li><b>プロジェクトの保存・共有</b>（.psortエクスポート/インポート）</li>
            </ul>
            {hasProPurchase() && (
              <a class="btn primary" href={MONETIZE.buyProUrl} target="_blank" rel="noopener noreferrer">
                ライセンスキーを購入
              </a>
            )}
            <div style="display:flex;gap:8px;margin-top:12px">
              <input
                type="text"
                style="flex:1"
                placeholder="ライセンスキー（PSPRO-…）"
                value={key}
                onInput={(e) => setKey((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === "Enter" && activate()}
              />
              <button class="btn primary" onClick={activate} disabled={!key.trim()}>
                有効化
              </button>
            </div>
          </>
        )}

        {msg && <p class="hint" style="margin-top:10px">{msg}</p>}
        <div style="text-align:right;margin-top:10px">
          <button class="btn" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
