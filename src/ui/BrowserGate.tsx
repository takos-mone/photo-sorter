/** 非対応ブラウザへの案内。File System Access API + OffscreenCanvas を要求。 */
import type { ComponentChildren } from "preact";

export function isSupported(): boolean {
  return (
    typeof window.showDirectoryPicker === "function" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof Worker !== "undefined"
  );
}

export function BrowserGate({ children }: { children: ComponentChildren }) {
  if (isSupported()) return <>{children}</>;
  return (
    <div class="gate">
      <h1 class="logo">
        PHOTO <span class="sub">SORTER</span>
      </h1>
      <p>
        このアプリは <b>PC の Google Chrome / Microsoft Edge</b> でご利用ください。
      </p>
      <p class="hint">
        お使いのブラウザはフォルダ読み込み機能（File System Access API）に対応していません。
        <br />
        Safari・Firefox・スマートフォンは現在サポートしていません。
      </p>
    </div>
  );
}
