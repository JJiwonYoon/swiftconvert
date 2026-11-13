#!/usr/bin/env python3
"""
Generate 15 dedicated static SEO landing pages (/<tool-id>/index.html),
sitemap.xml, and robots.txt from index.html + js/tools-seo.js.

Usage:
  python3 scripts/build_seo_pages.py
  python3 scripts/build_seo_pages.py --domain https://my-site.pages.dev
"""

import argparse
import hashlib
import html
import json
import os
import re
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


def build_json_ld(tool_id: str, seo_ko: dict, base_url: str) -> str:
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


def render_tool_page(template: str, tool_id: str, seo_ko: dict, base_url: str) -> str:
    page = template
    title_esc = html.escape(seo_ko["seoTitle"])
    desc_esc = html.escape(seo_ko["seoDesc"])
    kw_esc = html.escape(seo_ko["keywords"])
    tool_url = f"{base_url}/{tool_id}/"

    # Update head metadata
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
        f'<link rel="canonical" href="{html.escape(tool_url)}" />',
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

    # Replace JSON-LD block
    page = re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        build_json_ld(tool_id, seo_ko, base_url),
        page,
        flags=re.S,
    )

    # Adjust relative asset paths for 1-level subdirectory (/<tool-id>/)
    page = page.replace('href="css/style.css', 'href="../css/style.css')
    page = page.replace('href="./"', 'href="../"')
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

    steps_html = "".join(
        f'<li class="step-item"><span class="step-num">{idx + 1}</span><span>{html.escape(step)}</span></li>'
        for idx, step in enumerate(seo_ko.get("steps", []))
    )
    page = page.replace(
        '<ul class="step-list" id="howToStepsList"></ul>',
        f'<ul class="step-list" id="howToStepsList">{steps_html}</ul>',
    )

    faqs_html = "".join(
        f'<div class="faq-item"><div class="faq-q">Q. {html.escape(f["q"])}</div><div class="faq-a">{html.escape(f["a"])}</div></div>'
        for f in seo_ko.get("faqs", [])
    )
    page = page.replace(
        '<div class="faq-list" id="faqList"></div>',
        f'<div class="faq-list" id="faqList">{faqs_html}</div>',
    )

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
    index_path = ROOT / "index.html"
    template = index_path.read_text(encoding="utf-8")

    # Update canonical and asset cache-busting hashes in index.html
    updated_index = re.sub(
        r'<link\s+rel="canonical"\s+href="[^"]*"\s*/>',
        f'<link rel="canonical" href="{html.escape(base_url)}/" />',
        template,
    )
    updated_index = apply_cache_busting(updated_index)
    if updated_index != template:
        index_path.write_text(updated_index, encoding="utf-8")
        template = updated_index

    sitemap_urls = [f"  <url>\n    <loc>{base_url}/</loc>\n    <priority>1.0</priority>\n  </url>"]

    for tool_id, entry in tools_seo.items():
        seo_ko = entry["ko"]
        out_dir = ROOT / tool_id
        out_dir.mkdir(parents=True, exist_ok=True)
        rendered = render_tool_page(template, tool_id, seo_ko, base_url)
        (out_dir / "index.html").write_text(rendered, encoding="utf-8")
        sitemap_urls.append(
            f"  <url>\n    <loc>{base_url}/{tool_id}/</loc>\n    <priority>0.9</priority>\n  </url>"
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

    print(f"Generated {len(tools_seo)} static SEO tool pages, sitemap.xml, and robots.txt for {base_url}")


if __name__ == "__main__":
    main()
