import subprocess, re, sys, json, os

HANDLE          = "ia_bard"
HTML_FILE       = "index.html"
POEMS_FILE      = "poem_queue.txt"
VIDEO_POEMS_FILE = "video_poems.json"
START_MARKER    = "<!-- YT-NOVINKA-START -->"
END_MARKER      = "<!-- YT-NOVINKA-END -->"
MAX_VIDEOS      = 20
BATCH_SIZE      = 5
POEM_SEP        = "==="

# ── 1. Fetch Shorts ──────────────────────────────────────────────────────────
print("Fetching Shorts via yt-dlp...")
result = subprocess.run(
    [
        "yt-dlp",
        "--flat-playlist",
        "--print", "id",
        "--playlist-items", f"1:{MAX_VIDEOS}",
        "--no-warnings",
        f"https://www.youtube.com/@{HANDLE}/shorts",
    ],
    capture_output=True, text=True, timeout=120
)

video_ids = [
    line.strip()
    for line in result.stdout.strip().split("\n")
    if re.match(r"^[A-Za-z0-9_-]{11}$", line.strip())
]

if result.stderr:
    print("yt-dlp stderr:", result.stderr[:400])

if not video_ids:
    print("No videos found. Skipping.")
    sys.exit(0)

print(f"Found {len(video_ids)} Shorts: {video_ids}")

# ── 2. Load persistent poem assignments ──────────────────────────────────────
video_poems = {}
if os.path.exists(VIDEO_POEMS_FILE):
    with open(VIDEO_POEMS_FILE, encoding="utf-8") as f:
        video_poems = json.load(f)

# ── 3. Load poem queue ───────────────────────────────────────────────────────
poem_queue = []
if os.path.exists(POEMS_FILE):
    with open(POEMS_FILE, encoding="utf-8") as f:
        raw = f.read().strip()
    if raw:
        pieces = []
        for p in raw.split(POEM_SEP):
            cleaned = "\n".join(l for l in p.split("\n") if not l.strip().startswith("#")).strip()
            if cleaned:
                pieces.append(cleaned)
        poem_queue = pieces

# ── 4. Assign poems to new videos ────────────────────────────────────────────
new_videos = [vid for vid in video_ids if vid not in video_poems]
if new_videos:
    print(f"New videos: {new_videos}, poems available: {len(poem_queue)}")
    for vid in new_videos:
        video_poems[vid] = poem_queue.pop(0) if poem_queue else ""

    with open(VIDEO_POEMS_FILE, "w", encoding="utf-8") as f:
        json.dump(video_poems, f, ensure_ascii=False, indent=2)

    remaining = ("\n" + POEM_SEP + "\n").join(poem_queue)
    with open(POEMS_FILE, "w", encoding="utf-8") as f:
        f.write(remaining)

# ── 5. Convert poem text → HTML ──────────────────────────────────────────────
def poem_to_html(text):
    if not text or not text.strip():
        return ""
    stanzas = [s.strip() for s in text.strip().split("\n\n") if s.strip()]
    html_parts = []
    for stanza in stanzas:
        lines = stanza.split("\n")
        inner = "<br>\n".join(line.rstrip() for line in lines)
        html_parts.append(f'        <div class="stanza">{inner}\n        </div>')
    return '\n        <div class="novinka-poem">\n' + "\n".join(html_parts) + '\n        </div>'

# ── 6. Build HTML cards ───────────────────────────────────────────────────────
cards = []
for i, vid in enumerate(video_ids):
    poem_html = poem_to_html(video_poems.get(vid, ""))
    hidden = ' novinka-hidden' if i >= BATCH_SIZE else ''
    cards.append(
        f'      <div class="novinka-card{hidden}">\n'
        f'        <div class="novinka-video">\n'
        f'          <div class="yt-facade" data-vid="{vid}" onclick="ytPlay(this)">\n'
        f'            <img src="https://img.youtube.com/vi/{vid}/hqdefault.jpg"'
        f' alt="Ипатия Бард">\n'
        f'            <button class="yt-play" aria-label="Смотреть видео">&#9654;</button>\n'
        f'          </div>\n'
        f'        </div>'
        + poem_html + '\n'
        f'      </div>'
    )

# ── 7. Update index.html ──────────────────────────────────────────────────────
with open(HTML_FILE, encoding="utf-8") as f:
    html = f.read()

block_m = re.search(
    re.escape(START_MARKER) + r"(.*?)" + re.escape(END_MARKER),
    html, re.DOTALL
)
if not block_m:
    print("ERROR: markers not found in HTML")
    sys.exit(1)

new_section = (
    "\n  " + START_MARKER + "\n"
    "  <div id=\"novinka\" class=\"tab-panel\" role=\"tabpanel\" aria-labelledby=\"tab-novinka\">\n"
    "    <div class=\"novinka-list\">\n"
    + "\n".join(cards) + "\n"
    + "    </div>\n"
    "    <button id=\"novinka-load-btn\" class=\"novinka-load-btn\" onclick=\"loadMoreNovinka()\">Листать дальше</button>\n"
    "    <div id=\"novinka-cta\" style=\"display:none;flex-direction:column;align-items:center;gap:12px;margin-top:40px;\">\n"
    "      <a href=\"https://youtube.com/@ia_bard/shorts\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"novinka-cta novinka-cta-yt\">\n"
    "        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z\"/></svg>\n"
    "        Все видео на YouTube\n"
    "      </a>\n"
    "      <a href=\"https://t.me/IA_Bard\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"novinka-cta novinka-cta-tg\">\n"
    "        <svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z\"/></svg>\n"
    "        Рукопись\n"
    "      </a>\n"
    "    </div>\n"
    "  </div>\n"
    "  " + END_MARKER + "\n"
)

html_new = html[:block_m.start()] + new_section + html[block_m.end():]

with open(HTML_FILE, "w", encoding="utf-8") as f:
    f.write(html_new)

print(f"Done - wrote {len(cards)} cards, {len(new_videos)} new, {len(poem_queue)} poems remaining in queue.")
