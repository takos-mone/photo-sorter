# Photo Sorter — プロジェクトコンテキスト

最終更新: 2026-07-08

次回このプロジェクトに着手する際は、このファイルを最初に読んで状況を思い出すこと。

## ⭐ 最新状況（2026-07-08）: 商用版を公開済み・稼働中

**1コードベース・2エディション構成**。ビルド時の `VITE_EDITION` で切り替える。**両方とも公開URLで稼働中（HTTP 200確認済み）**:

| | 無料版（部活向け・従来） | 商用版（一般公開・マネタイズ） |
|---|---|---|
| ビルド | `npm run build`（フラグなし） | `VITE_EDITION=pro npm run build` |
| URL | https://takos-mone.github.io/photo-sorter/ ✅稼働中 | https://takos-mone.github.io/photo-sorter-app/ ✅稼働中 |
| ソースリポジトリ | github.com/takos-mone/photo-sorter | 同上（デプロイ用リポジトリは別） |
| デプロイ用リポジトリ | 同上（.github/workflows/deploy.yml） | github.com/takos-mone/photo-sorter-app（.github/workflows/deploy.yml が photo-sorter の main を checkout →`VITE_EDITION=pro`でビルド→Pagesへ） |
| モデル | insightface buffalo_sc（非営利限定） | **YuNet(MIT) + EdgeFace-S(MIT)** = 商用OK |
| 追加UI | なし（従来どおり） | ランディング / ⭐Pro / 確認キュー / 支援ボタン枠 |

### デプロイ済みの確認事項（2026-07-08）
- `gh repo create photo-sorter-app --public --source=. --push` はユーザーが実行（Claude からは公開リポジトリ作成が安全機構でブロックされるため）
- Settings→Pages の Source は「GitHub Actions」に設定済み（`build_type: "workflow"` を `gh api repos/.../pages` で確認）
- `gh workflow run "Build & Deploy Pro Edition" --repo takos-mone/photo-sorter-app` で初回デプロイ実行 → build 23秒 / deploy 8秒で成功
- ライブURLの主要アセットを直接curl検証済み: HTML/OGPメタ、YuNetモデル(232,589 bytes)、EdgeFaceモデル(14,805,514 bytes)、ORT wasm、og-image.jpg すべて200
- **再デプロイ方法**: photo-sorter に push → 手動で `gh workflow run "Build & Deploy Pro Edition" --repo takos-mone/photo-sorter-app`（現状は自動trigger無し。週次cronのみ設定済み、workflow_dispatchで手動実行も可）

### 商用版で実装したもの（すべて実データ検証済み）
- `src/config/edition.ts` — エディション分岐の一元管理（モデル・閾値・機能フラグ・無料枠300枚）
- `src/pipeline/yunet.ts` — YuNet検出器（MIT, 233KB）。クラスタ閾値は pro 用に再調整済み
  （thr0.45/merge0.50/minScore0.8/**minBoxW0.025** — 極小顔が巨大クラスタに癒着する問題を発見し
  サイズフィルタで解決。クラスタ内類似0.461 vs クラスタ間0.192で分離良好）
- EdgeFace-S 埋め込み（MIT, 14.8MB）— ArcFaceと同一前処理なので embedder 実装は共用。
  **処理速度は旧構成の約4.5倍**（56枚: 33秒→7.3秒/WebGPU）
- `src/config/monetize.ts` — **Ko-fi/Gumroad等のURLをここに入れるだけで寄付/購入UIが出現**（空=非表示）
- `src/state/license.ts` — Proライセンス（スタブ検証: PSPRO-形式）。販売開始時に
  Gumroad/LemonSqueezy の LicenseVerifier アダプタ実装へ差し替える
- Pro機能: **確認キュー**（prototype.ts接続、Y/N高速トリアージ）/ **.psortエクスポート・インポート**
  （埋め込み+修正+サムネを1ファイル化）/ 無料枠300枚制限（pro版のみ）
- ランディング（`src/ui/Landing.tsx`）+ OGP + og-image.jpg

### 🔴 次にやること（デプロイは完了。残るはマネタイズの実運用）
1. **外部アカウントの登録**（Ko-fi / Gumroad等、まだ未着手）— ユーザー本人の登録が必要
2. アカウント決定後、`src/config/monetize.ts` にURLを入れて push（自動で寄付/購入UIが出現）
3. Pro販売を始める場合、`src/state/license.ts` の `StubVerifier` を実際の販売プラットフォームの
   ライセンス検証APIを叩く `LicenseVerifier` 実装に差し替える
4. 商用版のUI/文言の見直し（現状は最小限の実装。マーケティング的な調整は未着手）

---

## 1. これは何か / なぜ作ったか

「引退バンド動画作成」プロジェクト（`/Users/takuto/Desktop/引退バンド/引退バンド動画作成/`）で使っていたローカルPython製の写真仕分けツール（顔認識で人ごとに自動グループ化）を、**軽音部の後輩が誰でもURLだけで使える無料Webサービス**として作り直したもの。

- 元ツール: Python + insightface（buffalo_l）+ ローカルHTML。CLIとローカルサーバー経由でしか使えなかった。
- 新ツール: **完全クライアントサイドのWebアプリ**。写真は一切サーバーに送らず、顔認識までブラウザ内（WebAssembly / WebGPU）で完結する。

## 2. 確定している方針（変更していない限り有効）

- **完全ローカル処理**：写真はPCの外に一切出ない。サーバー費用ゼロ。
- **対象ブラウザ**：PCのChrome / Edge（Chromium系）のみ。File System Access APIを使うため、Safari/Firefox/スマホは非対応（案内メッセージ表示）。
- **ホスティング**：GitHub Pages（無料、公開リポジトリ）。
- **収益化はしない（今のところ）**。全構成要素は無料/OSS。ただし直近のやり取りで「友人に試してもらい、良ければ広告付きWeb化 or デスクトップアプリ化」という将来プランが出た（詳細は §7）。

## 3. 技術スタック

- Vite 6 + TypeScript(strict) + Preact + @preact/signals
- **顔認識**: onnxruntime-web（WASM基準、WebGPUがあれば自動で高速化）
  - 検出モデル: `det_500m.onnx`（insightface buffalo_sc = SCRFD-500M）
  - 埋め込みモデル: `w600k_mbf.onnx`（insightface buffalo_sc = MobileFaceNet ArcFace 512次元）
  - モデルは `public/models/` に同梱（計約16MB）
- **重複検出**: 64bit dHash + ハミング距離 + union-find（Canvas上で計算）
- **ZIP**: fflate（ストリーミング、JPEG再圧縮なし）
- **永続化**: IndexedDB（idb）— 写真メタ・顔埋め込み・サムネ・修正状態・フォルダハンドル
- **HEIC対応**: heic2any を遅延ロード（HEICファイルを検出したときだけ読み込む、約1.35MB）
- **EXIF**: 自作の最小パーサ（`src/pipeline/exif.ts`）でDateTimeOriginalを読み、撮影日時ソートに使用

## 4. 重要な技術的決定・見つけたバグ（同じ罠を踏まないために）

- **顔の位置合わせ（アラインメント）のバグ**：初回実装のUmeyama類似変換の閉形式計算が誤っており、全員の顔が1つのクラスタに潰れる不具合があった。標準的なProcrustes解（`src/pipeline/align.ts` の `estimateSimilarity`）に置き換えて解決。実写真56枚でテストし、15人の正しいクラスタに分離することを確認済み。**もし将来クラスタリング精度に問題が出たら、まずこの関数の検証（既知の変換を復元できるか）を疑うこと。**
- **ORT（onnxruntime-web）のwasm読み込み**：Viteのdevサーバーでは `?url` インポートで `.mjs`/`.wasm` を解決しようとすると失敗する（`onnxruntime-web`のpackage.jsonのexportsマップの制約）。`public/ort/` に静的ファイルとして配置し、`ort.env.wasm.wasmPaths = "${baseUrl}ort/"` で読み込む方式が正しい。
- **クラスタのmin-photosフィルタ**：当初 `minPhotos: 3`（3枚未満写っている人はピープルに表示しない）にしていたが、これが「顔は検出されているのにピープルに出ない」問題の原因だった。`minPhotos: 1` に変更し、代わりに「1〜2枚の人を隠す」UIトグルで対応。
- **Undoのリアクティビティ**：`canUndo` がプレーン配列の長さを見ていたため、Preactのsignalsで再描画がトリガーされない不具合があった。`undoDepth` というsignalを別途持つことで解決。
- **プロジェクト復元時にクラスタが空になる**：IndexedDBから顔データを復元しても、クラスタリング結果自体は保存していないため空になっていた。`restoreProject()` で復元時に `clusterFaces()` を再実行するよう修正。

## 5. 実装済み機能（すべて本番ビルドで実データ検証済み）

- 写真の取り込み：フォルダ選択（`showDirectoryPicker`）／複数ファイル直接選択／ドラッグ&ドロップ
- ブラウザ内顔認識 → 人ごとの自動クラスタリング（「ピープル」パネル、代表顔・枚数表示）
- 手動修正：クラスタ統合、名前付け、写真単位の顔の付け替え（ライトボックス内）、Undo
- **ユーザー定義カテゴリ**（イベント別、例:「夏合宿2023」）— ピープルとは独立。作成・リネーム・削除・絞り込み
- **複数選択モード**とアクション：タグ付け／自動振り分け（写っている人の名前をカテゴリとして付与）／ZIP／削除（Undo可）
- **EXIF撮影日時ソート**（名前順 / 撮影日時順の切り替え）
- **重複候補の確認付き削除**：近い写真を組で表示し、最高解像度を既定で残す。確認ダイアログを経てから削除。誤検出は「これは重複ではない」で除外可能
- **HEIC/HEIF対応**（heic2anyで遅延デコード）
- ZIP一括ダウンロード（人ごと／選択写真）、フォルダ書き出し（File System Access API）
- **連番リネームのトグル**：ONで `<名前>_001.jpg` 形式（旧Pythonツールと同じ命名）、OFFで元ファイル名のまま。設定はlocalStorageに保存され次回も維持

## 6. デプロイ状況（2026-07-03時点）

- **公開URL**: https://takos-mone.github.io/photo-sorter/ （HTTP 200、動作確認済み）
- **リポジトリ**: https://github.com/takos-mone/photo-sorter （public）
- **デプロイ方式**: `.github/workflows/deploy.yml` が `main` へのpushで自動ビルド＆デプロイ（GitHub Actions → GitHub Pages）
- GitHub Pages の Settings → Pages → Source は **「GitHub Actions」** に設定済み（これが未設定だと `Ensure GitHub Pages has been enabled` エラーでdeployジョブが失敗する。一度この事象が発生し、設定後に再実行して解決した）
- 最新コミット: `63ae5dd`（連番リネーム機能）。直近4コミットすべてデプロイ成功。

### 再デプロイのやり方（次回作業時の参考）
```bash
cd "/Users/takuto/Desktop/引退バンド/photo-sorter"
# コードを変更したら
git add -A && git commit -m "..."
git push
# または失敗したworkflowを再実行したい場合
gh run list --repo takos-mone/photo-sorter --limit 5
gh run rerun <run-id> --repo takos-mone/photo-sorter
gh run watch <run-id> --repo takos-mone/photo-sorter --exit-status
```

### ローカル動作確認のやり方
```bash
cd "/Users/takuto/Desktop/引退バンド/photo-sorter"
npm run dev          # 開発サーバー（base "/"）
VITE_BASE=/ npm run build && npm run preview   # 本番相当のビルドで確認
```
テスト時は `public/testimg/` に写真を置いて確認していたが、**公開リポジトリには絶対にコミットしないこと**（`.gitignore` で除外済み）。

## 7. ライセンス上の制約（将来の収益化を検討する際に必読）

現在使っている顔認識モデル（insightface buffalo_sc: `det_500m.onnx`, `w600k_mbf.onnx`）は、**重みが「非営利研究用途のみ」ライセンス**（コード自体はMIT）。詳細は `NOTICE.md` に記載済み。

- 現状（無料・非営利で友人に使ってもらう）は問題ない。
- **もし広告を付けて収益化する場合、これは商用利用になりライセンス違反になる。**
- 対応策は設計済み：`src/pipeline/embedder.ts` の `FaceBackend` インターフェースが差し替え可能な構造になっている。MITライセンスの代替（例: `@vladmandic/human` 同梱モデル）に切り替えれば商用利用可能。ただし**認識精度は下がる**（同一人物判定が粗くなり、手動修正の手間が増える）。
- **収益化を具体的に検討し始めた時点で、真っ先にこのモデル差し替えに着手すること。**

## 8. 将来の方向性（2026-07-03時点でユーザーから聞いている計画、未確定）

1. **まず友人（軽音部の後輩）に無料で使ってもらい、フィードバックを収集する。**（現在のURLのまま開始可能）
2. フィードバックを見て「ソフトウェア化が可能」と判断したら、以下のどちらかで進める：
   - **広告付きWebアプリとして正式リリース**（要: モデル差し替え、収益化の実装、GitHub Pages以外のホスティング検討の可能性）
   - **デスクトップアプリとしてリリース**（Tauri等でラップ想定。既に完全クライアントサイドなので移植しやすい。公開リポジトリ必須の制約からも外れるのでモデルの重みを非公開にできる利点あり）
3. ドメインについても質問があった：現状は `https://takos-mone.github.io/photo-sorter/`。無料の範囲でパスを短縮するには、リポジトリ名を `takos-mone.github.io` にリネームする方法がある（1アカウントにつき1つまで）。本当の独自ドメインは有料（年間1,000〜2,000円程度）。**まだ変更していない。**

### 次に着手する時に確認すべきこと
- 友人からのフィードバックの内容（使いやすさ、精度、要望）
- 収益化 or デスクトップ化のどちらに進むか、あるいは両方か
- 収益化するなら、上記§7のモデル差し替えから着手
- ドメインを変えるかどうかの結論

## 9. プロジェクトのファイル構成（要点）

```
photo-sorter/
├── context.md              # このファイル
├── NOTICE.md                # モデルライセンス表記
├── README.md
├── public/models/           # 顔認識モデル（det_500m.onnx, w600k_mbf.onnx）
├── public/ort/               # onnxruntime-web の wasm/mjs（静的配置）
├── src/
│   ├── app.tsx               # メインUI（ツールバー・アクションバー等）
│   ├── state/                # store.ts(signals) / db.ts(IndexedDB) / project.ts(取り込み・復元)
│   ├── pipeline/              # worker.ts / detector.ts / embedder.ts / align.ts / dhash.ts / exif.ts / heic.ts
│   ├── cluster/                # cluster.ts(クラスタリング) / prototype.ts(修正学習フック、未使用・保留)
│   ├── export/                 # zip.ts / writeback.ts
│   └── ui/                     # BrowserGate / Ingest / PeoplePanel / CategoryBar / Grid / Lightbox / TagModal / DedupView
└── .github/workflows/deploy.yml
```

## 10. 未実装・保留中の項目

- **修正学習（プロトタイプ分類）**：`src/cluster/prototype.ts` に設計だけ用意（ユーザーの手動修正から人ごとの平均ベクトルを計算し、未確定の顔を再ランクする）。まだUIに繋いでいない。保留中。
- ドメイン変更（§8参照）
- モデル差し替え（収益化する場合のみ必要）
