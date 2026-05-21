# CLAUDE.md — AI Assistant Guide for iabard.com

## Project Overview

This is the personal poetry website for **Ипатия Бард (Hypatia Bard / Ия Бард)** — a Russian-speaking poet, philosopher, and spiritual writer. The live site is at `iabard.com`. It showcases her published books, spiritual poetry, zodiac poems, and YouTube Shorts content.

**Key fact**: This is a zero-build, single-file static site. There is no compilation step, no Node.js, no package manager. All code lives in `index.html`.

---

## Repository Structure

```
iabard-/
├── index.html                  # Entire website (HTML + inline CSS + inline JS)
├── 404.html                    # Custom 404 page
├── landing-page-draft.html     # Design scratch pad (not deployed)
├── background.jpg              # Hero section background image
├── manifest.json               # PWA manifest
├── robots.txt                  # SEO directives
├── sitemap.xml                 # SEO sitemap (single homepage entry)
├── CNAME                       # Domain: iabard.com
├── netlify.toml                # Netlify cache/redirect config
└── .github/
    └── workflows/
        ├── pages.yml           # GitHub Pages deployment on push to main
        └── youtube-sync.yml    # Daily cron: fetches top 10 Shorts from @ia_bard
```

---

## Technology Stack

| Layer | Choice |
|-------|--------|
| Markup | HTML5 (semantic, ARIA-compliant) |
| Styling | Inline CSS with CSS custom properties |
| Scripting | Vanilla JavaScript (no frameworks) |
| Fonts | Google Fonts — Great Vibes, Cormorant Garamond, Raleway |
| Hosting | Netlify (primary) + GitHub Pages (fallback) |
| Automation | GitHub Actions (deployment + YouTube sync) |

---

## Development Workflow

### Making Changes

1. Edit `index.html` directly — it contains all HTML, CSS, and JS.
2. There is no build step. Changes take effect immediately when the file is saved.
3. Preview locally by opening `index.html` in a browser.
4. Commit and push to `main` to deploy.

### Deployment

- **Netlify** auto-deploys on every push to `main` (connected via GitHub integration).
- **GitHub Pages** also deploys via `.github/workflows/pages.yml` as a fallback.
- `netlify.toml` sets cache headers:
  - HTML files: `no-cache` (always fresh)
  - Images: 1-year cache
  - `manifest.json`, `robots.txt`, `sitemap.xml`: 1-day cache

### No Tests

There is no test suite. Validation is done by visually inspecting the site in a browser.

---

## YouTube Auto-Sync

The **Новинки** (Latest Shorts) tab is automatically updated daily by `.github/workflows/youtube-sync.yml`.

**How it works**:
1. A cron job runs at 06:00 UTC daily.
2. An embedded Python 3 script fetches the top 10 Shorts from YouTube channel `@ia_bard`.
3. The script replaces the HTML between two marker comments in `index.html`:
   ```html
   <!-- YT-NOVINKA-START -->
   ...generated video cards...
   <!-- YT-NOVINKA-END -->
   ```
4. If content changed, the workflow auto-commits and pushes with message `Auto-sync: latest 10 Shorts from @ia_bard`.

**Important**: Never manually edit HTML between the `YT-NOVINKA-START` and `YT-NOVINKA-END` markers — it will be overwritten by the next sync.

---

## Code Conventions

### CSS Custom Properties (Color Palette)

Defined in `:root` at the top of the `<style>` block:

```css
--cream:  #fdf6ee  /* Page background */
--blush:  #f2d9d0  /* Soft accent */
--mauve:  #c9a0b4  /* Mid accent */
--plum:   #5c3d55  /* Primary brand color, headers */
--gold:   #b8860b  /* CTAs, highlights */
--deep:   #2e1a35  /* Dark text, footer */
```

Always use these variables instead of hardcoded color values.

### Typography

Three font roles — use consistently:
- `'Great Vibes'` — decorative display (the poet's name, section headers)
- `'Cormorant Garamond'` — body serif (poem text, book descriptions)
- `'Raleway'` — UI sans-serif (navigation, buttons, labels)

### Responsive Breakpoints

```css
@media (max-width: 860px)  /* Tablet */
@media (max-width: 600px)  /* Mobile */
@media (max-width: 520px)  /* Small mobile */
```

### Tab System

Tabs use a CSS show/hide pattern controlled by `switchTab()` in JavaScript:

```html
<button role="tab" aria-selected="true" onclick="switchTab('books')">Книги</button>
...
<div id="panel-books" role="tabpanel">...</div>
```

- All tab panels are in the DOM; only the active one has `display` other than `none`.
- Always include `role`, `aria-selected`, and `aria-controls` attributes when adding tabs.

### Book Cards

Books use a CSS 3D flip-card pattern:
- Front: cover image
- Back: title, description, purchase link to BookBaby store
- Flip triggered on click via `data-flip` attribute

### SVG Icons

Social media icons are SVG inline — no external icon library. When adding new social links, embed the SVG directly in the HTML.

---

## Content Structure (Tabs)

| Tab ID | Russian Label | Content |
|--------|---------------|---------|
| `books` | Книги | 10 published books with flip-card previews |
| `zodiac` | Зодиак | 14 zodiac sign poems + YouTube embeds |
| `novinka` | Новинки | Auto-synced top 10 YouTube Shorts (daily) |
| `about` | Кто я? | Author bio, poem, contact info, Stihi.ru link |
| `shop` | Магазин | Coming soon placeholder |

---

## External Services & Links

| Service | Purpose |
|---------|---------|
| YouTube (`@ia_bard`) | Video content, Shorts auto-sync |
| BookBaby | Book cover images + purchase links |
| Stihi.ru | Russian poetry platform profile |
| Telegram | Manuscript/channel links |
| Google Fonts | Font delivery |
| Netlify | Primary hosting |
| GitHub Pages | Fallback hosting |

---

## SEO & Metadata

`index.html` includes comprehensive SEO in `<head>`:
- Full Open Graph tags (og:title, og:description, og:image, og:url)
- Twitter Card tags
- JSON-LD structured data (`Person` schema for the poet)
- Canonical URL
- `sitemap.xml` references the homepage with `weekly` changefreq

When updating the site title, description, or URL, update **all three locations**: the `<meta>` tags, the Open Graph tags, and the JSON-LD block.

---

## PWA Configuration

`manifest.json` configures the site as a Progressive Web App:
- Short name: `Ипатия Бард`
- Theme color: `#5c3d55` (matches `--plum`)
- Display mode: `standalone`

Keep `theme_color` in `manifest.json` in sync with `--plum` in the CSS.

---

## Git Conventions

- `main` branch is production — every push deploys.
- Automated commits from the YouTube sync workflow use the message format: `Auto-sync: latest 10 Shorts from @ia_bard`
- Manual commits should be concise and describe the content change (e.g., `Add book 11: The Silent Garden`, `Fix zodiac tab mobile layout`).

---

## What NOT to Do

- **Do not** add a build system, bundler, or npm unless there is a specific, compelling reason. The zero-build approach is intentional.
- **Do not** edit HTML between `<!-- YT-NOVINKA-START -->` and `<!-- YT-NOVINKA-END -->` markers — the sync workflow overwrites this block daily.
- **Do not** hardcode colors — always use the CSS custom properties defined in `:root`.
- **Do not** introduce JavaScript frameworks (React, Vue, etc.) for what is a content site.
- **Do not** commit `landing-page-draft.html` changes as production code — it is a scratch file.
