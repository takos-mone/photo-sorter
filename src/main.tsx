import { render } from "preact";
import { App } from "./app";
import "./styles.css";

render(<App />, document.getElementById("app")!);

// 自動テスト用フック（dev、または ?__test 付きURLのときのみ有効）
if (import.meta.env.DEV || location.search.includes("__test")) {
  void (async () => {
    const { runPipeline } = await import("./pipeline/runner");
    const { startProject } = await import("./state/project");
    const stores = await import("./state/store");
    const { buildEntries } = await import("./app");
    (window as unknown as Record<string, unknown>).__test = {
      stores,
      buildEntries,
      async diagOrt() {
        const ort = await import("onnxruntime-web");
        const log: string[] = [];
        ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
        ort.env.wasm.numThreads = 1;
        log.push(`wasmPaths=${ort.env.wasm.wasmPaths}`);
        let gpu = "none";
        try {
          const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };
          if (nav.gpu) {
            const ad = await Promise.race([
              nav.gpu.requestAdapter(),
              new Promise((r) => setTimeout(() => r("timeout"), 3000)),
            ]);
            gpu = ad === "timeout" ? "adapter-timeout" : ad ? "adapter-ok" : "no-adapter";
          }
        } catch (e) {
          gpu = `gpu-err:${String(e)}`;
        }
        log.push(`gpu=${gpu}`);
        try {
          const t0 = performance.now();
          const sess = await ort.InferenceSession.create(
            `${import.meta.env.BASE_URL}models/det_500m.onnx`,
            { executionProviders: ["wasm"] },
          );
          log.push(`session ok in ${Math.round(performance.now() - t0)}ms`);
          log.push(`inputs=${sess.inputNames.join(",")} outputs=${sess.outputNames.join(",")}`);
        } catch (e) {
          log.push(`SESSION ERROR: ${String(e)}`);
        }
        return log;
      },
      async ingestUrls(urls: string[]) {
        await startProject(null);
        const files: File[] = [];
        for (const u of urls) {
          const blob = await fetch(u).then((r) => r.blob());
          const name = decodeURIComponent(u.split("/").pop() ?? "photo.jpg");
          files.push(new File([blob], name, { type: blob.type, lastModified: 0 }));
        }
        await runPipeline(files);
        return {
          photos: stores.photos.value.length,
          faces: stores.faces.value.length,
          clusters: stores.clusters.value.map((c) => ({ id: c.id, count: c.count })),
        };
      },
    };
  })();
}
