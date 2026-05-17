// ============================================================
//  export-png.js  —  PNG Export
//  Depends on: state.js, tile-engine.js, render.js
// ============================================================

async function exportPNG() {
  try {
    // Build a clean canvas at exact map dimensions (no editor border/frame)
    const exp = document.createElement("canvas");
    exp.width  = offscreen.width;   // COLS * TS
    exp.height = offscreen.height;  // ROWS * TS
    const ectx = exp.getContext("2d");
    ectx.imageSmoothingEnabled = false;

    // 1) Base + overlay tile layers from offscreen buffer
    ectx.drawImage(offscreen, 0, 0);

    // 2) Collect unique spritesheet URLs used by objects
    const objUrls = [...new Set(
      objects
        .map(o => { const d = tileMap.get(o.id); return d?.sheetUrl || null; })
        .filter(Boolean)
    )];

    // Load sheets (network fetch → untainted canvas copy)
    const sheets = new Map();
    await Promise.all(objUrls.map(url =>
      fetch(url)
        .then(r => r.blob())
        .then(blob => {
          const bu = URL.createObjectURL(blob);
          return new Promise(res => {
            const img = new Image();
            img.onload  = () => { sheets.set(url, img); URL.revokeObjectURL(bu); res(); };
            img.onerror = () => { URL.revokeObjectURL(bu); res(); };
            img.src = bu;
          });
        })
        .catch(() => {})
    ));

    // 3) Draw objects on top
    objects.forEach(obj => {
      const def = tileMap.get(obj.id);
      if (def && def.sheetUrl && sheets.has(def.sheetUrl)) {
        const sh = sheets.get(def.sheetUrl);
        ectx.drawImage(
          sh, def.sx, def.sy, def.sw, def.sh,
          obj.x * TS, obj.y * TS, obj.cols * TS, obj.rows * TS
        );
      } else if (obj.img) {
        ectx.drawImage(obj.img, obj.x * TS, obj.y * TS, obj.cols * TS, obj.rows * TS);
      }
    });

    // 4) Download
    const fname = (currentProjectName || "rpg-map").replace(/[^a-zA-Z0-9ა-ჿ_\-]/g, "_");
    exp.toBlob(blob => {
      if (!blob) { toast("❌ PNG: ვერ გამოვიყენეთ (CORS?)"); return; }
      downloadFile(blob, fname + ".png", "image/png");
      toast("🖼 " + fname + ".png — მზადაა!");
    }, "image/png");

  } catch (e) {
    console.error("PNG export error:", e);
    toast("❌ PNG: " + e.message);
  }
}

// ── WINDOW BINDINGS ──
window.exportPNG = exportPNG;
