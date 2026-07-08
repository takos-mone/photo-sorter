/** マネタイズ設定。外部アカウント（Ko-fi / Gumroad / AdSense 等）が決まったら
 * ここに値を入れるだけで該当UIが有効になる。**空文字のUIは表示されない。**
 *
 * 例:
 *   kofiUrl: "https://ko-fi.com/yourname"
 *   buyProUrl: "https://yourname.gumroad.com/l/photo-sorter-pro"
 */
export const MONETIZE = {
  /** 寄付ボタンのリンク先（Ko-fi / Buy Me a Coffee 等） */
  kofiUrl: "",
  /** Pro ライセンス購入ページ（Gumroad / Lemon Squeezy 等） */
  buyProUrl: "",
  /** AdSense クライアントID（広告導入時。ca-pub-XXXX 形式） */
  adsenseClientId: "",
  /** 問い合わせ先（任意） */
  contactUrl: "",
} as const;

export const hasDonation = (): boolean => MONETIZE.kofiUrl.length > 0;
export const hasProPurchase = (): boolean => MONETIZE.buyProUrl.length > 0;
