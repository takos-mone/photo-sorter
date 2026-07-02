/** ライトボックス: 拡大表示 + 顔枠 + 顔クリックで人の付け替え。 */
import { useEffect, useRef, useState } from "preact/hooks";
import {
  clusterRoot,
  commit,
  corrections,
  effectiveClusters,
  faces,
  lightbox,
  personName,
  photos,
  thumbUrls,
} from "../state/store";
import { visiblePhotos } from "./Grid";

export function Lightbox() {
  const id = lightbox.value;
  const [pickFace, setPickFace] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!lightbox.value) return;
      if (e.key === "Escape") {
        setPickFace(null);
        lightbox.value = null;
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!id) return null;
  const photo = photos.value.find((p) => p.id === id);
  if (!photo) return null;

  const list = visiblePhotos().map((p) => p.id);
  const idx = list.indexOf(id);
  const step = (d: number) => {
    if (!list.length) return;
    setPickFace(null);
    lightbox.value = list[(idx + d + list.length) % list.length];
  };

  const photoFaces = faces.value.filter((f) => f.photoId === id);
  const over = corrections.value.faceOverrides;

  const rootOf = (faceId: string): number => {
    if (over[faceId] !== undefined) return over[faceId] === 0 ? 0 : clusterRoot(over[faceId]);
    for (const c of effectiveClusters.value) if (c.faces.includes(faceId)) return c.id;
    return 0;
  };

  const reassign = (faceId: string, dest: number) => {
    corrections.value = {
      ...corrections.value,
      faceOverrides: { ...over, [faceId]: dest },
    };
    commit();
    setPickFace(null);
    forceRender((n) => n + 1);
  };

  const toggleSkip = () => {
    const skip = { ...corrections.value.skip };
    if (skip[id]) delete skip[id];
    else skip[id] = true;
    corrections.value = { ...corrections.value, skip };
    commit();
    forceRender((n) => n + 1);
  };

  return (
    <div class="lb">
      <div class="lbtop">
        <span>
          {photo.name}（{idx + 1}/{list.length}）
        </span>
        <span class="hint" style="margin-left:auto">
          顔枠クリック=人の修正 ・ ← →=移動 ・ Esc=閉じる
        </span>
        <button class="btn" onClick={() => (lightbox.value = null)}>
          閉じる
        </button>
      </div>
      <div class="lbstage">
        <button class="lbnav lbprev" onClick={() => step(-1)}>
          ‹
        </button>
        <div class="lbwrap">
          <img ref={imgRef} src={thumbUrls.value.get(id) ?? ""} alt={photo.name} />
          {photoFaces.map((f) => {
            const r = rootOf(f.id);
            return (
              <div
                key={f.id}
                class="fbox"
                style={{
                  left: `${f.box[0] * 100}%`,
                  top: `${f.box[1] * 100}%`,
                  width: `${f.box[2] * 100}%`,
                  height: `${f.box[3] * 100}%`,
                }}
                onClick={() => setPickFace(f.id)}
              >
                <span>{r ? personName(r) : "未分類"}</span>
              </div>
            );
          })}
        </div>
        <button class="lbnav lbnext" onClick={() => step(1)}>
          ›
        </button>
      </div>
      <div class="lbbar">
        <button class={"btn" + (corrections.value.skip[id] ? " primary" : "")} onClick={toggleSkip}>
          使わない
        </button>
      </div>

      {pickFace && (
        <div class="modal" onClick={(e) => e.target === e.currentTarget && setPickFace(null)}>
          <div class="sheet">
            <h3 style="margin-top:0">この顔は誰ですか？</h3>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              {effectiveClusters.value.map((c) => (
                <button key={c.id} class="btn" onClick={() => reassign(pickFace, c.id)}>
                  {personName(c.id)}（{c.count}枚）
                </button>
              ))}
              <button class="btn danger" onClick={() => reassign(pickFace, 0)}>
                どの人でもない
              </button>
            </div>
            <p class="hint">修正はこの写真のこの顔だけに適用されます。</p>
          </div>
        </div>
      )}
    </div>
  );
}
