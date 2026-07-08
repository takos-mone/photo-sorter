/** 商用版のランディング。プロジェクト未作成時に取り込みUIの上に表示する。
 * 初見の人向け: 何ができるか / 3ステップ / プライバシー / 対応環境 / 支援・Pro。
 */
import { MONETIZE, hasDonation, hasProPurchase } from "../config/monetize";

export function Landing() {
  return (
    <div class="landing">
      <section class="hero">
        <h2>
          大量の写真を、<em>顔でパッと自動仕分け。</em>
        </h2>
        <p>
          サークル・部活・イベントの写真を読み込むだけで、写っている人ごとに自動でグループ化。
          名前を付けて、人ごとにZIP保存やフォルダ分けまで一気に終わります。
        </p>
        <p class="privacy-badge">
          🔒 <b>写真がPCの外に送信されることは一切ありません。</b>
          顔認識を含む全処理があなたのブラウザの中だけで完結します（サーバー無し・登録不要）。
        </p>
      </section>

      <section class="steps">
        <div class="step">
          <span class="stepnum">1</span>
          <b>写真を選ぶ</b>
          <p class="hint">フォルダごと、またはファイルを複数選択。JPEG/PNG/HEIC対応。</p>
        </div>
        <div class="step">
          <span class="stepnum">2</span>
          <b>自動で人ごとに分類</b>
          <p class="hint">ブラウザ内の顔認識が「ピープル」に人ごとのグループを作成。間違いはクリックで修正。</p>
        </div>
        <div class="step">
          <span class="stepnum">3</span>
          <b>ZIP保存・フォルダ分け</b>
          <p class="hint">人ごと・イベントごとにまとめてダウンロード。連番リネームも選択可。</p>
        </div>
      </section>

      <p class="hint" style="text-align:center">
        対応環境: PC の Google Chrome / Microsoft Edge（スマートフォン・Safari・Firefoxは非対応）
      </p>

      {(hasDonation() || hasProPurchase()) && (
        <section class="support">
          {hasDonation() && (
            <a class="btn" href={MONETIZE.kofiUrl} target="_blank" rel="noopener noreferrer">
              ☕ 開発を支援する
            </a>
          )}
          {hasProPurchase() && (
            <a class="btn primary" href={MONETIZE.buyProUrl} target="_blank" rel="noopener noreferrer">
              ⭐ Pro版を購入（枚数無制限・確認キュー）
            </a>
          )}
        </section>
      )}
    </div>
  );
}
