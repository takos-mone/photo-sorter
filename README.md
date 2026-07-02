# Photo Sorter — 顔で写真を自動仕分け

写真を **ブラウザの中だけ** で顔認識し、写っている人ごとに自動でグループ分けする無料ツールです。
軽音部などの大量のイベント写真を、メンバーごとに素早く仕分けするために作りました。

**🔒 写真は PC の外に一切送信されません。** 顔認識を含む全処理がブラウザ内（WebAssembly / WebGPU）で完結します。サーバーもアカウントも不要です。

## 使い方

1. PC の **Google Chrome / Microsoft Edge** で公開URLを開く
2. 写真フォルダを選択（またはドラッグ&ドロップ）
3. 自動で顔を検出し「ピープル」に人ごとのグループが並ぶ
4. 各グループに名前を付ける／間違いを手動修正する
5. 人ごとに **ZIP でダウンロード** または **フォルダへ書き出し**

> Safari・Firefox・スマートフォンは未対応です（フォルダ読み込み機能が使えないため）。

## 主な機能

- **ピープル自動グループ化** — 顔検出（SCRFD）＋顔認識（ArcFace）＋クラスタリング
- **手動修正** — グループの統合、名前付け、写真1枚ごとの顔の付け替え、Undo
- **ZIP 一括ダウンロード** — 人ごと／手動選択した写真をまとめて保存
- **フォルダ書き出し** — 人ごとのサブフォルダへ直接コピー（File System Access API）
- **重複写真の検出** — 近い写真（dHash）をまとめて確認
- **中断・再開** — 処理はいつ止めても、次回フォルダを再接続すれば続きから

## 開発

```bash
npm install
npm run dev        # 開発サーバ（ローカル検証は base "/"）
npm run build      # 本番ビルド（GitHub Pages 向けは VITE_BASE=/photo-sorter/）
npm run typecheck
```

技術スタック: Vite + TypeScript + Preact + onnxruntime-web + fflate + idb。

## デプロイ

`main` ブランチへ push すると GitHub Actions が GitHub Pages へ自動デプロイします
（`.github/workflows/deploy.yml`）。リポジトリの Settings → Pages で「Source: GitHub Actions」を有効にしてください。

## ライセンス

アプリのコードは MIT。顔認識モデルの重みは非営利研究目的で提供されています。詳細は [NOTICE.md](./NOTICE.md) を参照。
