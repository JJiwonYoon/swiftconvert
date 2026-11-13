/**
 * ============================================================================
 * SwiftConvert 메인 애플리케이션 컨트롤러
 * - 다국어(i18n) 전환, 실시간 도구 검색, 15종 변환 옵션 & 시각적 PDF 페이지 편집
 * - SEO 정적 랜딩 경로(/<tool-id>/) & SPA history.pushState 양방향 호환
 * - 광고 슬롯(AdSense / Kakao AdFit / 제휴 배너) 렌더링
 * ============================================================================
 */

(function () {
  const isFileProtocol = window.location.protocol === "file:";

  function computeRootUrl() {
    if (isFileProtocol) return window.location.href.split("#")[0];
    if (window.INITIAL_TOOL_ID) {
      const marker = "/" + window.INITIAL_TOOL_ID;
      const idx = window.location.pathname.indexOf(marker);
      if (idx >= 0) {
        return window.location.origin + window.location.pathname.slice(0, idx + 1);
      }
    }
    const baseDir = window.location.pathname.replace(/index\.html$/, "");
    return window.location.origin + (baseDir.endsWith("/") ? baseDir : baseDir + "/");
  }

  const rootUrl = computeRootUrl();

  const state = {
    lang: "ko",
    category: "all",
    searchQuery: "",
    activeToolId: null,
    files: [],
    results: [],
    pagePlan: [],
    theme: "light"
  };

  function detectInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const qLang = params.get("lang");
    if (qLang && window.I18N[qLang]) return qLang;

    const saved = localStorage.getItem("swiftconvert_lang");
    if (saved && window.I18N[saved]) return saved;

    const navLang = (navigator.language || "ko").slice(0, 2).toLowerCase();
    return window.I18N[navLang] ? navLang : "en";
  }

  function detectToolFromLocation() {
    if (window.INITIAL_TOOL_ID && !state._navigated) {
      return window.INITIAL_TOOL_ID;
    }
    const params = new URLSearchParams(window.location.search);
    const qTool = params.get("tool");
    if (qTool && window.TOOLS_CATALOG.some((t) => t.id === qTool)) return qTool;

    const hash = window.location.hash.replace("#", "");
    if (hash && window.TOOLS_CATALOG.some((t) => t.id === hash)) return hash;

    if (!isFileProtocol) {
      const path = window.location.pathname.replace(/index\.html$/, "").replace(/\/+$/, "");
      const lastSeg = path.split("/").pop();
      if (lastSeg && window.TOOLS_CATALOG.some((t) => t.id === lastSeg)) {
        return lastSeg;
      }
    }
    return null;
  }

  function t() {
    return window.I18N[state.lang] || window.I18N.ko;
  }

  function showToast(msg) {
    const toast = document.getElementById("toastMsg");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("swiftconvert_theme", theme);
    const btn = document.getElementById("themeToggleBtn");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    if (window.FeedbackModule) window.FeedbackModule.syncTheme(theme);
  }

  function renderAdSlots() {
    const cfg = window.ADS_CONFIG || { demoMode: true };
    const strings = t();

    document.querySelectorAll("[data-ad-slot]").forEach((el) => {
      const slotName = el.getAttribute("data-ad-slot");
      if (!cfg.demoMode && cfg.customBanners && cfg.customBanners.enabled && slotName === "conversionResult") {
        el.innerHTML = `<span class="ad-label">${strings.adLabel}</span>${cfg.customBanners.conversionResultHtml}`;
        return;
      }

      if (!cfg.demoMode && cfg.adsense && cfg.adsense.enabled) {
        const slotId = cfg.adsense.slots[slotName] || "";
        el.innerHTML = `
          <span class="ad-label">${strings.adLabel}</span>
          <ins class="adsbygoogle"
               style="display:block;width:100%;"
               data-ad-client="${cfg.adsense.clientId}"
               data-ad-slot="${slotId}"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
        `;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {}
        return;
      }

      if (!cfg.demoMode && cfg.kakaoAdFit && cfg.kakaoAdFit.enabled) {
        const unitId = cfg.kakaoAdFit.units[slotName] || "";
        const isLeaderboard =
          slotName === "topLeaderboard" ||
          slotName === "bottomInfeed" ||
          slotName === "conversionResult";
        const width = isLeaderboard ? 728 : 300;
        const height = isLeaderboard ? 90 : 250;
        el.innerHTML = `
          <span class="ad-label">${strings.adLabel}</span>
          <ins class="kakao_ad_area" style="display:none;"
               data-ad-unit="${unitId}"
               data-ad-width="${width}"
               data-ad-height="${height}"></ins>
        `;
        if (!document.querySelector('script[src*="kas/static/ba.min.js"]')) {
          const sTag = document.createElement("script");
          sTag.async = true;
          sTag.src = "https://t1.daumcdn.net/kas/static/ba.min.js";
          document.body.appendChild(sTag);
        }
        return;
      }

      el.innerHTML = `
        <span class="ad-label">${strings.adLabel}</span>
        <div class="ad-placeholder-content">
          <strong>📢 ${strings.adPlaceholderTitle} (${slotName})</strong>
          <span>${strings.adPlaceholderDesc}</span>
        </div>
      `;
    });
  }

  function updateSeoAndGuide() {
    const s = t();
    let title = `SwiftConvert - ${s.heroTitle}`;
    let desc = s.heroSubtitle;
    let keywords = "";
    let steps = s.howToSteps;
    let faqs = s.faqs;

    if (state.activeToolId && window.TOOLS_SEO && window.TOOLS_SEO[state.activeToolId]) {
      const toolSeo = window.TOOLS_SEO[state.activeToolId];
      const localized = toolSeo[state.lang] || toolSeo.en;
      if (localized) {
        title = localized.seoTitle;
        desc = localized.seoDesc;
        keywords = localized.keywords || "";
        if (localized.steps) steps = localized.steps;
        if (localized.faqs) faqs = localized.faqs;
      }
    }

    document.title = title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute("content", desc);
    const kwMeta = document.querySelector('meta[name="keywords"]');
    if (kwMeta && keywords) kwMeta.setAttribute("content", keywords);

    const stepsEl = document.getElementById("howToStepsList");
    if (stepsEl) {
      stepsEl.innerHTML = steps
        .map(
          (step, idx) => `
          <li class="step-item">
            <span class="step-num">${idx + 1}</span>
            <span>${escapeHtml(step)}</span>
          </li>`
        )
        .join("");
    }

    const faqEl = document.getElementById("faqList");
    if (faqEl) {
      faqEl.innerHTML = faqs
        .map(
          (item) => `
          <div class="faq-item">
            <div class="faq-q">Q. ${escapeHtml(item.q)}</div>
            <div class="faq-a">${escapeHtml(item.a)}</div>
          </div>`
        )
        .join("");
    }
  }

  function updateStaticTexts() {
    const s = t();
    document.documentElement.lang = state.lang;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt("trustBadge1", s.trustBadge1);
    setTxt("trustBadge2", s.trustBadge2);
    setTxt("trustBadge3", s.trustBadge3);
    setTxt("heroTitle", s.heroTitle);
    setTxt("heroSubtitle", s.heroSubtitle);
    setTxt("catAllBtn", s.catAll);
    setTxt("catPdfBtn", s.catPdf);
    setTxt("catImageBtn", s.catImage);
    setTxt("backToAllBtn", s.backToAll);
    setTxt("shareToolBtn", s.shareToolBtn);
    setTxt("step1Pill", s.step1);
    setTxt("step2Pill", s.step2);
    setTxt("step3Pill", s.step3);
    setTxt("selectFilesBtnText", s.selectFilesBtn);
    setTxt("trySampleBtn", s.trySampleBtn);
    setTxt("dropHint", s.dropHint);
    setTxt("selectedFilesTitle", s.selectedFilesTitle);
    setTxt("clearAllBtn", s.clearAllBtn);
    setTxt("addMoreBtn", s.addMoreBtn);
    setTxt("optionsTitle", s.optionsTitle);
    setTxt("convertNowBtn", s.convertNowBtn);
    setTxt("processingText", s.processingText);
    setTxt("doneTitle", s.doneTitle);
    setTxt("doneSubtitle", s.doneSubtitle);
    setTxt("downloadAllZipBtn", s.downloadAllZip);
    setTxt("convertAnotherBtn", s.convertAnotherBtn);
    setTxt("relatedTitle", s.relatedTitle);
    setTxt("relatedSubtitle", s.relatedSubtitle);
    setTxt("howToTitle", s.howToTitle);
    setTxt("faqTitle", s.faqTitle);
    setTxt("ownerGuideBtn", s.ownerGuideBtn);
    setTxt("licensesLink", s.licensesLink);
    setTxt("privacyLink", s.privacyLink);
    setTxt("termsLink", s.termsLink);
    setTxt("orgTitle", s.orgTitle);
    setTxt("orgHint", s.orgHint);

    const searchInput = document.getElementById("toolSearchInput");
    if (searchInput) searchInput.placeholder = s.searchPlaceholder;

    document.querySelectorAll("[data-nav-tool]").forEach((btn) => {
      const id = btn.getAttribute("data-nav-tool");
      const tool = window.TOOLS_CATALOG.find((x) => x.id === id);
      if (tool) btn.textContent = tool.names[state.lang] || tool.names.en;
    });

    updateSeoAndGuide();
    renderAdSlots();
  }

  function renderToolsGrid() {
    const grid = document.getElementById("toolsGrid");
    if (!grid) return;
    const s = t();
    const q = state.searchQuery.trim().toLowerCase();

    const filtered = window.TOOLS_CATALOG.filter((tool) => {
      const catMatch = state.category === "all" || tool.category === state.category;
      if (!catMatch) return false;
      if (!q) return true;

      const seoObj = window.TOOLS_SEO && window.TOOLS_SEO[tool.id];
      const seoKw = seoObj && seoObj[state.lang] ? seoObj[state.lang].keywords || "" : "";
      const haystack = [
        tool.id,
        tool.names[state.lang] || "",
        tool.names.en || "",
        tool.descs[state.lang] || "",
        tool.searchTags || "",
        seoKw
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-search-box">${escapeHtml(s.searchEmpty)}</div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((tool) => {
        const name = tool.names[state.lang] || tool.names.en;
        const desc = tool.descs[state.lang] || tool.descs.en;
        let badgeClass = "";
        if (tool.badge === "HOT") badgeClass = "hot";
        else if (tool.badge === "NEW") badgeClass = "new";
        const badgeHtml = tool.badge
          ? `<span class="tool-badge ${badgeClass}">${tool.badge}</span>`
          : "";
        return `
          <article class="tool-card" style="--card-accent:${tool.color}" data-tool-id="${tool.id}" tabindex="0" role="button">
            <div class="tool-card-header">
              <div class="tool-icon" style="background:${tool.color}">${tool.icon}</div>
              ${badgeHtml}
            </div>
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(desc)}</p>
            <div class="tool-card-footer">
              <span>${escapeHtml(s.useToolBtn)}</span>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll(".tool-card").forEach((card) => {
      card.addEventListener("click", () => {
        openTool(card.getAttribute("data-tool-id"), true);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTool(card.getAttribute("data-tool-id"), true);
        }
      });
    });
  }

  function renderRelatedTools(toolId) {
    const box = document.getElementById("relatedToolsBox");
    const pills = document.getElementById("relatedPills");
    if (!box || !pills) return;

    const s = t();
    const seoEntry = window.TOOLS_SEO && window.TOOLS_SEO[toolId];
    const relIds = (seoEntry && seoEntry.related) || [];
    const relTools = relIds
      .map((id) => window.TOOLS_CATALOG.find((x) => x.id === id))
      .filter(Boolean);

    if (relTools.length === 0) {
      box.style.display = "none";
      return;
    }

    box.style.display = "block";
    box.classList.remove("post-convert");
    pills.innerHTML = relTools
      .map((rt) => {
        const name = rt.names[state.lang] || rt.names.en;
        const desc = rt.descs[state.lang] || rt.descs.en;
        const badgeHtml = rt.badge
          ? `<span class="related-card-badge">${escapeHtml(rt.badge)}</span>`
          : "";
        const href = isFileProtocol
          ? `#${rt.id}`
          : `${rootUrl}${rt.id}/${window.location.search}`;
        return `
          <a href="${escapeHtml(href)}" class="related-card" style="--card-accent:${rt.color}" data-rel-tool="${rt.id}">
            <span class="related-card-icon" style="background:${rt.color}">${rt.icon}</span>
            <span class="related-card-body">
              <span class="related-card-title-row">
                <span class="related-card-title">${escapeHtml(name)}</span>
                ${badgeHtml}
              </span>
              <span class="related-card-desc">${escapeHtml(desc)}</span>
            </span>
            <span class="related-card-arrow">${escapeHtml(s.relatedCta)} →</span>
          </a>
        `;
      })
      .join("");

    pills.querySelectorAll("[data-rel-tool]").forEach((link) => {
      link.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openTool(link.getAttribute("data-rel-tool"), true);
      });
    });
  }

  function renderToolOptions(toolId) {
    const container = document.getElementById("optionsGrid");
    if (!container) return;
    const s = t();
    let html = "";

    if (toolId === "pdf-to-jpg" || toolId === "pdf-to-png") {
      html += `
        <div class="option-group">
          <label for="optDpi">${s.optDpi}</label>
          <select id="optDpi">
            <option value="150">${s.optDpiStd}</option>
            <option value="300">${s.optDpiHigh}</option>
          </select>
        </div>
      `;
      if (toolId === "pdf-to-jpg") {
        html += `
          <div class="option-group">
            <label for="optQuality">${s.optQuality}: <span id="qualityVal">90%</span></label>
            <input type="range" id="optQuality" min="30" max="100" value="90" />
          </div>
        `;
      }
    } else if (toolId === "jpg-to-pdf") {
      html += `
        <div class="option-group">
          <label for="optPageSize">${s.optPageSize}</label>
          <select id="optPageSize">
            <option value="a4">A4 (210 × 297 mm)</option>
            <option value="letter">US Letter</option>
            <option value="fit">${s.optPageFit}</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optMargin">${s.optMargin}</label>
          <select id="optMargin">
            <option value="small">${s.optMarginSmall}</option>
            <option value="none">${s.optMarginNone}</option>
            <option value="large">${s.optMarginLarge}</option>
          </select>
        </div>
      `;
    } else if (toolId === "split-pdf") {
      html += `
        <div class="option-group">
          <label for="optSplitMode">${s.optSplitMode}</label>
          <select id="optSplitMode">
            <option value="all">${s.optSplitAll}</option>
            <option value="range">${s.optSplitRange}</option>
          </select>
        </div>
        <div class="option-group" id="pageRangeGroup" style="display:none;">
          <label for="optPageRange">${s.optPageRange}</label>
          <input type="text" id="optPageRange" value="1-2" placeholder="1-3, 5" />
        </div>
      `;
    } else if (toolId === "organize-pdf") {
      html += `
        <div class="option-group">
          <label>${s.orgTitle}</label>
          <div id="orgSummaryText" style="font-size:0.88rem;font-weight:700;color:var(--primary);padding-top:6px;">
            ${s.orgHint}
          </div>
        </div>
      `;
    } else if (toolId === "rotate-pdf") {
      html += `
        <div class="option-group">
          <label for="optRotateAngle">${s.optRotateAngle}</label>
          <select id="optRotateAngle">
            <option value="90">90° (Clockwise)</option>
            <option value="180">180° (Upside Down)</option>
            <option value="270">270° (Counter-Clockwise)</option>
          </select>
        </div>
      `;
    } else if (toolId === "watermark-pdf") {
      html += `
        <div class="option-group">
          <label for="optWatermarkText">${s.optWatermarkText}</label>
          <input type="text" id="optWatermarkText" value="사본 · CONFIDENTIAL" maxlength="40" />
        </div>
        <div class="option-group">
          <label for="optWatermarkLayout">${s.optWatermarkLayout}</label>
          <select id="optWatermarkLayout">
            <option value="center">${s.optWmCenter}</option>
            <option value="tile">${s.optWmTile}</option>
            <option value="corner">${s.optWmCorner}</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optWatermarkColor">${s.optWatermarkColor}</label>
          <select id="optWatermarkColor">
            <option value="#e5322d">Red (#e5322d)</option>
            <option value="#64748b">Gray (#64748b)</option>
            <option value="#2563eb">Blue (#2563eb)</option>
            <option value="#0f172a">Black (#0f172a)</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optWatermarkOpacity">${s.optWatermarkOpacity}: <span id="wmOpacityVal">25%</span></label>
          <input type="range" id="optWatermarkOpacity" min="10" max="80" value="25" />
        </div>
      `;
    } else if (toolId === "page-numbers-pdf") {
      html += `
        <div class="option-group">
          <label for="optPageNumPos">${s.optPageNumPos}</label>
          <select id="optPageNumPos">
            <option value="bottom-center">${s.optPnBottomCenter}</option>
            <option value="bottom-right">${s.optPnBottomRight}</option>
            <option value="bottom-left">${s.optPnBottomLeft}</option>
            <option value="top-right">${s.optPnTopRight}</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optPageNumFormat">${s.optPageNumFormat}</label>
          <select id="optPageNumFormat">
            <option value="of">1 / 10</option>
            <option value="num">1, 2, 3</option>
            <option value="dash">- 1 -</option>
            <option value="page">Page 1</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optPageNumStart">${s.optPageNumStart}</label>
          <input type="number" id="optPageNumStart" min="1" max="9999" value="1" />
        </div>
      `;
    } else if (toolId === "merge-pdf") {
      html += `
        <div class="option-group">
          <label>${s.optMergeOrderLabel}</label>
          <div style="font-size:0.86rem;color:var(--text-muted);padding-top:6px;">
            ${s.optMergeOrderHint}
          </div>
        </div>
      `;
    } else if (toolId === "compress-kb") {
      html += `
        <div class="option-group">
          <label for="optTargetKbPreset">${s.optTargetKbPreset}</label>
          <select id="optTargetKbPreset">
            <option value="200">200 KB (이력서·원서접수 표준)</option>
            <option value="100">100 KB (증명사진·공공기관)</option>
            <option value="500">500 KB (여권·비자·대형 서류)</option>
            <option value="1000">1000 KB (1 MB 이하)</option>
            <option value="50">50 KB (초경량)</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optTargetKb">${s.optTargetKbCustom}</label>
          <input type="number" id="optTargetKb" min="10" max="10000" value="200" />
        </div>
        <div class="option-group">
          <label for="optTargetFormat">${s.optTargetFormat}</label>
          <select id="optTargetFormat">
            <option value="jpeg">JPG (.jpg)</option>
            <option value="webp">WebP (.webp)</option>
          </select>
        </div>
      `;
    } else if (toolId === "stitch-images") {
      html += `
        <div class="option-group">
          <label for="optStitchDir">${s.optStitchDir}</label>
          <select id="optStitchDir">
            <option value="vertical">${s.optStitchVert}</option>
            <option value="horizontal">${s.optStitchHoriz}</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optStitchFit">${s.optStitchFit}</label>
          <select id="optStitchFit">
            <option value="yes">${s.optStitchFitYes}</option>
            <option value="no">${s.optStitchFitNo}</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optStitchGap">${s.optStitchGap}</label>
          <input type="number" id="optStitchGap" min="0" max="120" value="12" />
        </div>
        <div class="option-group">
          <label for="optStitchBg">${s.optStitchBg}</label>
          <select id="optStitchBg">
            <option value="#ffffff">White (#ffffff)</option>
            <option value="#0f172a">Dark (#0f172a)</option>
            <option value="transparent">Transparent (PNG only)</option>
          </select>
        </div>
        <div class="option-group">
          <label for="optTargetFormat">${s.optTargetFormat}</label>
          <select id="optTargetFormat">
            <option value="jpeg">JPG (.jpg)</option>
            <option value="png">PNG (.png)</option>
            <option value="webp">WebP (.webp)</option>
          </select>
        </div>
      `;
    } else {
      if (toolId === "webp-to-jpg" || toolId === "heic-to-jpg") {
        html += `
          <div class="option-group">
            <label for="optTargetFormat">${s.optTargetFormat}</label>
            <select id="optTargetFormat">
              <option value="jpeg">JPG (.jpg)</option>
              <option value="png">PNG (.png)</option>
              <option value="webp">WebP (.webp)</option>
            </select>
          </div>
        `;
      }
      if (toolId === "resize-image") {
        html += `
          <div class="option-group">
            <label for="optResizePreset">${s.optResizePreset}</label>
            <select id="optResizePreset">
              <option value="1280">YouTube / HD (1280px)</option>
              <option value="1080">Instagram Square (1080px)</option>
              <option value="800">Blog Standard (800px)</option>
              <option value="413">Passport 3.5×4.5cm @300DPI (413px)</option>
              <option value="354">ID Photo 3×4cm @300DPI (354px)</option>
              <option value="custom">${s.optResizeCustom}</option>
            </select>
          </div>
        `;
      }
      html += `
        <div class="option-group">
          <label for="optQuality">${s.optQuality}: <span id="qualityVal">${
        toolId === "compress-image" ? "72%" : "90%"
      }</span></label>
          <input type="range" id="optQuality" min="15" max="100" value="${
            toolId === "compress-image" ? "72" : "90"
          }" />
        </div>
        <div class="option-group">
          <label for="optResizeWidth">${s.optResizeWidth}</label>
          <input type="number" id="optResizeWidth" min="0" max="8000" value="${
            toolId === "resize-image" ? "1280" : "0"
          }" />
        </div>
      `;
    }

    container.innerHTML = html;

    const qualityInput = document.getElementById("optQuality");
    if (qualityInput) {
      qualityInput.addEventListener("input", () => {
        const valEl = document.getElementById("qualityVal");
        if (valEl) valEl.textContent = qualityInput.value + "%";
      });
    }

    const wmOpacity = document.getElementById("optWatermarkOpacity");
    if (wmOpacity) {
      wmOpacity.addEventListener("input", () => {
        const valEl = document.getElementById("wmOpacityVal");
        if (valEl) valEl.textContent = wmOpacity.value + "%";
      });
    }

    const splitModeEl = document.getElementById("optSplitMode");
    if (splitModeEl) {
      splitModeEl.addEventListener("change", () => {
        const rg = document.getElementById("pageRangeGroup");
        if (rg) rg.style.display = splitModeEl.value === "range" ? "flex" : "none";
      });
    }

    const kbPreset = document.getElementById("optTargetKbPreset");
    const kbInput = document.getElementById("optTargetKb");
    if (kbPreset && kbInput) {
      kbPreset.addEventListener("change", () => {
        kbInput.value = kbPreset.value;
      });
    }

    const resizePreset = document.getElementById("optResizePreset");
    const resizeInput = document.getElementById("optResizeWidth");
    if (resizePreset && resizeInput) {
      resizePreset.addEventListener("change", () => {
        if (resizePreset.value !== "custom") {
          resizeInput.value = resizePreset.value;
        }
      });
    }
  }

  function readCurrentOptions() {
    const val = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };
    return {
      dpi: val("optDpi", "150"),
      quality: val("optQuality", "85"),
      pageSize: val("optPageSize", "a4"),
      margin: val("optMargin", "small"),
      splitMode: val("optSplitMode", "all"),
      pageRange: val("optPageRange", "1-2"),
      rotateAngle: val("optRotateAngle", "90"),
      targetFormat: val("optTargetFormat", "jpeg"),
      resizeWidth: val("optResizeWidth", "0"),
      targetKb: val("optTargetKb", "200"),
      watermarkText: val("optWatermarkText", "CONFIDENTIAL"),
      watermarkLayout: val("optWatermarkLayout", "center"),
      watermarkColor: val("optWatermarkColor", "#e5322d"),
      watermarkOpacity: val("optWatermarkOpacity", "25"),
      pageNumPos: val("optPageNumPos", "bottom-center"),
      pageNumFormat: val("optPageNumFormat", "of"),
      pageNumStart: val("optPageNumStart", "1"),
      stitchDir: val("optStitchDir", "vertical"),
      stitchFit: val("optStitchFit", "yes"),
      stitchGap: val("optStitchGap", "12"),
      stitchBg: val("optStitchBg", "#ffffff"),
      pagePlan: state.pagePlan
    };
  }

  function updateStepTracker(step) {
    const p1 = document.getElementById("step1Pill");
    const p2 = document.getElementById("step2Pill");
    const p3 = document.getElementById("step3Pill");
    if (!p1 || !p2 || !p3) return;

    [p1, p2, p3].forEach((p) => p.classList.remove("active", "done"));
    if (step === 1) {
      p1.classList.add("active");
    } else if (step === 2) {
      p1.classList.add("done");
      p2.classList.add("active");
    } else if (step === 3) {
      p1.classList.add("done");
      p2.classList.add("done");
      p3.classList.add("done");
    }
  }

  function revokeResultUrls() {
    state.results.forEach((r) => {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
    });
  }

  function pushToolUrl(toolId) {
    if (isFileProtocol) {
      const targetHash = toolId ? `#${toolId}` : "";
      if (window.location.hash !== targetHash) {
        history.pushState({ toolId }, "", rootUrl + targetHash);
      }
      return;
    }
    const langSearch = window.location.search;
    const nextUrl = toolId ? `${rootUrl}${toolId}/${langSearch}` : `${rootUrl}${langSearch}`;
    if (window.location.href !== nextUrl) {
      history.pushState({ toolId }, "", nextUrl);
    }
  }

  function openTool(toolId, pushHistory) {
    const tool = window.TOOLS_CATALOG.find((x) => x.id === toolId);
    if (!tool) return;

    revokeResultUrls();
    state._navigated = true;
    state.activeToolId = toolId;
    state.files = [];
    state.results = [];
    state.pagePlan = [];

    if (pushHistory) {
      pushToolUrl(toolId);
    }

    const toolName = tool.names[state.lang] || tool.names.en;

    document.getElementById("homeView").style.display = "none";
    document.getElementById("workspaceView").classList.add("active");

    document.getElementById("activeToolTitle").textContent = `${tool.icon} ${toolName}`;
    document.getElementById("activeToolDesc").textContent =
      tool.descs[state.lang] || tool.descs.en;

    const fileInput = document.getElementById("fileInput");
    fileInput.accept = tool.accept;
    fileInput.multiple = tool.multiple;

    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-nav-tool") === toolId);
    });

    renderToolOptions(toolId);
    renderRelatedTools(toolId);
    updateSeoAndGuide();
    resetWorkspaceUI();
    if (window.FeedbackModule) window.FeedbackModule.setContext(toolId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeTool(pushHistory) {
    revokeResultUrls();
    state._navigated = true;
    state.activeToolId = null;
    state.files = [];
    state.results = [];
    state.pagePlan = [];

    if (pushHistory) {
      pushToolUrl(null);
    }

    document.getElementById("workspaceView").classList.remove("active");
    document.getElementById("homeView").style.display = "block";
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    updateSeoAndGuide();
    if (window.FeedbackModule) window.FeedbackModule.setContext(null);
  }

  function resetWorkspaceUI() {
    document.getElementById("dropzone").style.display = "block";
    document.getElementById("fileListSection").style.display = "none";
    document.getElementById("organizerSection").style.display = "none";
    document.getElementById("optionsPanel").style.display = "none";
    document.getElementById("convertActionBar").style.display = "none";
    document.getElementById("progressBox").classList.remove("active");
    document.getElementById("resultsBox").classList.remove("active");
    document.getElementById("progressBarFill").style.width = "0%";
    updateStepTracker(1);
  }

  async function loadOrganizerPages(file) {
    const orgSection = document.getElementById("organizerSection");
    const orgGrid = document.getElementById("organizerGrid");
    if (!orgSection || !orgGrid) return;

    orgSection.style.display = "block";
    orgGrid.innerHTML = `<div style="padding:16px;color:var(--text-muted);">Loading pages...</div>`;
    state.pagePlan = await window.ConverterEngine.getPdfPageThumbnails(file);
    renderOrganizerGrid();
  }

  function renderOrganizerGrid() {
    const orgGrid = document.getElementById("organizerGrid");
    if (!orgGrid) return;
    const s = t();
    const keptCount = state.pagePlan.filter((p) => !p.deleted).length;
    const summaryEl = document.getElementById("orgSummaryText");
    if (summaryEl) {
      summaryEl.textContent = `${s.orgSummaryPrefix} ${keptCount} / ${state.pagePlan.length}`;
    }

    orgGrid.innerHTML = state.pagePlan
      .map(
        (p, idx) => `
        <div class="org-card ${p.deleted ? "deleted" : ""}">
          <div class="org-thumb-box">
            <span class="org-page-badge">${s.orgPageLabel} ${p.pageNumber}</span>
            ${
              p.thumbUrl
                ? `<img src="${p.thumbUrl}" style="transform:rotate(${p.rotation}deg)" alt="" />`
                : `<div style="font-size:2rem;transform:rotate(${p.rotation}deg)">📄</div>`
            }
            ${p.deleted ? `<div class="org-deleted-pill">${s.orgDeletedBadge}</div>` : ""}
          </div>
          <div class="org-controls">
            <button type="button" class="org-btn" data-org-left="${idx}" title="Move Left">◀</button>
            <button type="button" class="org-btn" data-org-rot="${idx}" title="Rotate">↻</button>
            <button type="button" class="org-btn ${p.deleted ? "del-active" : ""}" data-org-del="${idx}" title="Delete/Restore">🗑️</button>
            <button type="button" class="org-btn" data-org-right="${idx}" title="Move Right">▶</button>
          </div>
        </div>
      `
      )
      .join("");

    orgGrid.querySelectorAll("[data-org-left]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-org-left"));
        if (i > 0) {
          [state.pagePlan[i - 1], state.pagePlan[i]] = [state.pagePlan[i], state.pagePlan[i - 1]];
          renderOrganizerGrid();
        }
      });
    });

    orgGrid.querySelectorAll("[data-org-right]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-org-right"));
        if (i < state.pagePlan.length - 1) {
          [state.pagePlan[i + 1], state.pagePlan[i]] = [state.pagePlan[i], state.pagePlan[i + 1]];
          renderOrganizerGrid();
        }
      });
    });

    orgGrid.querySelectorAll("[data-org-rot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-org-rot"));
        state.pagePlan[i].rotation = (state.pagePlan[i].rotation + 90) % 360;
        renderOrganizerGrid();
      });
    });

    orgGrid.querySelectorAll("[data-org-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-org-del"));
        state.pagePlan[i].deleted = !state.pagePlan[i].deleted;
        renderOrganizerGrid();
      });
    });
  }

  function addFiles(newFileList) {
    const tool = window.TOOLS_CATALOG.find((x) => x.id === state.activeToolId);
    if (!tool) return;

    const incoming = Array.from(newFileList);
    if (incoming.length === 0) return;

    if (!tool.multiple) {
      state.files = [incoming[0]];
    } else {
      state.files = state.files.concat(incoming);
    }
    renderFileList();
    if (state.activeToolId === "organize-pdf" && state.files[0]) {
      loadOrganizerPages(state.files[0]);
    }
  }

  function renderFileList() {
    const listEl = document.getElementById("fileList");
    const section = document.getElementById("fileListSection");
    const orgSection = document.getElementById("organizerSection");
    const optionsPanel = document.getElementById("optionsPanel");
    const actionBar = document.getElementById("convertActionBar");
    const resultsBox = document.getElementById("resultsBox");

    resultsBox.classList.remove("active");

    if (state.files.length === 0) {
      resetWorkspaceUI();
      return;
    }

    updateStepTracker(2);
    section.style.display = "block";
    optionsPanel.style.display = "block";
    actionBar.style.display = "block";
    if (state.activeToolId !== "organize-pdf") {
      orgSection.style.display = "none";
    }

    listEl.innerHTML = "";
    state.files.forEach((file, idx) => {
      const item = document.createElement("div");
      item.className = "file-item";

      const isImg = file.type.startsWith("image/");
      const thumbHtml = isImg
        ? `<img src="${URL.createObjectURL(file)}" alt="" />`
        : `<span>PDF</span>`;

      item.innerHTML = `
        <div class="file-item-left">
          <div class="file-thumb">${thumbHtml}</div>
          <div class="file-meta">
            <div class="file-name">${escapeHtml(file.name)}</div>
            <div class="file-size">${window.ConverterEngine.formatBytes(file.size)}</div>
          </div>
        </div>
        <div class="file-actions">
          ${
            state.files.length > 1
              ? `<button class="mini-btn" data-move-up="${idx}" title="Up">▲</button>
                 <button class="mini-btn" data-move-down="${idx}" title="Down">▼</button>`
              : ""
          }
          <button class="mini-btn" data-remove="${idx}" title="Remove">✕</button>
        </div>
      `;
      listEl.appendChild(item);
    });

    listEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-remove"));
        state.files.splice(i, 1);
        renderFileList();
      });
    });

    listEl.querySelectorAll("[data-move-up]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-move-up"));
        if (i > 0) {
          [state.files[i - 1], state.files[i]] = [state.files[i], state.files[i - 1]];
          renderFileList();
        }
      });
    });

    listEl.querySelectorAll("[data-move-down]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-move-down"));
        if (i < state.files.length - 1) {
          [state.files[i + 1], state.files[i]] = [state.files[i], state.files[i + 1]];
          renderFileList();
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function handleConvert() {
    if (!state.activeToolId || state.files.length === 0) return;

    const btn = document.getElementById("convertNowBtn");
    const progressBox = document.getElementById("progressBox");
    const progressFill = document.getElementById("progressBarFill");
    const progressPct = document.getElementById("progressPct");
    const resultsBox = document.getElementById("resultsBox");

    btn.disabled = true;
    resultsBox.classList.remove("active");
    progressBox.classList.add("active");
    progressFill.style.width = "10%";
    progressPct.textContent = "10%";

    try {
      const options = readCurrentOptions();
      const results = await window.ConverterEngine.runConversion(
        state.activeToolId,
        state.files,
        options,
        (pct) => {
          progressFill.style.width = `${pct}%`;
          progressPct.textContent = `${pct}%`;
        }
      );

      revokeResultUrls();
      state.results = results;
      progressBox.classList.remove("active");
      updateStepTracker(3);
      renderResults(results);
    } catch (err) {
      progressBox.classList.remove("active");
      alert(t().errorConvertPrefix + (err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  function renderResults(results) {
    const resultsBox = document.getElementById("resultsBox");
    const grid = document.getElementById("resultsGrid");
    const zipBtn = document.getElementById("downloadAllZipBtn");
    const s = t();

    resultsBox.classList.add("active");

    if (results.length === 1) {
      zipBtn.textContent = s.downloadSingle;
      zipBtn.onclick = () => triggerDownload(results[0].blob, results[0].name);
    } else {
      zipBtn.textContent = `${s.downloadAllZip} (${results.length})`;
      zipBtn.onclick = async () => {
        const zipBlob = await window.ConverterEngine.createZipBlob(results);
        triggerDownload(zipBlob, `swiftconvert_${state.activeToolId}_${results.length}files.zip`);
      };
    }

    grid.innerHTML = results
      .map(
        (res, idx) => `
        <div class="result-card">
          <div class="result-preview">
            ${
              res.previewUrl
                ? `<img src="${res.previewUrl}" alt="${escapeHtml(res.name)}" />`
                : `<div style="font-size:2.4rem;">📄</div>`
            }
          </div>
          <div class="file-name" title="${escapeHtml(res.name)}">${escapeHtml(res.name)}</div>
          <div class="file-size">${escapeHtml(res.meta || "")}</div>
          <button class="result-dl-btn" data-dl-idx="${idx}">${s.downloadBtnText}</button>
        </div>
      `
      )
      .join("");

    grid.querySelectorAll("[data-dl-idx]").forEach((b) => {
      b.addEventListener("click", () => {
        const item = results[Number(b.getAttribute("data-dl-idx"))];
        if (item) triggerDownload(item.blob, item.name);
      });
    });

    const relBox = document.getElementById("relatedToolsBox");
    if (relBox) relBox.classList.add("post-convert");

    renderAdSlots();
    resultsBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openModal(title, htmlContent) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = htmlContent;
    document.getElementById("infoModal").classList.add("active");
  }

  function closeModal() {
    document.getElementById("infoModal").classList.remove("active");
  }

  function init() {
    state.lang = detectInitialLanguage();
    const langSelect = document.getElementById("langSelect");
    if (langSelect) {
      langSelect.value = state.lang;
      langSelect.addEventListener("change", (e) => {
        state.lang = e.target.value;
        localStorage.setItem("swiftconvert_lang", state.lang);
        updateStaticTexts();
        renderToolsGrid();
        if (state.activeToolId) {
          const tool = window.TOOLS_CATALOG.find((x) => x.id === state.activeToolId);
          if (tool) {
            document.getElementById("activeToolTitle").textContent = `${tool.icon} ${
              tool.names[state.lang] || tool.names.en
            }`;
            document.getElementById("activeToolDesc").textContent =
              tool.descs[state.lang] || tool.descs.en;
          }
          renderToolOptions(state.activeToolId);
          renderRelatedTools(state.activeToolId);
          if (state.activeToolId === "organize-pdf" && state.pagePlan.length > 0) {
            renderOrganizerGrid();
          }
          if (state.results.length > 0) {
            renderResults(state.results);
          }
        }
        if (window.FeedbackModule) window.FeedbackModule.syncLanguage();
      });
    }

    const savedTheme = localStorage.getItem("swiftconvert_theme") || "light";
    applyTheme(savedTheme);
    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    // 실시간 도구 검색
    const searchInput = document.getElementById("toolSearchInput");
    const clearSearchBtn = document.getElementById("searchClearBtn");
    if (searchInput && clearSearchBtn) {
      searchInput.addEventListener("input", () => {
        state.searchQuery = searchInput.value;
        clearSearchBtn.classList.toggle("visible", state.searchQuery.length > 0);
        renderToolsGrid();
      });
      clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.searchQuery = "";
        clearSearchBtn.classList.remove("visible");
        renderToolsGrid();
        searchInput.focus();
      });
    }

    // 카테고리 필터
    document.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.category = btn.getAttribute("data-cat");
        document.querySelectorAll("[data-cat]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        renderToolsGrid();
      });
    });

    // 상단 퀵 네비게이션
    document.querySelectorAll("[data-nav-tool]").forEach((btn) => {
      btn.addEventListener("click", () => openTool(btn.getAttribute("data-nav-tool"), true));
    });

    document.getElementById("brandLogo").addEventListener("click", (e) => {
      e.preventDefault();
      closeTool(true);
    });

    document.getElementById("backToAllBtn").addEventListener("click", () => closeTool(true));

    const shareBtn = document.getElementById("shareToolBtn");
    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
        } catch (e) {}
        showToast(t().copiedToast);
      });
    }

    // 파일 선택 & 드래그 앤 드롭
    const fileInput = document.getElementById("fileInput");
    const dropzone = document.getElementById("dropzone");

    document.getElementById("selectFilesBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    document.getElementById("addMoreBtn").addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#trySampleBtn")) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      addFiles(e.target.files);
      fileInput.value = "";
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      addFiles(e.dataTransfer.files);
    });

    document.getElementById("trySampleBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const tool = window.TOOLS_CATALOG.find((x) => x.id === state.activeToolId);
      if (!tool) return;
      const sampleFiles = await window.ConverterEngine.generateSampleFiles(tool.sampleType);
      state.files = sampleFiles;
      renderFileList();
      if (state.activeToolId === "organize-pdf" && state.files[0]) {
        loadOrganizerPages(state.files[0]);
      }
    });

    document.getElementById("clearAllBtn").addEventListener("click", () => {
      state.files = [];
      state.pagePlan = [];
      renderFileList();
    });

    document.getElementById("convertAnotherBtn").addEventListener("click", () => {
      revokeResultUrls();
      state.files = [];
      state.results = [];
      state.pagePlan = [];
      renderFileList();
    });

    document.getElementById("convertNowBtn").addEventListener("click", handleConvert);

    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("infoModal").addEventListener("click", (e) => {
      if (e.target.id === "infoModal") closeModal();
    });

    document.getElementById("ownerGuideBtn").addEventListener("click", () => {
      openModal(
        "💰 검색 상위 노출(SEO) 키워드 & 무료 배포 수익화 전략",
        `
        <div style="display:flex;flex-direction:column;gap:14px;font-size:0.9rem;line-height:1.65;">
          <p><strong>1. 구글/네이버에 내 사이트가 잘 뜨게 하는 4가지 핵심</strong><br>
          • <strong>도구별 독립 URL 구축 완료</strong>: <code>/pdf-to-jpg/</code>, <code>/compress-kb/</code>, <code>/heic-to-jpg/</code> 등 15개 개별 SEO 페이지와 JSON-LD 스키마가 자동 생성되어 검색봇이 각각 색인합니다.<br>
          • <strong>Cloudflare Pages 무료 배포</strong> 후 <strong>Google Search Console</strong> &amp; <strong>네이버 서치어드바이저</strong>에 <code>sitemap.xml</code>을 반드시 제출하세요.</p>

          <p><strong>2. 대형 사이트를 이기는 틈새(롱테일) 키워드 공략</strong><br>
          • 'PDF 변환' 같은 1단어는 경쟁이 매우 치열하므로, <strong>구체적 목적 키워드</strong> 유입이 핵심입니다.<br>
          • 국내 인기 틈새 키워드: <code>사진 용량 200kb 이하 줄이기</code>, <code>이력서 사진 용량 맞추기</code>, <code>아이폰 heic jpg 변환 윈도우</code>, <code>pdf 대외비 워터마크 넣기</code>, <code>카톡 캡처 세로 이어붙이기</code><br>
          • 영문 고단가 키워드: <code>compress image to 200kb</code>, <code>delete pages from pdf free</code>, <code>heic to jpg no upload</code></p>

          <p><strong>3. 백링크 &amp; 초기 유입 만들기 (비용 0원)</strong><br>
          • 네이버 블로그·티스토리·레딧(Reddit)·클리앙·에펨코리아 등에 <em>"서버 전송 없이 브라우저에서만 안전하게 원서 사진 200KB 맞추는 법"</em> 같은 팁 글에 사이트 링크를 자연스럽게 달아두면 초기 색인과 검색 순위가 빠르게 올라갑니다.</p>

          <p><strong>4. 수익화 연결 (<code>js/ads-config.js</code>)</strong><br>
          • 무료 <code>*.pages.dev</code> 상태: 카카오 애드핏 + 쿠팡 파트너스(사무용품/노트북 등) 먼저 연결.<br>
          • 일 방문자 300~500명 돌파 시 연 1만 원대 <code>.com</code> 도메인 연결 후 Google AdSense 전환.</p>

          <p><strong>5. 공유 댓글창 · 개발자 요청서 실시간 수신 (<code>js/feedback-config.js</code>)</strong><br>
          • <strong>공유 댓글창</strong>: <code>giscus.app/ko</code> 무료 연동 시 모든 방문자 간 댓글·반응 실시간 공유.<br>
          • <strong>요청서 수신</strong>: Formspree / Google Apps Script / Discord Webhook URL을 넣으면 기능 요청이 실시간 전달됩니다.</p>
        </div>
        `
      );
    });

    document.getElementById("licensesLink").addEventListener("click", () => {
      openModal(
        t().licensesLink,
        `
        <div style="display:flex;flex-direction:column;gap:12px;font-size:0.88rem;line-height:1.6;">
          <p>SwiftConvert runs 100% locally inside your browser using the following open-source libraries:</p>
          <ul style="padding-left:18px;display:flex;flex-direction:column;gap:8px;">
            <li><strong>PDF.js (Mozilla)</strong> — Apache License 2.0
              (<a href="https://github.com/mozilla/pdf.js" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">Source</a>)</li>
            <li><strong>pdf-lib</strong> — MIT License
              (<a href="https://github.com/Hopding/pdf-lib" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">Source</a>)</li>
            <li><strong>JSZip</strong> — Dual-licensed under MIT or GPLv3 (used under MIT License)
              (<a href="https://github.com/Stuk/jszip" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">Source</a>)</li>
            <li><strong>heic2any</strong> — MIT License wrapper bundling <strong>libheif</strong> &amp; <strong>libde265</strong> licensed under <strong>GNU LGPL v3.0</strong>
              (<a href="https://github.com/alexcorvi/heic2any" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">heic2any</a> /
               <a href="https://github.com/strukturag/libheif" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">libheif LGPL-3.0 Source</a>)</li>
          </ul>
          <p style="color:var(--text-muted);font-size:0.82rem;">
            Notice (LGPL-3.0): The HEIC decoding feature incorporates libheif (GNU LGPL v3.0). Source code for libheif and heic2any is publicly linked above in compliance with LGPL-3.0 requirements.
          </p>
        </div>
        `
      );
    });

    document.getElementById("privacyLink").addEventListener("click", () => {
      openModal(
        t().privacyLink,
        `<div style="display:flex;flex-direction:column;gap:10px;font-size:0.9rem;line-height:1.7;">
          <p><strong>1. 파일 로컬 처리 원칙 (No Server Upload)</strong><br>
          본 서비스(SwiftConvert)는 사용자가 선택한 PDF 및 이미지 파일을 외부 서버로 전송·저장하지 않습니다. 모든 변환은 사용자 웹 브라우저 내부(Client-side) 메모리에서 즉시 처리되며 창을 닫으면 즉시 소멸됩니다.</p>
          <p><strong>2. 광고 및 제3자 쿠키 안내</strong><br>
          향후 Google AdSense, Kakao AdFit 등 광고 파트너 연동 시 맞춤형 광고 제공을 위해 제3자 쿠키가 사용될 수 있습니다. 사용자는 브라우저 설정 또는 <a href="https://adssettings.google.com" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">Google 광고 설정</a>에서 맞춤형 광고를 거부할 수 있습니다.</p>
        </div>`
      );
    });

    document.getElementById("termsLink").addEventListener("click", () => {
      openModal(
        t().termsLink,
        `<p style="font-size:0.92rem;line-height:1.7;">
          본 웹사이트의 파일 변환 도구는 무료로 제공되며, 개인 및 상업적 용도로 자유롭게 사용하실 수 있습니다.
          모든 변환은 사용자의 브라우저 리소스를 활용하여 로컬로 실행되므로 대용량 파일 변환 시 기기 성능에 따라 속도가 달라질 수 있으며, 변환 전 원본 파일 백업을 권장합니다.
        </p>`
      );
    });

    updateStaticTexts();
    renderToolsGrid();

    const initialTool = detectToolFromLocation();
    if (initialTool) {
      openTool(initialTool, false);
    }

    if (window.FeedbackModule) {
      window.FeedbackModule.init({
        getLang: () => state.lang,
        getToolId: () => state.activeToolId,
        getTheme: () => state.theme,
        onOpenTool: (toolId) => openTool(toolId, true),
        onShowToast: showToast,
        onOpenModal: openModal
      });
    }

    window.addEventListener("popstate", () => {
      state._navigated = true;
      const tId = detectToolFromLocation();
      if (tId && tId !== state.activeToolId) {
        openTool(tId, false);
      } else if (!tId && state.activeToolId) {
        closeTool(false);
      }
    });

    window.addEventListener("hashchange", () => {
      if (!isFileProtocol) return;
      const tId = detectToolFromLocation();
      if (tId && tId !== state.activeToolId) {
        openTool(tId, false);
      } else if (!tId && state.activeToolId) {
        closeTool(false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
