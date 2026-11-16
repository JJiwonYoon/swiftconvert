#!/usr/bin/env python3
"""
Generate static SEO pre-rendered HTML for index.html and all tool pages
(/<tool-id>/index.html), plus sitemap.xml and robots.txt from
index.html + js/i18n.js + js/tools-seo.js.

Usage:
  python3 scripts/build_seo_pages.py
  python3 scripts/build_seo_pages.py --domain https://leafconvert.pages.dev
"""

import argparse
from datetime import date
import hashlib
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

JS_FILES = (
    "ads-config.js",
    "feedback-config.js",
    "tools-seo.js",
    "i18n.js",
    "converters.js",
    "editors.js",
    "feedback.js",
    "app.js",
)


def asset_hash(rel_path: str) -> str:
    data = (ROOT / rel_path).read_bytes()
    return hashlib.md5(data).hexdigest()[:8]


def apply_cache_busting(html_text: str) -> str:
    css_v = asset_hash("css/style.css")
    html_text = re.sub(
        r'href="css/style\.css(?:\?v=[^"]*)?"',
        f'href="css/style.css?v={css_v}"',
        html_text,
    )
    for js_file in JS_FILES:
        js_v = asset_hash(f"js/{js_file}")
        html_text = re.sub(
            rf'src="js/{re.escape(js_file)}(?:\?v=[^"]*)?"',
            f'src="js/{js_file}?v={js_v}"',
            html_text,
        )
    return html_text


def load_tools_seo() -> dict:
    raw = (ROOT / "js" / "tools-seo.js").read_text(encoding="utf-8")
    prefix = "window.TOOLS_SEO = "
    idx = raw.find(prefix)
    if idx < 0:
        raise ValueError("window.TOOLS_SEO not found in js/tools-seo.js")
    json_str = raw[idx + len(prefix) :].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    return json.loads(json_str)


def load_i18n_data() -> tuple[list, dict]:
    """Load TOOLS_CATALOG and I18N.ko directly from js/i18n.js without duplicating metadata."""
    i18n_path = ROOT / "js" / "i18n.js"
    gjs_bin = shutil.which("gjs")
    if gjs_bin:
        script = (
            "const window = {};"
            f"const bytes = imports.gi.Gio.File.new_for_path({json.dumps(str(i18n_path))}).load_contents(null)[1];"
            "eval(new TextDecoder().decode(bytes));"
            "print(JSON.stringify({catalog: window.TOOLS_CATALOG, ko: window.I18N.ko}));"
        )
        out = subprocess.check_output([gjs_bin, "-c", script], text=True)
        parsed = json.loads(out)
        return parsed["catalog"], parsed["ko"]

    node_bin = shutil.which("node")
    if node_bin:
        script = (
            "const fs = require('fs');"
            "const window = {};"
            f"eval(fs.readFileSync({json.dumps(str(i18n_path))}, 'utf8'));"
            "process.stdout.write(JSON.stringify({catalog: window.TOOLS_CATALOG, ko: window.I18N.ko}));"
        )
        out = subprocess.check_output([node_bin, "-e", script], text=True)
        parsed = json.loads(out)
        return parsed["catalog"], parsed["ko"]

    raise RuntimeError("Neither gjs nor node is available to evaluate js/i18n.js")


def replace_ssr_block(html_text: str, marker: str, inner_html: str) -> str:
    start_tag = f"<!-- SSR:{marker}:START -->"
    end_tag = f"<!-- SSR:{marker}:END -->"
    pattern = re.compile(rf"{re.escape(start_tag)}.*?{re.escape(end_tag)}", flags=re.S)
    if not pattern.search(html_text):
        raise ValueError(f"SSR marker pair {start_tag} ... {end_tag} not found")
    return pattern.sub(f"{start_tag}{inner_html}{end_tag}", html_text, count=1)


def render_steps_html(steps: list) -> str:
    return "".join(
        f'<li class="step-item"><span class="step-num">{idx + 1}</span><span>{html.escape(step)}</span></li>'
        for idx, step in enumerate(steps)
    )


def render_faqs_html(faqs: list) -> str:
    return "".join(
        f'<div class="faq-item"><div class="faq-q">Q. {html.escape(f["q"])}</div><div class="faq-a">{html.escape(f["a"])}</div></div>'
        for f in faqs
    )


def render_tool_cards_html(tools_catalog: list, ko_strings: dict, prefix: str = "./") -> str:
    cta_text = html.escape(ko_strings["useToolBtn"])
    parts = []
    for tool in tools_catalog:
        tid = tool["id"]
        name = html.escape(tool["names"].get("ko") or tool["names"]["en"])
        desc = html.escape(tool["descs"].get("ko") or tool["descs"]["en"])
        icon = html.escape(tool["icon"])
        color = html.escape(tool["color"])
        badge = tool.get("badge") or ""
        badge_cls = "hot" if badge == "HOT" else ("new" if badge == "NEW" else "")
        badge_html = (
            f'<span class="tool-badge {badge_cls}">{html.escape(badge)}</span>' if badge else ""
        )
        href = html.escape(f"{prefix}{tid}/")
        parts.append(
            f'<a href="{href}" class="tool-card" style="--card-accent:{color}" data-tool-id="{html.escape(tid)}">'
            f'<div class="tool-card-header">'
            f'<div class="tool-icon" style="background:{color}">{icon}</div>'
            f"{badge_html}"
            f"</div>"
            f"<h3>{name}</h3>"
            f"<p>{desc}</p>"
            f'<div class="tool-card-footer"><span>{cta_text}</span></div>'
            f"</a>"
        )
    return "".join(parts)


def render_related_cards_html(
    rel_ids: list, catalog_by_id: dict, ko_strings: dict, prefix: str = "../"
) -> str:
    cta = html.escape(ko_strings["relatedCta"])
    parts = []
    for rel_id in rel_ids:
        rt = catalog_by_id.get(rel_id)
        if not rt:
            continue
        name = html.escape(rt["names"].get("ko") or rt["names"]["en"])
        desc = html.escape(rt["descs"].get("ko") or rt["descs"]["en"])
        icon = html.escape(rt["icon"])
        color = html.escape(rt["color"])
        badge = rt.get("badge") or ""
        badge_html = (
            f'<span class="related-card-badge">{html.escape(badge)}</span>' if badge else ""
        )
        href = html.escape(f"{prefix}{rel_id}/")
        parts.append(
            f'<a href="{href}" class="related-card" style="--card-accent:{color}" data-rel-tool="{html.escape(rel_id)}">'
            f'<span class="related-card-icon" style="background:{color}">{icon}</span>'
            f'<span class="related-card-body">'
            f'<span class="related-card-title-row">'
            f'<span class="related-card-title">{name}</span>'
            f"{badge_html}"
            f"</span>"
            f'<span class="related-card-desc">{desc}</span>'
            f"</span>"
            f'<span class="related-card-arrow">{cta} →</span>'
            f"</a>"
        )
    return "".join(parts)


def build_home_json_ld(base_url: str, tools_catalog: list, ko_strings: dict) -> str:
    app_schema = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "LeafConvert",
        "url": f"{base_url}/",
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "All",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "description": "Free client-side PDF & image toolkit: Compress PDF, Sign PDF, Unlock PDF, PDF to JPG/PNG, PDF to Text, Compress to 200KB, Crop, Pixelate/Blur, and Lossless EXIF/GPS Remover.",
    }
    item_list_schema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "LeafConvert PDF & Image Tools",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": idx + 1,
                "name": tool["names"].get("ko") or tool["names"]["en"],
                "url": f"{base_url}/{tool['id']}/",
            }
            for idx, tool in enumerate(tools_catalog)
        ],
    }
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["q"],
                "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
            }
            for item in ko_strings.get("faqs", [])
        ],
    }
    return (
        '<script type="application/ld+json">\n  '
        + json.dumps([app_schema, item_list_schema, faq_schema], ensure_ascii=False, indent=2)
        + "\n  </script>"
    )


def build_tool_json_ld(tool_id: str, seo_ko: dict, base_url: str) -> str:
    app_schema = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": seo_ko["seoTitle"].split(" | ")[0],
        "url": f"{base_url}/{tool_id}/",
        "applicationCategory": "UtilitiesApplication",
        "operatingSystem": "All",
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        "description": seo_ko["seoDesc"],
    }
    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["q"],
                "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
            }
            for item in seo_ko.get("faqs", [])
        ],
    }
    return (
        '<script type="application/ld+json">\n'
        + json.dumps([app_schema, faq_schema], ensure_ascii=False, indent=2)
        + "\n  </script>"
    )


def update_home_index(
    template: str, tools_catalog: list, ko_strings: dict, base_url: str
) -> str:
    home_url_esc = html.escape(f"{base_url}/")
    updated = re.sub(
        r'<link\s+rel="canonical"\s+href="[^"]*"\s*/>',
        f'<link rel="canonical" href="{home_url_esc}" />',
        template,
    )
    updated = re.sub(
        r'<meta\s+property="og:url"\s+content="[^"]*"\s*/>',
        f'<meta property="og:url" content="{home_url_esc}" />',
        updated,
    )
    updated = re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        build_home_json_ld(base_url, tools_catalog, ko_strings),
        updated,
        count=1,
        flags=re.S,
    )
    updated = replace_ssr_block(
        updated, "TOOLS_GRID", render_tool_cards_html(tools_catalog, ko_strings, prefix="./")
    )
    updated = replace_ssr_block(updated, "RELATED", "")
    updated = replace_ssr_block(updated, "STEPS", render_steps_html(ko_strings.get("howToSteps", [])))
    updated = replace_ssr_block(updated, "FAQS", render_faqs_html(ko_strings.get("faqs", [])))
    return apply_cache_busting(updated)


def render_tool_page(
    template: str,
    tool_id: str,
    seo_ko: dict,
    rel_ids: list,
    catalog_by_id: dict,
    ko_strings: dict,
    base_url: str,
) -> str:
    page = template
    title_esc = html.escape(seo_ko["seoTitle"])
    desc_esc = html.escape(seo_ko["seoDesc"])
    kw_esc = html.escape(seo_ko["keywords"])
    tool_url_esc = html.escape(f"{base_url}/{tool_id}/")

    page = re.sub(r"<title>.*?</title>", f"<title>{title_esc}</title>", page, flags=re.S)
    page = re.sub(
        r'<meta\s+name="description"\s+content="[^"]*"\s*/>',
        f'<meta name="description" content="{desc_esc}" />',
        page,
        flags=re.S,
    )
    page = re.sub(
        r'<meta\s+name="keywords"\s+content="[^"]*"\s*/>',
        f'<meta name="keywords" content="{kw_esc}" />',
        page,
        flags=re.S,
    )
    page = re.sub(
        r'<link\s+rel="canonical"\s+href="[^"]*"\s*/>',
        f'<link rel="canonical" href="{tool_url_esc}" />',
        page,
    )
    page = re.sub(
        r'<meta\s+property="og:url"\s+content="[^"]*"\s*/>',
        f'<meta property="og:url" content="{tool_url_esc}" />',
        page,
    )
    page = re.sub(
        r'<meta\s+property="og:title"\s+content="[^"]*"\s*/>',
        f'<meta property="og:title" content="{title_esc}" />',
        page,
    )
    page = re.sub(
        r'<meta\s+property="og:description"\s+content="[^"]*"\s*/>',
        f'<meta property="og:description" content="{desc_esc}" />',
        page,
        flags=re.S,
    )

    page = re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        build_tool_json_ld(tool_id, seo_ko, base_url),
        page,
        count=1,
        flags=re.S,
    )

    # Clear homepage 19-card grid inside hidden homeView to avoid duplicate boilerplate across tool pages
    page = replace_ssr_block(page, "TOOLS_GRID", "")

    # Rewrite relative asset and navigation links for 1-level subdirectory (/<tool-id>/)
    page = page.replace('href="css/style.css', 'href="../css/style.css')
    page = page.replace('href="./', 'href="../')
    for js_file in JS_FILES:
        page = page.replace(f'src="js/{js_file}', f'src="../js/{js_file}')

    # Inject INITIAL_TOOL_ID right before ads-config
    page = re.sub(
        r'(<script src="\.\./js/ads-config\.js(?:\?v=[^"]*)?"></script>)',
        f'<script>window.INITIAL_TOOL_ID = "{tool_id}";</script>\n  \\1',
        page,
    )

    # Pre-activate workspace & render unique static content for crawlers
    page = page.replace('<section id="homeView">', '<section id="homeView" style="display:none;">')
    page = page.replace(
        '<section id="workspaceView" class="workspace-wrapper">',
        '<section id="workspaceView" class="workspace-wrapper active">',
    )
    heading_short = html.escape(seo_ko["seoTitle"].split(" - ")[0].split(" | ")[0])
    page = re.sub(
        r'<h1 id="activeToolTitle">.*?</h1>',
        f'<h1 id="activeToolTitle">{heading_short}</h1>',
        page,
    )
    page = re.sub(
        r'<p id="activeToolDesc"></p>',
        f'<p id="activeToolDesc">{desc_esc}</p>',
        page,
    )

    related_html = render_related_cards_html(rel_ids, catalog_by_id, ko_strings, prefix="../")
    if related_html:
        page = page.replace(
            '<div class="related-tools-box" id="relatedToolsBox" style="display:none;">',
            '<div class="related-tools-box" id="relatedToolsBox" style="display:block;">',
        )
    page = replace_ssr_block(page, "RELATED", related_html)
    page = replace_ssr_block(page, "STEPS", render_steps_html(seo_ko.get("steps", [])))
    page = replace_ssr_block(page, "FAQS", render_faqs_html(seo_ko.get("faqs", [])))

    return page


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--domain",
        default="https://leafconvert.pages.dev",
        help="Site base URL",
    )
    args = parser.parse_args()
    base_url = args.domain.rstrip("/")

    tools_seo = load_tools_seo()
    tools_catalog, ko_strings = load_i18n_data()
    catalog_by_id = {t["id"]: t for t in tools_catalog}

    index_path = ROOT / "index.html"
    template = index_path.read_text(encoding="utf-8")
    updated_index = update_home_index(template, tools_catalog, ko_strings, base_url)
    if updated_index != template:
        index_path.write_text(updated_index, encoding="utf-8")
        template = updated_index

    today_iso = date.today().isoformat()
    sitemap_urls = [
        f"  <url>\n    <loc>{base_url}/</loc>\n    <lastmod>{today_iso}</lastmod>\n    <priority>1.0</priority>\n  </url>"
    ]

    for tool_id, entry in tools_seo.items():
        seo_ko = entry["ko"]
        rel_ids = entry.get("related", [])
        out_dir = ROOT / tool_id
        out_dir.mkdir(parents=True, exist_ok=True)
        rendered = render_tool_page(
            template, tool_id, seo_ko, rel_ids, catalog_by_id, ko_strings, base_url
        )
        (out_dir / "index.html").write_text(rendered, encoding="utf-8")
        sitemap_urls.append(
            f"  <url>\n    <loc>{base_url}/{tool_id}/</loc>\n    <lastmod>{today_iso}</lastmod>\n    <priority>0.9</priority>\n  </url>"
        )

    sitemap_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(sitemap_urls)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap_xml, encoding="utf-8")

    robots_txt = (
        "User-agent: *\n"
        "Allow: /\n\n"
        f"Sitemap: {base_url}/sitemap.xml\n"
    )
    (ROOT / "robots.txt").write_text(robots_txt, encoding="utf-8")

    print(
        f"Generated SSR index.html, {len(tools_seo)} static SEO tool pages, sitemap.xml, and robots.txt for {base_url}"
    )


if __name__ == "__main__":
    main()
