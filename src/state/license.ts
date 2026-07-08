/** Pro ライセンスのエンタイトルメント管理。
 *
 * 検証は `LicenseVerifier` インターフェースに委譲する。販売プラットフォーム
 * （Gumroad / Lemon Squeezy 等）が決まったら、そのAPIを叩くアダプタを追加して
 * `verifier` を差し替えるだけでよい。現在はオフラインのフォーマット検証スタブ。
 *
 * 注意: 完全クライアントサイドである以上、ライセンスは「善意の壁」であり
 * 技術的に破れないものではない（ホビー/低価格プロダクトでは一般的な割り切り）。
 */
import { signal } from "@preact/signals";

const LS_KEY = "ps_license_v1";

export interface LicenseVerifier {
  /** キーを検証。有効なら正規化済みキーを返し、無効なら null。 */
  verify(key: string): Promise<string | null>;
}

/** スタブ検証器: `PSPRO-` で始まる 20 文字以上のキーを受け付ける。
 * 販売開始時に Gumroad/Lemon Squeezy の license API アダプタへ差し替える。 */
class StubVerifier implements LicenseVerifier {
  async verify(key: string): Promise<string | null> {
    const k = key.trim().toUpperCase();
    return /^PSPRO-[A-Z0-9-]{14,}$/.test(k) ? k : null;
  }
}

let verifier: LicenseVerifier = new StubVerifier();

export function setVerifier(v: LicenseVerifier): void {
  verifier = v;
}

/** Pro 解錠済みか（リアクティブ） */
export const isPro = signal<boolean>(loadKey() !== null);

function loadKey(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

/** キーを検証して保存。成功なら true。 */
export async function activateLicense(key: string): Promise<boolean> {
  const ok = await verifier.verify(key);
  if (!ok) return false;
  try {
    localStorage.setItem(LS_KEY, ok);
  } catch {
    /* プライベートモード等 */
  }
  isPro.value = true;
  return true;
}

export function deactivateLicense(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  isPro.value = false;
}
