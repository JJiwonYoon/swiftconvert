/**
 * ============================================================================
 * LeafConvert Interactive Visual Editors
 * - PDF 전자서명/도장 배치 (SignPdfEditor)
 * - 이미지 자르기/회전/반전 (CropImageEditor)
 * - 이미지 모자이크/블러/가리기 (BlurImageEditor)
 * - EXIF/GPS 메타데이터 미리보기 (ExifInspector)
 * ============================================================================
 */

window.VisualEditors = (function () {
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCanvasNormPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function loadImageForEditor(fileOrBlob) {
    if (window.ConverterEngine && window.ConverterEngine.loadNormalizedImage) {
      return window.ConverterEngine.loadNormalizedImage(fileOrBlob);
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load preview image"));
      };
      img.src = url;
    });
  }

  function buildTransformedCanvas(img, rotDeg, flipH, flipV, maxSide) {
    const rawW = img.naturalWidth || img.width;
    const rawH = img.naturalHeight || img.height;
    const swap = rotDeg === 90 || rotDeg === 270;
    const fullW = swap ? rawH : rawW;
    const fullH = swap ? rawW : rawH;
    const scale = maxSide && Math.max(fullW, fullH) > maxSide ? maxSide / Math.max(fullW, fullH) : 1;

    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(fullW * scale));
    c.height = Math.max(1, Math.round(fullH * scale));
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    const dw = rawW * scale;
    const dh = rawH * scale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return { canvas: c, fullW, fullH };
  }

  function applyMaskRegion(ctx, sourceCanvas, mask) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const rx = Math.round(mask.x * w);
    const ry = Math.round(mask.y * h);
    const rw = Math.max(2, Math.round(mask.w * w));
    const rh = Math.max(2, Math.round(mask.h * h));
    const strength = clamp(Number(mask.strength) || 18, 4, 48);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();

    if (mask.mode === "black") {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(rx, ry, rw, rh);
    } else if (mask.mode === "blur") {
      if ("filter" in ctx) {
        const pxBlur = Math.max(4, Math.round(strength * 0.75 * (w / 700)));
        ctx.filter = `blur(${pxBlur}px)`;
        ctx.drawImage(sourceCanvas, -pxBlur * 0.2, -pxBlur * 0.2, w + pxBlur * 0.4, h + pxBlur * 0.4);
        ctx.filter = "none";
      } else {
        drawPixelatedRegion(ctx, sourceCanvas, rx, ry, rw, rh, strength);
      }
    } else {
      drawPixelatedRegion(ctx, sourceCanvas, rx, ry, rw, rh, strength);
    }
    ctx.restore();
  }

  function drawPixelatedRegion(ctx, sourceCanvas, rx, ry, rw, rh, strength) {
    const cell = Math.max(6, Math.round((strength / 28) * Math.max(12, Math.min(rw, rh) * 0.16)));
    const sw = Math.max(1, Math.round(rw / cell));
    const sh = Math.max(1, Math.round(rh / cell));
    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(sourceCanvas, rx, ry, rw, rh, 0, 0, sw, sh);
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, sw, sh, rx, ry, rw, rh);
    ctx.imageSmoothingEnabled = prevSmooth;
  }

  function stripWhiteBackground(imgOrCanvas) {
    const c = document.createElement("canvas");
    c.width = imgOrCanvas.naturalWidth || imgOrCanvas.width;
    c.height = imgOrCanvas.naturalHeight || imgOrCanvas.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(imgOrCanvas, 0, 0, c.width, c.height);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 224 && d[i + 1] > 224 && d[i + 2] > 224) {
        d[i + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return c.toDataURL("image/png");
  }

  async function mountCropEditor(container, file, labels) {
    const state = {
      rot: 0,
      flipH: false,
      flipV: false,
      ratio: 0,
      crop: { x: 0.08, y: 0.08, w: 0.84, h: 0.84 },
      dragMode: null,
      startPt: null,
      startCrop: null,
      previewCanvas: null,
      fullW: 0,
      fullH: 0
    };

    const img = await loadImageForEditor(file);

    container.innerHTML = `
      <div class="editor-head">
        <strong>✂️ ${escapeHtml(labels.edCropTitle)}</strong>
        <span class="editor-dim-pill" id="cropDimPill"></span>
      </div>
      <div class="editor-toolbar">
        <button type="button" class="ed-btn active" data-ratio="0">${escapeHtml(labels.edRatioFree)}</button>
        <button type="button" class="ed-btn" data-ratio="1">1:1</button>
        <button type="button" class="ed-btn" data-ratio="1.3333">4:3</button>
        <button type="button" class="ed-btn" data-ratio="1.7778">16:9</button>
        <button type="button" class="ed-btn" data-ratio="0.7778">${escapeHtml(labels.edRatioId)}</button>
        <span class="ed-sep"></span>
        <button type="button" class="ed-btn" id="cropRotBtn">↻ 90°</button>
        <button type="button" class="ed-btn" id="cropFlipHBtn">↔</button>
        <button type="button" class="ed-btn" id="cropFlipVBtn">↕</button>
        <button type="button" class="ed-btn" id="cropResetBtn">↺ ${escapeHtml(labels.edReset)}</button>
      </div>
      <div class="editor-canvas-wrap">
        <canvas id="cropEditorCanvas" class="editor-canvas"></canvas>
      </div>
      <div class="editor-hint">${escapeHtml(labels.edCropHint)}</div>
    `;

    const canvas = document.getElementById("cropEditorCanvas");
    const dimPill = document.getElementById("cropDimPill");

    function applyRatioConstraint(rect, ratio, cw, ch) {
      if (!ratio || cw <= 0 || ch <= 0) return rect;
      const pxW = rect.w * cw;
      let nextHNorm = (pxW / ratio) / ch;
      let w = rect.w;
      if (rect.y + nextHNorm > 1) {
        nextHNorm = 1 - rect.y;
        w = clamp((nextHNorm * ch * ratio) / cw, 0.08, 1 - rect.x);
        nextHNorm = (w * cw) / ratio / ch;
      }
      return { x: rect.x, y: rect.y, w, h: clamp(nextHNorm, 0.08, 1 - rect.y) };
    }

    function rebuildSource() {
      const res = buildTransformedCanvas(img, state.rot, state.flipH, state.flipV, 920);
      state.previewCanvas = res.canvas;
      state.fullW = res.fullW;
      state.fullH = res.fullH;
      canvas.width = res.canvas.width;
      canvas.height = res.canvas.height;
      drawCrop();
    }

    function drawCrop() {
      if (!state.previewCanvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(state.previewCanvas, 0, 0);

      const cx = state.crop.x * w;
      const cy = state.crop.y * h;
      const cw = state.crop.w * w;
      const ch = state.crop.h * h;

      ctx.fillStyle = "rgba(15, 23, 42, 0.56)";
      ctx.fillRect(0, 0, w, cy);
      ctx.fillRect(0, cy + ch, w, h - (cy + ch));
      ctx.fillRect(0, cy, cx, ch);
      ctx.fillRect(cx + cw, cy, w - (cx + cw), ch);

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx, cy, cw, ch);

      // Rule of thirds grid
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 1;
      for (let g = 1; g <= 2; g++) {
        ctx.beginPath();
        ctx.moveTo(cx + (cw * g) / 3, cy);
        ctx.lineTo(cx + (cw * g) / 3, cy + ch);
        ctx.moveTo(cx, cy + (ch * g) / 3);
        ctx.lineTo(cx + cw, cy + (ch * g) / 3);
        ctx.stroke();
      }

      // Corner handles
      const hs = 10;
      ctx.fillStyle = "#e5322d";
      [
        [cx, cy],
        [cx + cw, cy],
        [cx, cy + ch],
        [cx + cw, cy + ch]
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        ctx.strokeStyle = "#fff";
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
      });

      const outPxW = Math.max(1, Math.round(state.crop.w * state.fullW));
      const outPxH = Math.max(1, Math.round(state.crop.h * state.fullH));
      if (dimPill) dimPill.textContent = `${outPxW} × ${outPxH} px`;
    }

    container.querySelectorAll("[data-ratio]").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("active", b === btn));
        state.ratio = parseFloat(btn.getAttribute("data-ratio")) || 0;
        if (state.ratio > 0) {
          state.crop = applyRatioConstraint(
            { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
            state.ratio,
            canvas.width,
            canvas.height
          );
          if (state.crop.h >= 0.88) {
            state.crop.w = clamp((0.8 * canvas.height * state.ratio) / canvas.width, 0.08, 0.9);
            state.crop.h = clamp((state.crop.w * canvas.width) / state.ratio / canvas.height, 0.08, 0.9);
          }
          state.crop.x = (1 - state.crop.w) / 2;
          state.crop.y = (1 - state.crop.h) / 2;
        }
        drawCrop();
      });
    });

    document.getElementById("cropRotBtn").addEventListener("click", () => {
      state.rot = (state.rot + 90) % 360;
      rebuildSource();
    });
    document.getElementById("cropFlipHBtn").addEventListener("click", () => {
      state.flipH = !state.flipH;
      rebuildSource();
    });
    document.getElementById("cropFlipVBtn").addEventListener("click", () => {
      state.flipV = !state.flipV;
      rebuildSource();
    });
    document.getElementById("cropResetBtn").addEventListener("click", () => {
      state.rot = 0;
      state.flipH = false;
      state.flipV = false;
      state.crop = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
      rebuildSource();
    });

    function onStart(clientX, clientY) {
      const pt = getCanvasNormPoint(canvas, clientX, clientY);
      const c = state.crop;
      const tol = 0.045;
      const nearBR = Math.abs(pt.x - (c.x + c.w)) < tol && Math.abs(pt.y - (c.y + c.h)) < tol;
      const nearTL = Math.abs(pt.x - c.x) < tol && Math.abs(pt.y - c.y) < tol;
      const inside = pt.x >= c.x && pt.x <= c.x + c.w && pt.y >= c.y && pt.y <= c.y + c.h;

      state.startPt = pt;
      state.startCrop = Object.assign({}, c);
      if (nearBR) state.dragMode = "se";
      else if (nearTL) state.dragMode = "nw";
      else if (inside) state.dragMode = "move";
      else state.dragMode = "new";
    }

    function onMove(clientX, clientY) {
      if (!state.dragMode || !state.startPt) return;
      const pt = getCanvasNormPoint(canvas, clientX, clientY);
      const dx = pt.x - state.startPt.x;
      const dy = pt.y - state.startPt.y;
      const sc = state.startCrop;

      if (state.dragMode === "move") {
        state.crop.x = clamp(sc.x + dx, 0, 1 - sc.w);
        state.crop.y = clamp(sc.y + dy, 0, 1 - sc.h);
      } else if (state.dragMode === "se") {
        const w = clamp(sc.w + dx, 0.08, 1 - sc.x);
        const h = clamp(sc.h + dy, 0.08, 1 - sc.y);
        state.crop = state.ratio > 0 ? applyRatioConstraint({ x: sc.x, y: sc.y, w, h }, state.ratio, canvas.width, canvas.height) : { x: sc.x, y: sc.y, w, h };
      } else if (state.dragMode === "nw") {
        const nx = clamp(sc.x + dx, 0, sc.x + sc.w - 0.08);
        const ny = clamp(sc.y + dy, 0, sc.y + sc.h - 0.08);
        const nw = sc.x + sc.w - nx;
        const nh = sc.y + sc.h - ny;
        state.crop = state.ratio > 0 ? applyRatioConstraint({ x: nx, y: ny, w: nw, h: nh }, state.ratio, canvas.width, canvas.height) : { x: nx, y: ny, w: nw, h: nh };
      } else if (state.dragMode === "new") {
        const x = Math.min(state.startPt.x, pt.x);
        const y = Math.min(state.startPt.y, pt.y);
        const w = Math.max(0.06, Math.abs(pt.x - state.startPt.x));
        const h = Math.max(0.06, Math.abs(pt.y - state.startPt.y));
        state.crop = state.ratio > 0 ? applyRatioConstraint({ x, y, w, h }, state.ratio, canvas.width, canvas.height) : { x, y, w: clamp(w, 0.06, 1 - x), h: clamp(h, 0.06, 1 - y) };
      }
      drawCrop();
    }

    function onEnd() {
      state.dragMode = null;
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      onStart(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
    canvas.addEventListener("pointerup", onEnd);
    canvas.addEventListener("pointercancel", onEnd);

    rebuildSource();
    return {
      getOptions: () => ({
        cropX: state.crop.x,
        cropY: state.crop.y,
        cropW: state.crop.w,
        cropH: state.crop.h,
        cropRotate: state.rot,
        cropFlipH: state.flipH,
        cropFlipV: state.flipV
      })
    };
  }

  async function mountBlurEditor(container, file, labels) {
    const state = {
      mode: "mosaic",
      strength: 20,
      masks: [],
      drawing: false,
      startPt: null,
      draftMask: null,
      previewCanvas: null
    };

    const img = await loadImageForEditor(file);
    const res = buildTransformedCanvas(img, 0, false, false, 960);
    state.previewCanvas = res.canvas;

    container.innerHTML = `
      <div class="editor-head">
        <strong>🕶️ ${escapeHtml(labels.edBlurTitle)}</strong>
        <span class="editor-dim-pill" id="blurCountPill">0</span>
      </div>
      <div class="editor-toolbar">
        <button type="button" class="ed-btn active" data-bmode="mosaic">${escapeHtml(labels.edBlurMosaic)}</button>
        <button type="button" class="ed-btn" data-bmode="blur">${escapeHtml(labels.edBlurSoft)}</button>
        <button type="button" class="ed-btn" data-bmode="black">${escapeHtml(labels.edBlurBlack)}</button>
        <span class="ed-sep"></span>
        <label style="font-size:0.8rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
          ${escapeHtml(labels.edBlurStrength)}
          <input type="range" id="blurStrengthRange" min="8" max="44" value="20" style="width:90px;" />
        </label>
        <button type="button" class="ed-btn" id="blurUndoBtn">↩ ${escapeHtml(labels.edUndo)}</button>
        <button type="button" class="ed-btn" id="blurClearBtn">🗑️ ${escapeHtml(labels.edClear)}</button>
      </div>
      <div class="editor-canvas-wrap">
        <canvas id="blurEditorCanvas" class="editor-canvas"></canvas>
      </div>
      <div class="editor-hint">${escapeHtml(labels.edBlurHint)}</div>
    `;

    const canvas = document.getElementById("blurEditorCanvas");
    const countPill = document.getElementById("blurCountPill");
    canvas.width = state.previewCanvas.width;
    canvas.height = state.previewCanvas.height;

    function redraw() {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(state.previewCanvas, 0, 0);

      const allMasks = state.draftMask ? state.masks.concat([state.draftMask]) : state.masks;
      allMasks.forEach((m) => applyMaskRegion(ctx, state.previewCanvas, m));

      if (state.draftMask) {
        ctx.save();
        ctx.strokeStyle = "#e5322d";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(
          state.draftMask.x * canvas.width,
          state.draftMask.y * canvas.height,
          state.draftMask.w * canvas.width,
          state.draftMask.h * canvas.height
        );
        ctx.restore();
      }
      if (countPill) countPill.textContent = `${state.masks.length} ${labels.edMaskUnit || ""}`.trim();
    }

    container.querySelectorAll("[data-bmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll("[data-bmode]").forEach((b) => b.classList.toggle("active", b === btn));
        state.mode = btn.getAttribute("data-bmode");
      });
    });

    document.getElementById("blurStrengthRange").addEventListener("input", (e) => {
      state.strength = Number(e.target.value) || 20;
    });
    document.getElementById("blurUndoBtn").addEventListener("click", () => {
      state.masks.pop();
      redraw();
    });
    document.getElementById("blurClearBtn").addEventListener("click", () => {
      state.masks = [];
      redraw();
    });

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      state.drawing = true;
      state.startPt = getCanvasNormPoint(canvas, e.clientX, e.clientY);
      state.draftMask = { x: state.startPt.x, y: state.startPt.y, w: 0.01, h: 0.01, mode: state.mode, strength: state.strength };
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.drawing || !state.startPt) return;
      const pt = getCanvasNormPoint(canvas, e.clientX, e.clientY);
      state.draftMask = {
        x: Math.min(state.startPt.x, pt.x),
        y: Math.min(state.startPt.y, pt.y),
        w: Math.max(0.015, Math.abs(pt.x - state.startPt.x)),
        h: Math.max(0.015, Math.abs(pt.y - state.startPt.y)),
        mode: state.mode,
        strength: state.strength
      };
      redraw();
    });
    function finishMask() {
      if (state.drawing && state.draftMask && state.draftMask.w >= 0.02 && state.draftMask.h >= 0.02) {
        state.masks.push(state.draftMask);
      }
      state.drawing = false;
      state.draftMask = null;
      redraw();
    }
    canvas.addEventListener("pointerup", finishMask);
    canvas.addEventListener("pointercancel", finishMask);

    redraw();
    return {
      getOptions: () => ({ blurMasks: state.masks.slice() })
    };
  }

  async function mountSignEditor(container, file, labels) {
    const pages = await window.ConverterEngine.getPdfPageThumbnails(file, { maxPreview: 30, thumbScale: 0.9 });
    const state = {
      signTab: "draw",
      penColor: "#0f172a",
      hasStroke: false,
      uploadedStampDataUrl: "",
      pageIdx: 0,
      applyAll: false,
      xNorm: 0.76,
      yNorm: 0.84,
      widthPct: 24,
      draggingPos: false,
      pagePreviewImg: null
    };

    const pageOptionsHtml = pages
      .map((p, idx) => `<option value="${idx}">${escapeHtml(labels.orgPageLabel)} ${p.pageNumber}</option>`)
      .join("");

    container.innerHTML = `
      <div class="editor-head">
        <strong>✍️ ${escapeHtml(labels.edSignTitle)}</strong>
        <span class="editor-dim-pill">${pages.length} Pages</span>
      </div>
      <div class="sign-editor-grid">
        <div class="sign-pad-col">
          <div class="editor-toolbar">
            <button type="button" class="ed-btn active" data-signtab="draw">${escapeHtml(labels.edSignDrawTab)}</button>
            <button type="button" class="ed-btn" data-signtab="upload">${escapeHtml(labels.edSignUploadTab)}</button>
          </div>
          <div id="signDrawBox">
            <canvas id="signPadCanvas" class="sign-pad-canvas" width="360" height="145"></canvas>
            <div class="editor-toolbar" style="margin-top:8px;">
              <button type="button" class="ed-color active" data-scolor="#0f172a" style="background:#0f172a;" title="Black"></button>
              <button type="button" class="ed-color" data-scolor="#1d4ed8" style="background:#1d4ed8;" title="Blue"></button>
              <button type="button" class="ed-color" data-scolor="#dc2626" style="background:#dc2626;" title="Red"></button>
              <button type="button" class="ed-btn" id="signClearBtn">🗑️ ${escapeHtml(labels.edClear)}</button>
            </div>
          </div>
          <div id="signUploadBox" style="display:none;padding:12px 0;">
            <input type="file" id="signImgInput" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
            <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.82rem;color:var(--text-muted);cursor:pointer;">
              <input type="checkbox" id="signRemoveBgChk" checked />
              <span>${escapeHtml(labels.edSignStripBg)}</span>
            </label>
          </div>
          <div class="sign-controls-mini">
            <label>${escapeHtml(labels.edSignPageLabel)}:
              <select id="signPageSelect">${pageOptionsHtml}</select>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="signApplyAllChk" />
              <span>${escapeHtml(labels.edSignAllPages)}</span>
            </label>
            <label>${escapeHtml(labels.edSignSize)}: <span id="signSizeVal">24%</span>
              <input type="range" id="signWidthRange" min="10" max="45" value="24" />
            </label>
          </div>
        </div>
        <div class="sign-preview-col">
          <div style="font-size:0.8rem;font-weight:700;margin-bottom:6px;color:var(--text-muted);">${escapeHtml(labels.edSignPlaceHint)}</div>
          <canvas id="signPdfPreviewCanvas" class="editor-canvas"></canvas>
        </div>
      </div>
    `;

    const pad = document.getElementById("signPadCanvas");
    const padCtx = pad.getContext("2d");
    padCtx.lineCap = "round";
    padCtx.lineJoin = "round";
    padCtx.lineWidth = 3.2;
    let drawing = false;
    let lastPt = null;

    function getSignatureDataUrl() {
      if (state.signTab === "upload" && state.uploadedStampDataUrl) {
        return state.uploadedStampDataUrl;
      }
      return state.hasStroke ? pad.toDataURL("image/png") : "";
    }

    const previewCanvas = document.getElementById("signPdfPreviewCanvas");
    const stampOverlayImg = new Image();

    function redrawPdfPreview() {
      const pCtx = previewCanvas.getContext("2d");
      if (state.pagePreviewImg) {
        previewCanvas.width = state.pagePreviewImg.naturalWidth || 420;
        previewCanvas.height = state.pagePreviewImg.naturalHeight || 594;
        pCtx.drawImage(state.pagePreviewImg, 0, 0);
      } else {
        previewCanvas.width = 420;
        previewCanvas.height = 594;
        pCtx.fillStyle = "#ffffff";
        pCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      }

      const drawW = (state.widthPct / 100) * previewCanvas.width;
      const sigUrl = getSignatureDataUrl();
      if (sigUrl && stampOverlayImg.src === sigUrl && stampOverlayImg.complete && stampOverlayImg.naturalWidth > 0) {
        const drawH = drawW * (stampOverlayImg.naturalHeight / stampOverlayImg.naturalWidth);
        const dx = clamp(state.xNorm * previewCanvas.width - drawW / 2, 0, previewCanvas.width - drawW);
        const dy = clamp(state.yNorm * previewCanvas.height - drawH / 2, 0, previewCanvas.height - drawH);
        pCtx.drawImage(stampOverlayImg, dx, dy, drawW, drawH);
        pCtx.strokeStyle = "#2563eb";
        pCtx.setLineDash([4, 3]);
        pCtx.strokeRect(dx, dy, drawW, drawH);
        pCtx.setLineDash([]);
      } else {
        const drawH = drawW * 0.4;
        const dx = clamp(state.xNorm * previewCanvas.width - drawW / 2, 0, previewCanvas.width - drawW);
        const dy = clamp(state.yNorm * previewCanvas.height - drawH / 2, 0, previewCanvas.height - drawH);
        pCtx.fillStyle = "rgba(37, 99, 235, 0.14)";
        pCtx.fillRect(dx, dy, drawW, drawH);
        pCtx.strokeStyle = "#2563eb";
        pCtx.setLineDash([4, 3]);
        pCtx.strokeRect(dx, dy, drawW, drawH);
        pCtx.setLineDash([]);
      }
    }

    function syncStampOverlay() {
      const sigUrl = getSignatureDataUrl();
      if (sigUrl) {
        stampOverlayImg.onload = redrawPdfPreview;
        stampOverlayImg.src = sigUrl;
      } else {
        redrawPdfPreview();
      }
    }

    function loadPagePreview(idx) {
      const pg = pages[idx];
      if (pg && pg.thumbUrl) {
        const im = new Image();
        im.onload = () => {
          state.pagePreviewImg = im;
          redrawPdfPreview();
        };
        im.src = pg.thumbUrl;
      } else {
        state.pagePreviewImg = null;
        redrawPdfPreview();
      }
    }

    // Pad drawing events
    pad.addEventListener("pointerdown", (e) => {
      pad.setPointerCapture(e.pointerId);
      drawing = true;
      const r = pad.getBoundingClientRect();
      lastPt = { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
      padCtx.strokeStyle = state.penColor;
      padCtx.beginPath();
      padCtx.moveTo(lastPt.x, lastPt.y);
      padCtx.lineTo(lastPt.x + 0.1, lastPt.y + 0.1);
      padCtx.stroke();
      state.hasStroke = true;
    });
    pad.addEventListener("pointermove", (e) => {
      if (!drawing || !lastPt) return;
      const r = pad.getBoundingClientRect();
      const pt = { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
      padCtx.beginPath();
      padCtx.moveTo(lastPt.x, lastPt.y);
      padCtx.lineTo(pt.x, pt.y);
      padCtx.stroke();
      lastPt = pt;
    });
    const endPad = () => {
      if (drawing) {
        drawing = false;
        syncStampOverlay();
      }
    };
    pad.addEventListener("pointerup", endPad);
    pad.addEventListener("pointercancel", endPad);

    container.querySelectorAll("[data-scolor]").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll("[data-scolor]").forEach((b) => b.classList.toggle("active", b === btn));
        state.penColor = btn.getAttribute("data-scolor");
      });
    });

    document.getElementById("signClearBtn").addEventListener("click", () => {
      padCtx.clearRect(0, 0, pad.width, pad.height);
      state.hasStroke = false;
      syncStampOverlay();
    });

    container.querySelectorAll("[data-signtab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        container.querySelectorAll("[data-signtab]").forEach((b) => b.classList.toggle("active", b === btn));
        state.signTab = btn.getAttribute("data-signtab");
        document.getElementById("signDrawBox").style.display = state.signTab === "draw" ? "block" : "none";
        document.getElementById("signUploadBox").style.display = state.signTab === "upload" ? "block" : "none";
        syncStampOverlay();
      });
    });

    let lastUploadedImg = null;
    async function refreshUploadedStamp() {
      if (!lastUploadedImg) return;
      const stripBg = document.getElementById("signRemoveBgChk").checked;
      if (stripBg) {
        state.uploadedStampDataUrl = stripWhiteBackground(lastUploadedImg);
      } else {
        const c = document.createElement("canvas");
        c.width = lastUploadedImg.naturalWidth || lastUploadedImg.width;
        c.height = lastUploadedImg.naturalHeight || lastUploadedImg.height;
        c.getContext("2d").drawImage(lastUploadedImg, 0, 0);
        state.uploadedStampDataUrl = c.toDataURL("image/png");
      }
      syncStampOverlay();
    }

    document.getElementById("signImgInput").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      lastUploadedImg = await loadImageForEditor(f);
      await refreshUploadedStamp();
    });
    document.getElementById("signRemoveBgChk").addEventListener("change", refreshUploadedStamp);

    document.getElementById("signPageSelect").addEventListener("change", (e) => {
      state.pageIdx = parseInt(e.target.value, 10) || 0;
      loadPagePreview(state.pageIdx);
    });
    document.getElementById("signApplyAllChk").addEventListener("change", (e) => {
      state.applyAll = Boolean(e.target.checked);
    });
    document.getElementById("signWidthRange").addEventListener("input", (e) => {
      state.widthPct = parseInt(e.target.value, 10) || 24;
      document.getElementById("signSizeVal").textContent = `${state.widthPct}%`;
      redrawPdfPreview();
    });

    previewCanvas.addEventListener("pointerdown", (e) => {
      previewCanvas.setPointerCapture(e.pointerId);
      state.draggingPos = true;
      const pt = getCanvasNormPoint(previewCanvas, e.clientX, e.clientY);
      state.xNorm = pt.x;
      state.yNorm = pt.y;
      redrawPdfPreview();
    });
    previewCanvas.addEventListener("pointermove", (e) => {
      if (!state.draggingPos) return;
      const pt = getCanvasNormPoint(previewCanvas, e.clientX, e.clientY);
      state.xNorm = pt.x;
      state.yNorm = pt.y;
      redrawPdfPreview();
    });
    const endPos = () => {
      state.draggingPos = false;
    };
    previewCanvas.addEventListener("pointerup", endPos);
    previewCanvas.addEventListener("pointercancel", endPos);

    loadPagePreview(0);
    return {
      getOptions: () => ({
        signDataUrl: getSignatureDataUrl(),
        signPageIndex: state.pageIdx,
        signAllPages: state.applyAll,
        signX: state.xNorm,
        signY: state.yNorm,
        signWidthPct: state.widthPct
      })
    };
  }

  async function mountExifInspector(container, files, labels) {
    const inspect = window.ConverterEngine && window.ConverterEngine.inspectImageMetadata;
    const reports = [];
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      const info = inspect ? await inspect(files[i]) : { hasMetadata: false, tags: [] };
      reports.push({ file: files[i], info });
    }

    container.innerHTML = `
      <div class="editor-head">
        <strong>🔐 ${escapeHtml(labels.edExifTitle)}</strong>
        <span class="editor-dim-pill">${files.length} Files</span>
      </div>
      <div class="exif-report-list">
        ${reports
          .map(({ file, info }) => {
            const badge = info.hasGps
              ? `<span class="exif-pill warn">📍 ${escapeHtml(labels.edExifGpsWarn)}</span>`
              : info.hasMetadata
              ? `<span class="exif-pill warn">⚠️ ${escapeHtml(labels.edExifFound)} (${info.tags.length})</span>`
              : `<span class="exif-pill safe">✅ ${escapeHtml(labels.edExifClean)}</span>`;
            const details =
              info.tags.length > 0
                ? info.tags
                    .slice(0, 6)
                    .map((t) => `<span class="exif-tag"><strong>${escapeHtml(t.label)}:</strong> ${escapeHtml(t.value)}</span>`)
                    .join("")
                : `<span class="exif-tag">${escapeHtml(labels.edExifNoneDesc)}</span>`;
            return `
              <div class="exif-row">
                <div class="exif-row-top">
                  <strong>${escapeHtml(file.name)}</strong>
                  ${badge}
                </div>
                <div class="exif-tags">${details}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;

    return { getOptions: () => ({}) };
  }

  return {
    applyMaskRegion,
    buildTransformedCanvas,
    mountCropEditor,
    mountBlurEditor,
    mountSignEditor,
    mountExifInspector
  };
})();
