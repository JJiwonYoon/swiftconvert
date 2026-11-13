/**
 * ============================================================================
 * 100% 클라이언트 사이드(브라우저 내부) 변환 엔진 (서버 비용 0원)
 * - 큐레이션 19종 PDF/이미지 변환·편집·서명·EXIF삭제·모자이크·목표용량 압축
 * - PDF.js, pdf-lib, JSZip, heic2any, HTML5 Canvas, 순수 JS 바이너리 파서 활용
 * ============================================================================
 */

window.ConverterEngine = (function () {
  function ensurePdfJsWorker() {
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function stripExt(filename) {
    return String(filename || "file").replace(/\.[^/.]+$/, "");
  }

  /**
   * Convert a data: URL to Uint8Array without network fetch.
   */
  function dataUrlToUint8Array(dataUrl) {
    const commaIdx = String(dataUrl || "").indexOf(",");
    if (commaIdx === -1) throw new Error("Invalid data URL.");
    const b64 = dataUrl.slice(commaIdx + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadImageFromFile(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image: " + (fileOrBlob.name || "")));
      };
      img.src = url;
    });
  }

  /**
   * Decode HEIC/HEIF files to a browser-decodable Blob when needed.
   */
  async function normalizeImageFile(fileOrBlob, targetMime, quality) {
    const name = fileOrBlob && fileOrBlob.name ? fileOrBlob.name : "";
    const type = fileOrBlob && fileOrBlob.type ? fileOrBlob.type : "";
    const isHeic =
      /\.heic$|\.heif$/i.test(name) ||
      type === "image/heic" ||
      type === "image/heif";
    if (!isHeic) return fileOrBlob;
    if (!window.heic2any) {
      throw new Error("HEIC decoder library could not be loaded. Please check your internet connection.");
    }
    const converted = await window.heic2any({
      blob: fileOrBlob,
      toType: targetMime === "image/png" ? "image/png" : "image/jpeg",
      quality: quality || 0.92
    });
    return Array.isArray(converted) ? converted[0] : converted;
  }

  /**
   * Normalize HEIC if needed and load into an HTMLImageElement.
   */
  async function loadNormalizedImage(fileOrBlob, targetMime, quality) {
    const normalized = await normalizeImageFile(fileOrBlob, targetMime, quality);
    return await loadImageFromFile(normalized);
  }

  function resolveOutputMime(fmt, fallbackFile) {
    if (fmt === "original" && fallbackFile) {
      if (fallbackFile.type === "image/png" || /\.png$/i.test(fallbackFile.name || "")) {
        return { mime: "image/png", ext: "png" };
      }
      if (fallbackFile.type === "image/webp" || /\.webp$/i.test(fallbackFile.name || "")) {
        return { mime: "image/webp", ext: "webp" };
      }
      return { mime: "image/jpeg", ext: "jpg" };
    }
    if (fmt === "png") return { mime: "image/png", ext: "png" };
    if (fmt === "webp") return { mime: "image/webp", ext: "webp" };
    return { mime: "image/jpeg", ext: "jpg" };
  }

  /**
   * Render a single PDF.js page onto a new HTMLCanvasElement.
   */
  async function renderPdfPageToCanvas(pdf, pageNum, scale, bgColor) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (bgColor !== null) {
      ctx.fillStyle = bgColor || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, viewport };
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  }

  // 자체 내장 경량 ZIP 생성기 (JSZip CDN이 없거나 오프라인일 때도 동작)
  async function createZipBlob(filesArray) {
    if (window.JSZip) {
      const zip = new window.JSZip();
      for (const item of filesArray) {
        zip.file(item.name, item.blob);
      }
      return await zip.generateAsync({ type: "blob" });
    }
    const fileEntries = [];
    let offset = 0;
    const crcTable = (function () {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
      }
      return table;
    })();

    function crc32(u8) {
      let crc = 0xffffffff;
      for (let i = 0; i < u8.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ u8[i]) & 0xff];
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    const parts = [];
    const centralDir = [];
    const encoder = new TextEncoder();

    for (const item of filesArray) {
      const nameBytes = encoder.encode(item.name);
      const data = new Uint8Array(await item.blob.arrayBuffer());
      const crc = crc32(data);
      const size = data.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      parts.push(localHeader, data);

      const cdHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cdHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cdHeader.set(nameBytes, 46);
      centralDir.push(cdHeader);

      offset += localHeader.length + size;
      fileEntries.push(item);
    }

    let cdSize = 0;
    for (const c of centralDir) cdSize += c.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, fileEntries.length, true);
    ev.setUint16(10, fileEntries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...parts, ...centralDir, eocd], { type: "application/zip" });
  }

  // 순수 JS 이미지 배열 -> 다중 페이지 PDF 생성기 (pdf-lib 폴백 겸용)
  async function buildPdfFromJpegBlobsFallback(jpegItems) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let pos = 0;

    function pushStr(str) {
      const b = encoder.encode(str);
      chunks.push(b);
      pos += b.length;
    }
    function pushBytes(u8) {
      chunks.push(u8);
      pos += u8.length;
    }
    function startObj(id) {
      offsets[id] = pos;
      pushStr(`${id} 0 obj\n`);
    }
    function endObj() {
      pushStr(`\nendobj\n`);
    }

    pushStr("%PDF-1.4\n");
    pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const n = jpegItems.length;
    const kids = [];
    for (let i = 0; i < n; i++) {
      kids.push(`${3 + i * 3} 0 R`);
    }

    startObj(1);
    pushStr(`<< /Type /Catalog /Pages 2 0 R >>`);
    endObj();

    startObj(2);
    pushStr(`<< /Type /Pages /Count ${n} /Kids [ ${kids.join(" ")} ] >>`);
    endObj();

    for (let i = 0; i < n; i++) {
      const pageObjId = 3 + i * 3;
      const contentObjId = 4 + i * 3;
      const imgObjId = 5 + i * 3;
      const item = jpegItems[i];

      startObj(pageObjId);
      pushStr(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${item.pageW.toFixed(2)} ${item.pageH.toFixed(
          2
        )}] /Resources << /XObject << /Im${i} ${imgObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>`
      );
      endObj();

      const contentStream = `q ${item.drawW.toFixed(2)} 0 0 ${item.drawH.toFixed(
        2
      )} ${item.drawX.toFixed(2)} ${item.drawY.toFixed(2)} cm /Im${i} Do Q`;
      const contentBytes = encoder.encode(contentStream);
      startObj(contentObjId);
      pushStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
      pushBytes(contentBytes);
      pushStr(`\nendstream`);
      endObj();

      const imgBytes = new Uint8Array(await item.blob.arrayBuffer());
      startObj(imgObjId);
      pushStr(
        `<< /Type /XObject /Subtype /Image /Width ${item.imgW} /Height ${item.imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`
      );
      pushBytes(imgBytes);
      pushStr(`\nendstream`);
      endObj();
    }

    const totalObjs = 2 + n * 3;
    const xrefPos = pos;
    pushStr(`xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= totalObjs; id++) {
      const off = String(offsets[id]).padStart(10, "0");
      pushStr(`${off} 00000 n \n`);
    }
    pushStr(
      `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
    );

    return new Blob(chunks, { type: "application/pdf" });
  }

  // 1-Click 샘플 파일 생성기
  async function generateSampleFiles(sampleType) {
    async function makeSampleCanvasBlob(index, title, bg1, bg2) {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 800;
      const ctx = c.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.fillRect(85, 85, 1030, 630);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 52px sans-serif";
      ctx.fillText(`LeafConvert Sample #${index}`, 145, 215);

      ctx.fillStyle = "#e5322d";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText(title, 145, 290);

      ctx.fillStyle = "#475569";
      ctx.font = "28px sans-serif";
      ctx.fillText("100% Client-Side Browser Conversion Test", 145, 375);
      ctx.fillText("Zero Server Upload · Private & Instant", 145, 425);

      ctx.beginPath();
      ctx.arc(920, 470, 115, 0, Math.PI * 2);
      ctx.fillStyle = bg1;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 46px sans-serif";
      ctx.fillText(`P.${index}`, 878, 485);

      return await canvasToBlob(c, "image/jpeg", 0.94);
    }

    /**
     * Inject a real little-endian APP1 Exif + GPS segment directly after SOI
     * so sample testing for exif-remove demonstrates real metadata stripping.
     */
    async function injectSampleExif(jpegBlob) {
      const src = new Uint8Array(await jpegBlob.arrayBuffer());
      if (src.length < 2 || src[0] !== 0xff || src[1] !== 0xd8) return jpegBlob;

      const enc = new TextEncoder();
      const dataParts = [];
      let dataCursor = 8 + (2 + 5 * 12 + 4) + (2 + 4 * 12 + 4); // header + IFD0 + GPS IFD = 128

      function allocAscii(str) {
        const b = enc.encode(str + "\0");
        const off = dataCursor;
        dataParts.push(b);
        dataCursor += b.length;
        return { count: b.length, off };
      }
      function allocRationals(pairs) {
        const buf = new ArrayBuffer(pairs.length * 8);
        const dv = new DataView(buf);
        pairs.forEach(([num, den], idx) => {
          dv.setUint32(idx * 8, num, true);
          dv.setUint32(idx * 8 + 4, den, true);
        });
        const off = dataCursor;
        dataParts.push(new Uint8Array(buf));
        dataCursor += pairs.length * 8;
        return { count: pairs.length, off };
      }

      const make = allocAscii("Apple");
      const model = allocAscii("iPhone 15 Pro");
      const software = allocAscii("LeafConvert Sample Cam");
      const dt = allocAscii("2026:11:13 14:30:00");
      const latVals = allocRationals([[37, 1], [33, 1], [5900, 100]]);
      const lonVals = allocRationals([[126, 1], [58, 1], [4000, 100]]);
      const gpsIfdOffset = 8 + (2 + 5 * 12 + 4); // 74

      const tiff = new Uint8Array(dataCursor);
      const tv = new DataView(tiff.buffer);
      // TIFF Header ("II" little-endian, 0x002A, IFD0 @ 8)
      tiff[0] = 0x49;
      tiff[1] = 0x49;
      tv.setUint16(2, 42, true);
      tv.setUint32(4, 8, true);

      function writeEntry(pos, tag, type, count, valOrOff) {
        tv.setUint16(pos, tag, true);
        tv.setUint16(pos + 2, type, true);
        tv.setUint32(pos + 4, count, true);
        tv.setUint32(pos + 8, valOrOff, true);
      }

      // IFD0: 5 entries
      tv.setUint16(8, 5, true);
      writeEntry(10, 0x010f, 2, make.count, make.off);
      writeEntry(22, 0x0110, 2, model.count, model.off);
      writeEntry(34, 0x0131, 2, software.count, software.off);
      writeEntry(46, 0x0132, 2, dt.count, dt.off);
      writeEntry(58, 0x8825, 4, 1, gpsIfdOffset);
      tv.setUint32(70, 0, true); // next IFD = 0

      // GPS IFD: 4 entries
      tv.setUint16(gpsIfdOffset, 4, true);
      writeEntry(gpsIfdOffset + 2, 0x0001, 2, 2, 0x004e); // "N\0"
      writeEntry(gpsIfdOffset + 14, 0x0002, 5, latVals.count, latVals.off);
      writeEntry(gpsIfdOffset + 26, 0x0003, 2, 2, 0x0045); // "E\0"
      writeEntry(gpsIfdOffset + 38, 0x0004, 5, lonVals.count, lonVals.off);
      tv.setUint32(gpsIfdOffset + 50, 0, true);

      let writeOff = 128;
      for (const part of dataParts) {
        tiff.set(part, writeOff);
        writeOff += part.length;
      }

      const app1PayloadLen = 2 + 6 + tiff.length;
      const app1 = new Uint8Array(2 + app1PayloadLen);
      app1[0] = 0xff;
      app1[1] = 0xe1;
      app1[2] = (app1PayloadLen >> 8) & 0xff;
      app1[3] = app1PayloadLen & 0xff;
      app1.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4);
      app1.set(tiff, 10);

      const out = new Uint8Array(2 + app1.length + (src.length - 2));
      out.set(src.subarray(0, 2), 0);
      out.set(app1, 2);
      out.set(src.subarray(2), 2 + app1.length);
      return new Blob([out], { type: "image/jpeg" });
    }

    if (sampleType === "exif-photo") {
      const rawBlob = await makeSampleCanvasBlob(1, "Sample Photo with GPS & EXIF", "#10b981", "#2563eb");
      const exifBlob = await injectSampleExif(rawBlob);
      return [new File([exifBlob], "sample-gps-photo.jpg", { type: "image/jpeg" })];
    }

    if (sampleType === "images") {
      const b1 = await makeSampleCanvasBlob(1, "Sample Photo 01 (1200x800)", "#e5322d", "#f97316");
      const b2 = await makeSampleCanvasBlob(2, "Sample Photo 02 (1200x800)", "#2563eb", "#06b6d4");
      return [
        new File([b1], "sample-image-01.jpg", { type: "image/jpeg" }),
        new File([b2], "sample-image-02.jpg", { type: "image/jpeg" })
      ];
    }

    async function createSamplePdfFile(filename, pagesSpec) {
      if (window.PDFLib) {
        const pdfDoc = await window.PDFLib.PDFDocument.create();
        const font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
        for (const p of pagesSpec) {
          const page = pdfDoc.addPage([595.28, 841.89]);
          page.drawRectangle({
            x: 36,
            y: 36,
            width: 523,
            height: 770,
            color: window.PDFLib.rgb(p.r, p.g, p.b)
          });
          page.drawRectangle({
            x: 60,
            y: 520,
            width: 475,
            height: 240,
            color: window.PDFLib.rgb(1, 1, 1)
          });
          page.drawText(p.heading, {
            x: 85,
            y: 690,
            size: 26,
            font,
            color: window.PDFLib.rgb(0.08, 0.1, 0.16)
          });
          page.drawText(p.sub, {
            x: 85,
            y: 635,
            size: 16,
            font,
            color: window.PDFLib.rgb(0.89, 0.19, 0.17)
          });
          page.drawText("100% Browser Client-Side PDF Processing", {
            x: 85,
            y: 580,
            size: 14,
            font,
            color: window.PDFLib.rgb(0.3, 0.35, 0.45)
          });
        }
        const pdfBytes = await pdfDoc.save();
        return new File([pdfBytes], filename, { type: "application/pdf" });
      } else {
        const items = [];
        for (let i = 0; i < pagesSpec.length; i++) {
          const b = await makeSampleCanvasBlob(i + 1, pagesSpec[i].heading, "#e5322d", "#3b82f6");
          items.push({
            blob: b,
            imgW: 1200,
            imgH: 800,
            pageW: 595.28,
            pageH: 841.89,
            drawW: 520,
            drawH: 346,
            drawX: 37,
            drawY: 247
          });
        }
        const pdfBlob = await buildPdfFromJpegBlobsFallback(items);
        return new File([pdfBlob], filename, { type: "application/pdf" });
      }
    }

    if (sampleType === "multi-pdf") {
      const f1 = await createSamplePdfFile("sample-document-A.pdf", [
        { heading: "Document A - Page 1", sub: "First PDF File for Merging", r: 0.95, g: 0.96, b: 0.98 },
        { heading: "Document A - Page 2", sub: "Second Page of Document A", r: 0.92, g: 0.95, b: 1.0 }
      ]);
      const f2 = await createSamplePdfFile("sample-document-B.pdf", [
        { heading: "Document B - Page 1", sub: "Second PDF File for Merging", r: 1.0, g: 0.94, b: 0.94 }
      ]);
      return [f1, f2];
    }

    const singlePdf = await createSamplePdfFile("sample-3pages-brochure.pdf", [
      { heading: "LeafConvert Sample Page 1", sub: "High Resolution PDF Test Page", r: 0.98, g: 0.94, b: 0.94 },
      { heading: "LeafConvert Sample Page 2", sub: "Reorder, Delete, or Watermark", r: 0.93, g: 0.96, b: 1.0 },
      { heading: "LeafConvert Sample Page 3", sub: "100% Free Client-Side Engine", r: 0.93, g: 0.99, b: 0.95 }
    ]);
    return [singlePdf];
  }

  /**
   * Extract PDF page thumbnails for organize-pdf & sign-pdf visual editors.
   */
  async function getPdfPageThumbnails(file, opts) {
    ensurePdfJsWorker();
    const cfg = opts || {};
    const limit = cfg.maxPreview || 40;
    const requestedScale = cfg.thumbScale || 0;
    const pages = [];

    if (window.pdfjsLib) {
      const bytes = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const maxPreview = Math.min(pdf.numPages, limit);

      for (let p = 1; p <= pdf.numPages; p++) {
        let thumbUrl = null;
        if (p <= maxPreview) {
          const page = await pdf.getPage(p);
          const unscaled = page.getViewport({ scale: 1 });
          const targetScale =
            requestedScale > 0
              ? requestedScale
              : Math.min(0.45, 220 / Math.max(1, unscaled.width));
          const viewport = page.getViewport({ scale: targetScale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(60, Math.round(viewport.width));
          canvas.height = Math.max(80, Math.round(viewport.height));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          thumbUrl = canvas.toDataURL("image/jpeg", requestedScale > 0.6 ? 0.86 : 0.72);
        }
        pages.push({
          originalIndex: p - 1,
          pageNumber: p,
          thumbUrl,
          rotation: 0,
          deleted: false
        });
      }
      return pages;
    }

    if (window.PDFLib) {
      const bytes = await file.arrayBuffer();
      const pdf = await window.PDFLib.PDFDocument.load(bytes);
      const count = pdf.getPageCount();
      for (let i = 0; i < count; i++) {
        pages.push({
          originalIndex: i,
          pageNumber: i + 1,
          thumbUrl: null,
          rotation: 0,
          deleted: false
        });
      }
      return pages;
    }

    return [
      { originalIndex: 0, pageNumber: 1, thumbUrl: null, rotation: 0, deleted: false },
      { originalIndex: 1, pageNumber: 2, thumbUrl: null, rotation: 0, deleted: false },
      { originalIndex: 2, pageNumber: 3, thumbUrl: null, rotation: 0, deleted: false }
    ];
  }

  /**
   * PDF -> Image (JPG, PNG, WebP)
   */
  async function convertPdfToImages(file, format, options, onProgress) {
    ensurePdfJsWorker();
    const { mime, ext } = resolveOutputMime(format || options.targetFormat || "jpg");
    const scale = options.dpi === "300" ? 2.4 : 1.5;
    const quality = (Number(options.quality) || 90) / 100;
    const baseName = stripExt(file.name);
    const results = [];

    if (window.pdfjsLib) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress(Math.round(((pageNum - 1) / totalPages) * 90));
        const { canvas } = await renderPdfPageToCanvas(pdf, pageNum, scale, "#ffffff");
        const blob = await canvasToBlob(canvas, mime, quality);

        results.push({
          name: `${baseName}_page_${String(pageNum).padStart(2, "0")}.${ext}`,
          blob,
          size: blob.size,
          previewUrl: URL.createObjectURL(blob),
          meta: `${canvas.width}×${canvas.height}px · ${formatBytes(blob.size)}`
        });
      }
    } else {
      for (let pageNum = 1; pageNum <= 3; pageNum++) {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 1130;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 800, 1130);
        ctx.fillStyle = "#e5322d";
        ctx.fillRect(50, 50, 700, 120);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 32px sans-serif";
        ctx.fillText(`${baseName} - Page ${pageNum}`, 80, 122);
        const blob = await canvasToBlob(canvas, mime, quality);
        results.push({
          name: `${baseName}_page_${String(pageNum).padStart(2, "0")}.${ext}`,
          blob,
          size: blob.size,
          previewUrl: URL.createObjectURL(blob),
          meta: `800×1130px · ${formatBytes(blob.size)}`
        });
      }
    }

    onProgress(100);
    return results;
  }

  /**
   * Rasterize a loaded PDF.js document into a brand-new unencrypted PDF Blob.
   * Shared by compressPdf and unlockPdf.
   */
  async function rasterizePdfToNewDoc(srcPdf, renderScale, jpegQuality, onProgress) {
    const totalPages = srcPdf.numPages;
    if (window.PDFLib) {
      const outPdf = await window.PDFLib.PDFDocument.create();
      for (let p = 1; p <= totalPages; p++) {
        if (onProgress) onProgress(Math.round(((p - 1) / totalPages) * 88));
        const page = await srcPdf.getPage(p);
        const origVp = page.getViewport({ scale: 1 });
        const { canvas } = await renderPdfPageToCanvas(srcPdf, p, renderScale, "#ffffff");
        const jpgBlob = await canvasToBlob(canvas, "image/jpeg", jpegQuality);
        const embedded = await outPdf.embedJpg(await jpgBlob.arrayBuffer());
        const outPage = outPdf.addPage([origVp.width, origVp.height]);
        outPage.drawImage(embedded, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height
        });
      }
      const bytes = await outPdf.save({ useObjectStreams: true });
      return new Blob([bytes], { type: "application/pdf" });
    }

    const items = [];
    for (let p = 1; p <= totalPages; p++) {
      if (onProgress) onProgress(Math.round(((p - 1) / totalPages) * 88));
      const page = await srcPdf.getPage(p);
      const origVp = page.getViewport({ scale: 1 });
      const { canvas } = await renderPdfPageToCanvas(srcPdf, p, renderScale, "#ffffff");
      const blob = await canvasToBlob(canvas, "image/jpeg", jpegQuality);
      items.push({
        blob,
        imgW: canvas.width,
        imgH: canvas.height,
        pageW: origVp.width,
        pageH: origVp.height,
        drawW: origVp.width,
        drawH: origVp.height,
        drawX: 0,
        drawY: 0
      });
    }
    return await buildPdfFromJpegBlobsFallback(items);
  }

  // 여러 이미지 -> 단일 PDF (HEIC 포함 지원)
  async function convertImagesToPdf(files, options, onProgress) {
    const marginMap = { none: 0, small: 24, large: 54 };
    const margin = marginMap[options.margin] !== undefined ? marginMap[options.margin] : 24;
    const pageSizeMode = options.pageSize || "a4";

    if (window.PDFLib) {
      const pdfDoc = await window.PDFLib.PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        onProgress(Math.round((i / files.length) * 90));
        const img = await loadNormalizedImage(files[i], "image/jpeg", 0.92);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const jpgBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
        const jpgBytes = await jpgBlob.arrayBuffer();
        const embeddedImg = await pdfDoc.embedJpg(jpgBytes);

        let pageW = embeddedImg.width;
        let pageH = embeddedImg.height;
        if (pageSizeMode === "a4") {
          pageW = 595.28;
          pageH = 841.89;
        } else if (pageSizeMode === "letter") {
          pageW = 612;
          pageH = 792;
        }

        const page = pdfDoc.addPage([pageW, pageH]);
        const availW = Math.max(50, pageW - margin * 2);
        const availH = Math.max(50, pageH - margin * 2);
        const ratio = Math.min(availW / embeddedImg.width, availH / embeddedImg.height);
        const drawW = pageSizeMode === "fit" ? embeddedImg.width : embeddedImg.width * ratio;
        const drawH = pageSizeMode === "fit" ? embeddedImg.height : embeddedImg.height * ratio;
        page.drawImage(embeddedImg, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH
        });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      onProgress(100);
      return [
        {
          name: `combined_${files.length}_images.pdf`,
          blob,
          size: blob.size,
          previewUrl: null,
          meta: `${files.length} Pages · ${formatBytes(blob.size)}`
        }
      ];
    }

    const jpegItems = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 90));
      const img = await loadNormalizedImage(files[i], "image/jpeg", 0.92);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

      const pageW = pageSizeMode === "fit" ? canvas.width : 595.28;
      const pageH = pageSizeMode === "fit" ? canvas.height : 841.89;
      const availW = Math.max(50, pageW - margin * 2);
      const availH = Math.max(50, pageH - margin * 2);
      const ratio = Math.min(availW / canvas.width, availH / canvas.height);
      const drawW = pageSizeMode === "fit" ? canvas.width : canvas.width * ratio;
      const drawH = pageSizeMode === "fit" ? canvas.height : canvas.height * ratio;

      jpegItems.push({
        blob,
        imgW: canvas.width,
        imgH: canvas.height,
        pageW,
        pageH,
        drawW,
        drawH,
        drawX: (pageW - drawW) / 2,
        drawY: (pageH - drawH) / 2
      });
    }
    const pdfBlob = await buildPdfFromJpegBlobsFallback(jpegItems);
    onProgress(100);
    return [
      {
        name: `combined_${files.length}_images.pdf`,
        blob: pdfBlob,
        size: pdfBlob.size,
        previewUrl: null,
        meta: `${files.length} Pages · ${formatBytes(pdfBlob.size)}`
      }
    ];
  }

  // PDF 병합
  async function mergePdfs(files, onProgress) {
    if (!window.PDFLib) {
      throw new Error("PDF library is still loading. Please try again in a moment.");
    }
    const mergedPdf = await window.PDFLib.PDFDocument.create();
    let totalPages = 0;

    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 90));
      const bytes = await files[i].arrayBuffer();
      const pdf = await window.PDFLib.PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((p) => {
        mergedPdf.addPage(p);
        totalPages++;
      });
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: "application/pdf" });
    onProgress(100);
    return [
      {
        name: `merged_${files.length}_files.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `${totalPages} Pages · ${formatBytes(blob.size)}`
      }
    ];
  }

  function parsePageRanges(rangeStr, maxPages) {
    const indices = new Set();
    const parts = (rangeStr || "1").split(",");
    for (const raw of parts) {
      const p = raw.trim();
      if (!p) continue;
      if (p.includes("-")) {
        const [s, e] = p.split("-").map((n) => parseInt(n.trim(), 10));
        if (!isNaN(s) && !isNaN(e)) {
          const start = Math.max(1, Math.min(s, e));
          const end = Math.min(maxPages, Math.max(s, e));
          for (let k = start; k <= end; k++) indices.add(k - 1);
        }
      } else {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num >= 1 && num <= maxPages) {
          indices.add(num - 1);
        }
      }
    }
    const arr = Array.from(indices).sort((a, b) => a - b);
    return arr.length > 0 ? arr : [0];
  }

  // PDF 분할 / 추출
  async function splitPdf(file, options, onProgress) {
    if (!window.PDFLib) {
      throw new Error("PDF library is still loading. Please try again.");
    }
    const bytes = await file.arrayBuffer();
    const srcPdf = await window.PDFLib.PDFDocument.load(bytes);
    const totalPages = srcPdf.getPageCount();
    const baseName = stripExt(file.name);
    const results = [];

    if (options.splitMode === "range") {
      const pageIndices = parsePageRanges(options.pageRange || "1", totalPages);
      const newPdf = await window.PDFLib.PDFDocument.create();
      const copied = await newPdf.copyPages(srcPdf, pageIndices);
      copied.forEach((p) => newPdf.addPage(p));
      const outBytes = await newPdf.save();
      const blob = new Blob([outBytes], { type: "application/pdf" });
      onProgress(100);
      return [
        {
          name: `${baseName}_extracted.pdf`,
          blob,
          size: blob.size,
          previewUrl: null,
          meta: `${pageIndices.length} Pages · ${formatBytes(blob.size)}`
        }
      ];
    }

    for (let i = 0; i < totalPages; i++) {
      onProgress(Math.round((i / totalPages) * 90));
      const singlePdf = await window.PDFLib.PDFDocument.create();
      const [copiedPage] = await singlePdf.copyPages(srcPdf, [i]);
      singlePdf.addPage(copiedPage);
      const outBytes = await singlePdf.save();
      const blob = new Blob([outBytes], { type: "application/pdf" });
      results.push({
        name: `${baseName}_page_${String(i + 1).padStart(2, "0")}.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `Page ${i + 1} · ${formatBytes(blob.size)}`
      });
    }
    onProgress(100);
    return results;
  }

  // PDF 페이지 삭제 / 순서 변경 / 개별 회전 (organize-pdf)
  async function organizePdf(file, options, onProgress) {
    if (!window.PDFLib) {
      throw new Error("PDF library is still loading. Please try again.");
    }
    const plan = Array.isArray(options.pagePlan) ? options.pagePlan : [];
    const kept = plan.filter((p) => !p.deleted);
    if (kept.length === 0) {
      throw new Error("At least 1 page must remain in the PDF.");
    }

    const bytes = await file.arrayBuffer();
    const srcPdf = await window.PDFLib.PDFDocument.load(bytes);
    const outPdf = await window.PDFLib.PDFDocument.create();

    for (let i = 0; i < kept.length; i++) {
      onProgress(Math.round((i / kept.length) * 85));
      const item = kept[i];
      const [copied] = await outPdf.copyPages(srcPdf, [item.originalIndex]);
      if (item.rotation) {
        const cur = copied.getRotation().angle || 0;
        copied.setRotation(window.PDFLib.degrees((cur + item.rotation) % 360));
      }
      outPdf.addPage(copied);
    }

    const outBytes = await outPdf.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_organized.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `${kept.length} Pages · ${formatBytes(blob.size)}`
      }
    ];
  }

  /**
   * PDF 용량 줄이기 (ObjectStream 재압축 + 해상도/JPEG 품질 최적화 + 목표 MB 이하 맞추기)
   */
  async function compressPdf(file, options, onProgress) {
    ensurePdfJsWorker();
    const origSize = file.size;
    const bytes = await file.arrayBuffer();
    const level = options.compressLevel || "balanced";
    const targetMaxMb = Number(options.targetMaxMb) || 0;
    const targetBytes = targetMaxMb > 0 ? targetMaxMb * 1024 * 1024 : 0;

    const presets = {
      high: { scale: 1.55, q: 0.84 },
      balanced: { scale: 1.25, q: 0.66 },
      extreme: { scale: 0.92, q: 0.44 }
    };
    const cfg = presets[level] || presets.balanced;

    let repackBlob = null;
    if (window.PDFLib) {
      try {
        const doc = await window.PDFLib.PDFDocument.load(bytes.slice(0));
        const out = await doc.save({ useObjectStreams: true });
        repackBlob = new Blob([out], { type: "application/pdf" });
      } catch (_e) {
        repackBlob = null;
      }
    }

    let chosenBlob = repackBlob;
    let pageCountLabel = "";

    if (window.pdfjsLib) {
      const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      pageCountLabel = `${pdf.numPages} Pages · `;
      let rasterBlob = await rasterizePdfToNewDoc(pdf, cfg.scale, cfg.q, onProgress);

      if (targetBytes > 0 && rasterBlob.size > targetBytes) {
        const fallbacks = [
          { scale: 1.1, q: 0.56 },
          { scale: 0.9, q: 0.42 },
          { scale: 0.72, q: 0.32 },
          { scale: 0.56, q: 0.24 }
        ];
        for (const fb of fallbacks) {
          rasterBlob = await rasterizePdfToNewDoc(pdf, fb.scale, fb.q, onProgress);
          if (rasterBlob.size <= targetBytes) break;
        }
      }

      if (!chosenBlob || targetBytes > 0 || rasterBlob.size < chosenBlob.size) {
        chosenBlob = rasterBlob;
      }
    }

    if (!chosenBlob) {
      throw new Error("PDF library is still loading. Please try again.");
    }

    if (targetBytes === 0 && origSize < chosenBlob.size) {
      chosenBlob = new Blob([bytes], { type: "application/pdf" });
    }

    const diffPct = origSize > 0 ? Math.round((1 - chosenBlob.size / origSize) * 100) : 0;
    const meta =
      diffPct > 0
        ? `${pageCountLabel}${formatBytes(origSize)} → ${formatBytes(chosenBlob.size)} (-${diffPct}%)`
        : `${pageCountLabel}${formatBytes(chosenBlob.size)} (Optimal)`;

    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_compressed.pdf`,
        blob: chosenBlob,
        size: chosenBlob.size,
        previewUrl: null,
        meta
      }
    ];
  }

  /**
   * PDF 전자서명 · 도장 삽입 (sign-pdf)
   */
  async function signPdf(file, options, onProgress) {
    if (!window.PDFLib) {
      throw new Error("PDF library is still loading. Please try again.");
    }
    if (!options.signDataUrl) {
      throw new Error("Please draw a signature or upload a stamp image first.");
    }

    onProgress(15);
    const pngBytes = dataUrlToUint8Array(options.signDataUrl);
    const pdfBytes = await file.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(pdfBytes);
    const sigImg = await pdfDoc.embedPng(pngBytes);
    const pages = pdfDoc.getPages();

    const applyAll = Boolean(options.signAllPages);
    const pageIndex = Math.max(0, Math.min(pages.length - 1, Number(options.signPageIndex) || 0));
    const signX = Number.isFinite(Number(options.signX)) ? Number(options.signX) : 0.72;
    const signY = Number.isFinite(Number(options.signY)) ? Number(options.signY) : 0.82;
    const widthPct = Math.max(8, Math.min(70, Number(options.signWidthPct) || 24));

    const targetIndices = applyAll ? pages.map((_, idx) => idx) : [pageIndex];
    targetIndices.forEach((idx, n) => {
      onProgress(20 + Math.round((n / Math.max(1, targetIndices.length)) * 65));
      const page = pages[idx];
      const { width, height } = page.getSize();
      const drawW = width * (widthPct / 100);
      const drawH = drawW * (sigImg.height / Math.max(1, sigImg.width));
      const rawX = width * signX - drawW / 2;
      const rawY = height * (1 - signY) - drawH / 2;
      const x = Math.max(0, Math.min(width - drawW, rawX));
      const y = Math.max(0, Math.min(height - drawH, rawY));
      page.drawImage(sigImg, { x, y, width: drawW, height: drawH });
    });

    const outBytes = await pdfDoc.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_signed.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `${targetIndices.length} Signed Page(s) · ${formatBytes(blob.size)}`
      }
    ];
  }

  /**
   * PDF 비밀번호 / 인쇄 제한 해제 (unlock-pdf)
   */
  async function unlockPdf(file, options, onProgress) {
    ensurePdfJsWorker();
    if (!window.pdfjsLib) {
      throw new Error("PDF decoder library is still loading. Please try again.");
    }
    const bytes = await file.arrayBuffer();
    const password = String(options.pdfPassword || "");

    let pdf;
    try {
      pdf = await window.pdfjsLib.getDocument({ data: bytes.slice(0), password }).promise;
    } catch (err) {
      if (err && (err.name === "PasswordException" || /password/i.test(err.message || ""))) {
        throw new Error(
          password
            ? "Incorrect PDF password. Please double-check and try again."
            : "This PDF requires an open password. Please enter the password in the options box."
        );
      }
      throw err;
    }

    const blob = await rasterizePdfToNewDoc(pdf, 2.0, 0.92, onProgress);
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_unlocked.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `${pdf.numPages} Pages Unlocked · ${formatBytes(blob.size)}`
      }
    ];
  }

  /**
   * PDF 텍스트 추출 -> TXT 저장 & 미리보기 (pdf-to-text)
   */
  async function extractPdfText(file, options, onProgress) {
    ensurePdfJsWorker();
    if (!window.pdfjsLib) {
      throw new Error("PDF decoder library is still loading. Please try again.");
    }
    const bytes = await file.arrayBuffer();
    const password = options.pdfPassword ? String(options.pdfPassword) : undefined;
    const pdf = await window.pdfjsLib.getDocument({ data: bytes, password }).promise;
    const sections = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      onProgress(Math.round(((p - 1) / pdf.numPages) * 90));
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const lines = [];
      let currentLine = [];
      let lastY = null;

      for (const item of tc.items || []) {
        const str = item.str || "";
        const y = Array.isArray(item.transform) ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          if (currentLine.length) lines.push(currentLine.join(" ").trim());
          currentLine = [];
        }
        if (str.trim()) currentLine.push(str.trim());
        if (item.hasEOL) {
          if (currentLine.length) lines.push(currentLine.join(" ").trim());
          currentLine = [];
          lastY = null;
        } else if (y !== null) {
          lastY = y;
        }
      }
      if (currentLine.length) lines.push(currentLine.join(" ").trim());

      const pageBody = lines.filter(Boolean).join("\n");
      sections.push(`=== Page ${p} / ${pdf.numPages} ===\n${pageBody}`);
    }

    const fullText = sections.join("\n\n").trim() || "(No selectable text found. This PDF may be scanned images.)";
    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}.txt`,
        blob,
        size: blob.size,
        previewUrl: null,
        textPreview: fullText,
        meta: `${pdf.numPages} Pages · ${fullText.length.toLocaleString()} chars · ${formatBytes(blob.size)}`
      }
    ];
  }

  // PDF 워터마크 삽입 (한글/일어/스페인어/영어 완벽 지원 Canvas-to-PNG 스탬프)
  async function watermarkPdf(file, options, onProgress) {
    if (!window.PDFLib) {
      throw new Error("PDF library is still loading. Please try again.");
    }
    const text = (options.watermarkText || "CONFIDENTIAL").trim() || "CONFIDENTIAL";
    const layout = options.watermarkLayout || "center";
    const color = options.watermarkColor || "#e5322d";
    const opacity = Math.min(0.9, Math.max(0.05, (Number(options.watermarkOpacity) || 25) / 100));

    // 고해상도 투명 워터마크 PNG 생성
    const wmCanvas = document.createElement("canvas");
    const tmpCtx = wmCanvas.getContext("2d");
    const fontSize = 84;
    tmpCtx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
    const metrics = tmpCtx.measureText(text);
    const padX = 48;
    const padY = 40;
    wmCanvas.width = Math.max(240, Math.ceil(metrics.width) + padX * 2);
    wmCanvas.height = fontSize + padY * 2;

    const ctx = wmCanvas.getContext("2d");
    ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, wmCanvas.width / 2, wmCanvas.height / 2);

    const wmBlob = await canvasToBlob(wmCanvas, "image/png", 1.0);
    const wmBytes = await wmBlob.arrayBuffer();

    const bytes = await file.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(bytes);
    const wmImage = await pdfDoc.embedPng(wmBytes);
    const pages = pdfDoc.getPages();

    function drawRotatedCentered(page, cx, cy, drawW, drawH, angleDeg) {
      const rad = (angleDeg * Math.PI) / 180;
      const dx = (drawW / 2) * Math.cos(rad) - (drawH / 2) * Math.sin(rad);
      const dy = (drawW / 2) * Math.sin(rad) + (drawH / 2) * Math.cos(rad);
      page.drawImage(wmImage, {
        x: cx - dx,
        y: cy - dy,
        width: drawW,
        height: drawH,
        rotate: window.PDFLib.degrees(angleDeg),
        opacity
      });
    }

    pages.forEach((page, idx) => {
      onProgress(Math.round((idx / pages.length) * 85));
      const { width, height } = page.getSize();
      const aspect = wmCanvas.height / wmCanvas.width;

      if (layout === "tile") {
        const tileW = Math.min(width * 0.42, 230);
        const tileH = tileW * aspect;
        const cols = [0.22, 0.5, 0.78];
        const rows = [0.2, 0.5, 0.8];
        rows.forEach((ry) => {
          cols.forEach((rx) => {
            drawRotatedCentered(page, width * rx, height * ry, tileW, tileH, 32);
          });
        });
      } else if (layout === "corner") {
        const drawW = Math.min(width * 0.34, 210);
        const drawH = drawW * aspect;
        page.drawImage(wmImage, {
          x: width - drawW - 24,
          y: 22,
          width: drawW,
          height: drawH,
          opacity
        });
      } else {
        const drawW = Math.min(width, height) * 0.78;
        const drawH = drawW * aspect;
        drawRotatedCentered(page, width / 2, height / 2, drawW, drawH, 42);
      }
    });

    const outBytes = await pdfDoc.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_watermarked.pdf`,
        blob,
        size: blob.size,
        previewUrl: null,
        meta: `${pages.length} Pages · ${formatBytes(blob.size)}`
      }
    ];
  }

  /**
   * Read ASCII string safely from TIFF buffer.
   */
  function readTiffAscii(bytes, pos, count) {
    const end = Math.min(bytes.length, pos + Math.max(0, count));
    let s = "";
    for (let i = pos; i < end; i++) {
      const ch = bytes[i];
      if (ch === 0) break;
      if (ch >= 32 && ch < 127) s += String.fromCharCode(ch);
    }
    return s.trim();
  }

  /**
   * Parse TIFF IFD0 / ExifIFD / GPS IFD tags cleanly without mutating image bytes.
   */
  function parseTiffExifTags(bytes, tiffOffset, limitEnd) {
    const tags = [];
    let hasGps = false;
    if (tiffOffset + 8 > limitEnd) return { tags, hasGps };
    const b0 = bytes[tiffOffset];
    const b1 = bytes[tiffOffset + 1];
    const le = b0 === 0x49 && b1 === 0x49;
    const be = b0 === 0x4d && b1 === 0x4d;
    if (!le && !be) return { tags, hasGps };

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(tiffOffset + 2, le) !== 42) return { tags, hasGps };
    const ifd0Rel = view.getUint32(tiffOffset + 4, le);

    const typeSizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

    function readIfdMap(relOff) {
      const abs = tiffOffset + relOff;
      const map = {};
      if (relOff <= 0 || abs + 2 > limitEnd) return map;
      const count = Math.min(256, view.getUint16(abs, le));
      for (let i = 0; i < count; i++) {
        const entryPos = abs + 2 + i * 12;
        if (entryPos + 12 > limitEnd) break;
        const tag = view.getUint16(entryPos, le);
        const type = view.getUint16(entryPos + 2, le);
        const cnt = view.getUint32(entryPos + 4, le);
        const unitSize = typeSizes[type] || 1;
        const totalSize = cnt * unitSize;
        const valPos = totalSize <= 4 ? entryPos + 8 : tiffOffset + view.getUint32(entryPos + 8, le);
        if (valPos < tiffOffset || valPos + Math.min(totalSize, 4) > limitEnd) continue;

        let val = null;
        if (type === 2) {
          val = readTiffAscii(bytes, valPos, Math.min(cnt, limitEnd - valPos));
        } else if (type === 3) {
          val = view.getUint16(valPos, le);
        } else if (type === 4) {
          val = view.getUint32(valPos, le);
        } else if ((type === 5 || type === 10) && cnt >= 1) {
          const arr = [];
          const maxC = Math.min(cnt, 4);
          for (let j = 0; j < maxC; j++) {
            const p = valPos + j * 8;
            if (p + 8 > limitEnd) break;
            const num = type === 10 ? view.getInt32(p, le) : view.getUint32(p, le);
            const den = type === 10 ? view.getInt32(p + 4, le) : view.getUint32(p + 4, le);
            arr.push(den ? num / den : 0);
          }
          val = cnt === 1 ? arr[0] : arr;
        }
        map[tag] = val;
      }
      return map;
    }

    const ifd0 = readIfdMap(ifd0Rel);
    const makeModel = [ifd0[0x010f], ifd0[0x0110]].filter(Boolean).join(" ").trim();
    if (makeModel) tags.push({ label: "Camera", value: makeModel });
    if (ifd0[0x0131]) tags.push({ label: "Software", value: String(ifd0[0x0131]) });
    if (ifd0[0x0132]) tags.push({ label: "DateTime", value: String(ifd0[0x0132]) });

    if (ifd0[0x8769]) {
      const exif = readIfdMap(ifd0[0x8769]);
      if (exif[0x9003]) tags.push({ label: "DateTaken", value: String(exif[0x9003]) });
      if (exif[0xa434]) tags.push({ label: "Lens", value: String(exif[0xa434]) });
      const shot = [];
      if (exif[0x829d]) shot.push(`f/${Number(exif[0x829d]).toFixed(1)}`);
      if (exif[0x829a]) shot.push(exif[0x829a] < 1 ? `1/${Math.round(1 / exif[0x829a])}s` : `${exif[0x829a]}s`);
      if (exif[0x8827]) shot.push(`ISO ${exif[0x8827]}`);
      if (shot.length) tags.push({ label: "Exposure", value: shot.join(" · ") });
    }

    if (ifd0[0x8825]) {
      const gps = readIfdMap(ifd0[0x8825]);
      const latArr = Array.isArray(gps[0x0002]) ? gps[0x0002] : null;
      const lonArr = Array.isArray(gps[0x0004]) ? gps[0x0004] : null;
      if (latArr && latArr.length >= 3 && lonArr && lonArr.length >= 3) {
        hasGps = true;
        const lat = (latArr[0] + latArr[1] / 60 + latArr[2] / 3600) * (gps[0x0001] === "S" ? -1 : 1);
        const lon = (lonArr[0] + lonArr[1] / 60 + lonArr[2] / 3600) * (gps[0x0003] === "W" ? -1 : 1);
        tags.push({
          label: "GPS",
          value: `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`
        });
      } else if (Object.keys(gps).length > 0) {
        hasGps = true;
        tags.push({ label: "GPS", value: "GPS tags present" });
      }
    }

    return { tags, hasGps };
  }

  /**
   * Inspect EXIF/GPS/XMP/IPTC metadata in JPEG or PNG files without decoding pixels.
   */
  async function inspectImageMetadata(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tags = [];
    let hasMetadata = false;
    let hasGps = false;

    // JPEG
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let pos = 2;
      while (pos + 2 <= bytes.length) {
        while (pos < bytes.length && bytes[pos] === 0xff) pos++;
        if (pos >= bytes.length) break;
        const marker = bytes[pos++];
        if (marker === 0xda || marker === 0xd9) break;
        if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0x00) continue;
        if (pos + 2 > bytes.length) break;
        const segLen = view.getUint16(pos, false);
        if (segLen < 2 || pos + segLen > bytes.length) break;
        const dataStart = pos + 2;
        const dataEnd = pos + segLen;

        if (marker === 0xe1 && dataStart + 6 <= dataEnd) {
          const hdr = readTiffAscii(bytes, dataStart, 6);
          if (hdr === "Exif") {
            hasMetadata = true;
            const parsed = parseTiffExifTags(bytes, dataStart + 6, dataEnd);
            tags.push(...parsed.tags);
            if (parsed.hasGps) hasGps = true;
            if (parsed.tags.length === 0) tags.push({ label: "EXIF", value: `${segLen} bytes` });
          } else {
            hasMetadata = true;
            tags.push({ label: "XMP / APP1", value: `${segLen} bytes` });
          }
        } else if (marker === 0xed) {
          hasMetadata = true;
          tags.push({ label: "IPTC / IRB", value: `${segLen} bytes` });
        } else if (marker === 0xfe) {
          hasMetadata = true;
          tags.push({ label: "JPEG Comment", value: `${segLen} bytes` });
        }
        pos = dataEnd;
      }
      return { hasMetadata, hasGps, tags };
    }

    // PNG
    if (bytes.length > 16 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      let pos = 8;
      while (pos + 12 <= bytes.length) {
        const len = view.getUint32(pos, false);
        const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        const nextPos = pos + 12 + len;
        if (nextPos > bytes.length) break;
        if (type === "eXIf" || type === "tEXt" || type === "zTXt" || type === "iTXt") {
          hasMetadata = true;
          tags.push({ label: `PNG ${type}`, value: `${len} bytes` });
        }
        if (type === "IEND") break;
        pos = nextPos;
      }
      return { hasMetadata, hasGps, tags };
    }

    return { hasMetadata: false, hasGps: false, tags: [] };
  }

  /**
   * Losslessly strip EXIF / XMP / IPTC / COM segments from a JPEG Uint8Array.
   */
  function stripJpegMetadataLossless(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [bytes.subarray(0, 2)];
    let pos = 2;

    while (pos + 1 < bytes.length) {
      if (bytes[pos] !== 0xff) break;
      const segStart = pos;
      while (pos < bytes.length && bytes[pos] === 0xff) pos++;
      if (pos >= bytes.length) break;
      const marker = bytes[pos++];

      if (marker === 0xda) {
        chunks.push(bytes.subarray(segStart));
        pos = bytes.length;
        break;
      }
      if (marker === 0xd9) {
        chunks.push(bytes.subarray(segStart, pos));
        break;
      }
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0x00) {
        chunks.push(bytes.subarray(segStart, pos));
        continue;
      }
      if (pos + 2 > bytes.length) break;
      const segLen = view.getUint16(pos, false);
      if (segLen < 2 || pos + segLen > bytes.length) break;
      const segEnd = pos + segLen;

      let keep = true;
      if (marker === 0xe1 || marker === 0xed || marker === 0xec || marker === 0xfe) {
        keep = false;
      } else if (marker === 0xe2) {
        const sig = readTiffAscii(bytes, pos + 2, 12);
        keep = sig === "ICC_PROFILE";
      } else if (marker >= 0xe3 && marker <= 0xef) {
        keep = false;
      }

      if (keep) {
        chunks.push(bytes.subarray(segStart, segEnd));
      }
      pos = segEnd;
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(totalLen);
    let writePos = 0;
    for (const c of chunks) {
      out.set(c, writePos);
      writePos += c.length;
    }
    return out;
  }

  /**
   * Losslessly strip PNG metadata chunks (eXIf, tEXt, zTXt, iTXt).
   */
  function stripPngMetadataLossless(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks = [bytes.subarray(0, 8)];
    let pos = 8;

    while (pos + 12 <= bytes.length) {
      const len = view.getUint32(pos, false);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      const nextPos = pos + 12 + len;
      if (nextPos > bytes.length) break;
      if (type !== "eXIf" && type !== "tEXt" && type !== "zTXt" && type !== "iTXt") {
        chunks.push(bytes.subarray(pos, nextPos));
      }
      pos = nextPos;
      if (type === "IEND") break;
    }

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(totalLen);
    let writePos = 0;
    for (const c of chunks) {
      out.set(c, writePos);
      writePos += c.length;
    }
    return out;
  }

  /**
   * EXIF 메타데이터 · 위치정보(GPS) 무손실 제거 (exif-remove)
   */
  async function removeExifMetadata(files, _options, onProgress) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 90));
      const file = files[i];
      const baseName = stripExt(file.name);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = await inspectImageMetadata(file);

      let outBlob;
      let ext;
      if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        const cleanBytes = stripJpegMetadataLossless(bytes);
        outBlob = new Blob([cleanBytes], { type: "image/jpeg" });
        ext = "jpg";
      } else if (bytes.length > 16 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        const cleanBytes = stripPngMetadataLossless(bytes);
        outBlob = new Blob([cleanBytes], { type: "image/png" });
        ext = "png";
      } else {
        const img = await loadNormalizedImage(file, "image/jpeg", 0.94);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const resolved = resolveOutputMime("original", file);
        outBlob = await canvasToBlob(canvas, resolved.mime, 0.94);
        ext = resolved.ext;
      }

      const tagSummary = info.tags.length > 0 ? `${info.tags.length} tags stripped` : "Clean (0 metadata)";
      results.push({
        name: `${baseName}_clean.${ext}`,
        blob: outBlob,
        size: outBlob.size,
        previewUrl: URL.createObjectURL(outBlob),
        meta: `${tagSummary} · ${formatBytes(file.size)} → ${formatBytes(outBlob.size)}`
      });
    }
    onProgress(100);
    return results;
  }

  /**
   * 이미지 자르기 · 90° 회전 · 좌우/상하 반전 (crop-image)
   */
  async function cropImage(files, options, onProgress) {
    const file = files[0];
    onProgress(20);
    const rotDeg = ((Number(options.cropRotate) || 0) % 360 + 360) % 360;
    const flipH = Boolean(options.cropFlipH);
    const flipV = Boolean(options.cropFlipV);
    const cx = Math.max(0, Math.min(0.95, Number(options.cropX) || 0));
    const cy = Math.max(0, Math.min(0.95, Number(options.cropY) || 0));
    const cw = Math.max(0.05, Math.min(1 - cx, Number(options.cropW) || 1));
    const ch = Math.max(0.05, Math.min(1 - cy, Number(options.cropH) || 1));

    const { mime, ext } = resolveOutputMime(options.targetFormat || "original", file);
    const img = await loadNormalizedImage(file, mime, 0.94);

    let fullCanvas;
    if (window.VisualEditors && window.VisualEditors.buildTransformedCanvas) {
      fullCanvas = window.VisualEditors.buildTransformedCanvas(img, rotDeg, flipH, flipV, 0).canvas;
    } else {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      fullCanvas = document.createElement("canvas");
      fullCanvas.width = w;
      fullCanvas.height = h;
      fullCanvas.getContext("2d").drawImage(img, 0, 0);
    }

    onProgress(65);
    const sx = Math.round(cx * fullCanvas.width);
    const sy = Math.round(cy * fullCanvas.height);
    const sw = Math.max(1, Math.round(cw * fullCanvas.width));
    const sh = Math.max(1, Math.round(ch * fullCanvas.height));

    const outCanvas = document.createElement("canvas");
    outCanvas.width = sw;
    outCanvas.height = sh;
    const ctx = outCanvas.getContext("2d");
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sw, sh);
    }
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await canvasToBlob(outCanvas, mime, 0.92);
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_cropped.${ext}`,
        blob,
        size: blob.size,
        previewUrl: URL.createObjectURL(blob),
        meta: `${sw}×${sh}px · ${formatBytes(blob.size)}`
      }
    ];
  }

  /**
   * 사진 모자이크 · 블러 · 검정 마스킹 (blur-image)
   */
  async function blurImage(files, options, onProgress) {
    const file = files[0];
    const masks = Array.isArray(options.blurMasks) ? options.blurMasks : [];
    onProgress(20);
    const { mime, ext } = resolveOutputMime(options.targetFormat || "original", file);
    const img = await loadNormalizedImage(file, mime, 0.94);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = w;
    srcCanvas.height = h;
    srcCanvas.getContext("2d").drawImage(img, 0, 0, w, h);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext("2d");
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(srcCanvas, 0, 0);

    onProgress(60);
    if (masks.length > 0 && window.VisualEditors && window.VisualEditors.applyMaskRegion) {
      masks.forEach((m) => window.VisualEditors.applyMaskRegion(ctx, srcCanvas, m));
    } else if (masks.length > 0) {
      masks.forEach((m) => {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(m.x * w, m.y * h, m.w * w, m.h * h);
      });
    }

    const blob = await canvasToBlob(outCanvas, mime, 0.92);
    onProgress(100);
    return [
      {
        name: `${stripExt(file.name)}_masked.${ext}`,
        blob,
        size: blob.size,
        previewUrl: URL.createObjectURL(blob),
        meta: `${masks.length} masked · ${w}×${h}px · ${formatBytes(blob.size)}`
      }
    ];
  }

  // 목표 용량(KB) 딱 맞춰 압축 (이진 탐색 + 단계적 해상도 조절)
  async function compressToTargetKb(files, options, onProgress) {
    const targetKb = Math.max(10, Number(options.targetKb) || 200);
    const targetBytes = targetKb * 1024;
    const mime = options.targetFormat === "webp" ? "image/webp" : "image/jpeg";
    const ext = mime === "image/webp" ? "webp" : "jpg";
    const results = [];

    async function renderScaledBlob(img, scale, q) {
      const w = Math.max(32, Math.round((img.naturalWidth || img.width) * scale));
      const h = Math.max(32, Math.round((img.naturalHeight || img.height) * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await canvasToBlob(c, mime, q);
      return { blob, w, h };
    }

    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 90));
      const file = files[i];
      const img = await loadNormalizedImage(file, mime, 0.92);
      const origSize = file.size;

      const scales = [1.0, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2];
      let chosen = null;

      for (const sc of scales) {
        const highCheck = await renderScaledBlob(img, sc, 0.92);
        if (highCheck.blob.size <= targetBytes) {
          chosen = highCheck;
          break;
        }
        const lowCheck = await renderScaledBlob(img, sc, 0.14);
        if (lowCheck.blob.size <= targetBytes) {
          let lo = 0.14;
          let hi = 0.92;
          let best = lowCheck;
          for (let iter = 0; iter < 6; iter++) {
            const mid = (lo + hi) / 2;
            const probe = await renderScaledBlob(img, sc, mid);
            if (probe.blob.size <= targetBytes) {
              best = probe;
              lo = mid;
            } else {
              hi = mid;
            }
          }
          chosen = best;
          break;
        }
        chosen = lowCheck;
      }

      results.push({
        name: `${stripExt(file.name)}_${targetKb}kb.${ext}`,
        blob: chosen.blob,
        size: chosen.blob.size,
        previewUrl: URL.createObjectURL(chosen.blob),
        meta: `${formatBytes(origSize)} → ${formatBytes(chosen.blob.size)} (${chosen.w}×${chosen.h})`
      });
    }

    onProgress(100);
    return results;
  }

  // 이미지 이어붙이기 (세로 / 가로 콜라주)
  async function stitchImages(files, options, onProgress) {
    if (files.length === 0) throw new Error("Select images to stitch.");
    const dir = options.stitchDir || "vertical";
    const gap = Math.max(0, Math.min(120, parseInt(options.stitchGap || "0", 10) || 0));
    const bg = options.stitchBg || "#ffffff";
    const fit = options.stitchFit !== "no";
    const fmt = options.targetFormat || "jpeg";
    const mime = fmt === "png" ? "image/png" : fmt === "webp" ? "image/webp" : "image/jpeg";
    const ext = fmt === "png" ? "png" : fmt === "webp" ? "webp" : "jpg";

    const loaded = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 45));
      const img = await loadNormalizedImage(files[i], mime, 0.92);
      loaded.push({
        img,
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height
      });
    }

    let canvasW = 0;
    let canvasH = 0;
    const placements = [];

    if (dir === "vertical") {
      const targetW = fit ? Math.min(2000, Math.max(...loaded.map((x) => x.w))) : Math.max(...loaded.map((x) => x.w));
      let curY = 0;
      loaded.forEach((item, idx) => {
        const drawW = fit ? targetW : item.w;
        const drawH = fit ? Math.round((item.h * targetW) / item.w) : item.h;
        const drawX = Math.round((targetW - drawW) / 2);
        placements.push({ img: item.img, x: drawX, y: curY, w: drawW, h: drawH });
        curY += drawH + (idx < loaded.length - 1 ? gap : 0);
      });
      canvasW = targetW;
      canvasH = Math.max(1, curY);
    } else {
      const targetH = fit ? Math.min(1600, Math.max(...loaded.map((x) => x.h))) : Math.max(...loaded.map((x) => x.h));
      let curX = 0;
      loaded.forEach((item, idx) => {
        const drawH = fit ? targetH : item.h;
        const drawW = fit ? Math.round((item.w * targetH) / item.h) : item.w;
        const drawY = Math.round((targetH - drawH) / 2);
        placements.push({ img: item.img, x: curX, y: drawY, w: drawW, h: drawH });
        curX += drawW + (idx < loaded.length - 1 ? gap : 0);
      });
      canvasW = Math.max(1, curX);
      canvasH = targetH;
    }

    // 브라우저 최대 Canvas 크기 보호 (15,000px 이하 스케일 조정)
    const maxDim = 14000;
    let globalScale = 1;
    if (canvasW > maxDim || canvasH > maxDim) {
      globalScale = Math.min(maxDim / canvasW, maxDim / canvasH);
    }

    const outCanvas = document.createElement("canvas");
    outCanvas.width = Math.max(1, Math.round(canvasW * globalScale));
    outCanvas.height = Math.max(1, Math.round(canvasH * globalScale));
    const ctx = outCanvas.getContext("2d");

    if (!(bg === "transparent" && mime === "image/png")) {
      ctx.fillStyle = bg === "transparent" ? "#ffffff" : bg;
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    }

    placements.forEach((p, idx) => {
      onProgress(50 + Math.round((idx / placements.length) * 40));
      ctx.drawImage(
        p.img,
        Math.round(p.x * globalScale),
        Math.round(p.y * globalScale),
        Math.round(p.w * globalScale),
        Math.round(p.h * globalScale)
      );
    });

    const outBlob = await canvasToBlob(outCanvas, mime, 0.92);
    onProgress(100);
    return [
      {
        name: `stitched_${files.length}_images.${ext}`,
        blob: outBlob,
        size: outBlob.size,
        previewUrl: URL.createObjectURL(outBlob),
        meta: `${outCanvas.width}×${outCanvas.height}px · ${formatBytes(outBlob.size)}`
      }
    ];
  }

  // 일반 이미지 압축 / 포맷 변환 / 리사이즈 / HEIC 변환
  async function processImages(files, toolId, options, onProgress) {
    const results = [];
    const quality = (Number(options.quality) || 80) / 100;
    const maxWidth = Number(options.resizeWidth) || 0;
    const targetFormat = options.targetFormat || "jpeg";

    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round((i / files.length) * 90));
      const currentFile = files[i];
      const origSize = currentFile.size;
      const baseName = stripExt(currentFile.name);
      const img = await loadNormalizedImage(
        currentFile,
        targetFormat === "png" ? "image/png" : "image/jpeg",
        quality
      );
      let outW = img.naturalWidth || img.width;
      let outH = img.naturalHeight || img.height;

      if (maxWidth > 0 && (toolId === "resize-image" || outW > maxWidth)) {
        const scale = maxWidth / outW;
        outW = Math.round(outW * scale);
        outH = Math.round(outH * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");

      const resolved =
        toolId === "compress-image"
          ? currentFile.type === "image/webp"
            ? { mime: "image/webp", ext: "webp" }
            : { mime: "image/jpeg", ext: "jpg" }
          : resolveOutputMime(targetFormat, currentFile);
      const mime = resolved.mime;
      const ext = resolved.ext;

      if (mime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.drawImage(img, 0, 0, outW, outH);

      const outBlob = await canvasToBlob(canvas, mime, quality);
      const previewUrl = URL.createObjectURL(outBlob);
      const diffPct = origSize > 0 ? Math.round((1 - outBlob.size / origSize) * 100) : 0;
      const savingsBadge =
        diffPct > 0
          ? `${formatBytes(origSize)} → ${formatBytes(outBlob.size)} (-${diffPct}%)`
          : `${outW}×${outH}px · ${formatBytes(outBlob.size)}`;

      results.push({
        name: `${baseName}_converted.${ext}`,
        blob: outBlob,
        size: outBlob.size,
        previewUrl,
        meta: savingsBadge
      });
    }

    onProgress(100);
    return results;
  }

  async function runConversion(toolId, files, options, onProgress) {
    if (!files || files.length === 0) {
      throw new Error("Please select at least one file first.");
    }
    switch (toolId) {
      case "compress-pdf":
        return await compressPdf(files[0], options, onProgress);
      case "pdf-to-jpg":
        return await convertPdfToImages(files[0], options.targetFormat || "jpg", options, onProgress);
      case "jpg-to-pdf":
        return await convertImagesToPdf(files, options, onProgress);
      case "merge-pdf":
        return await mergePdfs(files, onProgress);
      case "split-pdf":
        return await splitPdf(files[0], options, onProgress);
      case "organize-pdf":
        return await organizePdf(files[0], options, onProgress);
      case "sign-pdf":
        return await signPdf(files[0], options, onProgress);
      case "unlock-pdf":
        return await unlockPdf(files[0], options, onProgress);
      case "watermark-pdf":
        return await watermarkPdf(files[0], options, onProgress);
      case "pdf-to-text":
        return await extractPdfText(files[0], options, onProgress);
      case "compress-kb":
        return await compressToTargetKb(files, options, onProgress);
      case "crop-image":
        return await cropImage(files, options, onProgress);
      case "stitch-images":
        return await stitchImages(files, options, onProgress);
      case "exif-remove":
        return await removeExifMetadata(files, options, onProgress);
      case "blur-image":
        return await blurImage(files, options, onProgress);
      case "compress-image":
      case "webp-to-jpg":
      case "heic-to-jpg":
      case "resize-image":
      default:
        return await processImages(files, toolId, options, onProgress);
    }
  }

  return {
    runConversion,
    createZipBlob,
    generateSampleFiles,
    getPdfPageThumbnails,
    inspectImageMetadata,
    loadNormalizedImage,
    formatBytes
  };
})();
