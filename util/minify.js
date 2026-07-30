/**
 * Post-build minifier / obfuscator for the generated `docs/` output.
 *
 * Runs as a single pass after Eleventy writes its files, because the CSS and
 * the HTML have to agree on the mangled class names — doing it in one place
 * keeps that ordering deterministic.
 *
 * Steps:
 *   1. Read the built stylesheet and build a `.long-name` -> `.a` rename map.
 *   2. Rewrite + minify the stylesheet.
 *   3. Rewrite every `class="..."` in the built HTML, then minify the HTML
 *      (which also strips comments and minifies the inline analytics script).
 *
 * Note: this only obscures the *markup* — the poems and stories are plain text
 * in the HTML and must stay readable to browsers, crawlers and screen readers.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// lightningcss, not clean-css: clean-css 5.x predates @starting-style and throws
// on it outright, and silently drops `transition-behavior: allow-discrete`. Both
// are required by the theme menu's open/close animation.
const { transform: transformCss } = require("lightningcss");
const { minify: minifyHtml } = require("html-minifier-terser");

// Flip to false to keep human-readable class names while still minifying.
const MANGLE_CLASS_NAMES = true;

/**
 * Sentinel wrapped around masked string literals. It is a Unicode private-use
 * character, so it cannot legitimately appear in a stylesheet. Building it with
 * String.fromCharCode rather than embedding it literally keeps this source plain
 * ASCII with no invisible characters — and avoids the NUL that an earlier version
 * used here, which made git treat the file as binary.
 */
const SENTINEL = String.fromCharCode(0xe000);

const HTML_MINIFIER_OPTIONS = {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  removeAttributeQuotes: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
  sortAttributes: true,
  sortClassName: true,
  minifyJS: true,
  minifyCSS: true,
  // Inline SVG lives in the homepage; `<path ... />` must keep its slash so the
  // HTML parser closes it inside foreign content.
  keepClosingSlash: true
};

/**
 * Replace comments and quoted strings with placeholders, so neither is ever
 * mistaken for a selector.
 *
 * Comments MUST be consumed first, and by the same pass. Masking only strings
 * lets an apostrophe inside a comment ("body's line-height") open a phantom
 * string literal that swallows every rule up to the next apostrophe — those
 * rules then keep their original class names while the rest of the file is
 * renamed, producing selectors that silently match nothing in the built HTML.
 */
function maskLiterals(css) {
  const strings = [];
  const literalPattern = /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  const masked = css.replace(literalPattern, (match) => {
    strings.push(match);
    return SENTINEL + (strings.length - 1) + SENTINEL;
  });
  return { masked, strings };
}

function unmaskLiterals(css, strings) {
  const pattern = new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g");
  return css.replace(pattern, (_, i) => strings[Number(i)]);
}

/**
 * Derive a short name from the class name itself, NOT from its position.
 *
 * Positional names (a, b, c… by sort order) are reshuffled by any edit to the
 * stylesheet: adding one rule can turn `.m` from the theme label into a toggle
 * icon. HTML and CSS then only agree when both come from the same build, so any
 * stale copy of either — browser cache, CDN, an open tab — paints the wrong
 * rules onto the wrong elements. That failure is invisible in the source and
 * looks exactly like a styling bug.
 *
 * Hashing the name instead makes the mapping stable: `menu-label` gets the same
 * token in every build, so a mismatched pair degrades to "some new class is
 * unstyled" rather than "this element stole another element's colour".
 */
function shortName(name, taken) {
  const digest = crypto.createHash("sha1").update(name).digest("hex");
  for (let len = 4; len <= 12; len++) {
    const candidate = "x" + parseInt(digest.slice(0, 10), 16).toString(36).slice(0, len);
    if (!taken.has(candidate)) return candidate;
  }
  // Astronomically unlikely; fall back to the full digest.
  return "x" + digest;
}

/**
 * Collect class names from selector position only (the text before each `{`),
 * skipping at-rule preludes like `@media (...)` and `@font-face`.
 */
function collectClassNames(maskedCss) {
  const names = new Set();
  const rulePattern = /(^|[{};])([^{}@;]+)\{/g;
  let rule;
  while ((rule = rulePattern.exec(maskedCss)) !== null) {
    const selector = rule[2];
    const classPattern = /\.(-?[_a-zA-Z][\w-]*)/g;
    let cls;
    while ((cls = classPattern.exec(selector)) !== null) {
      names.add(cls[1]);
    }
  }
  return names;
}

function buildClassMap(css) {
  if (!MANGLE_CLASS_NAMES) return new Map();
  const { masked } = maskLiterals(css);
  // Longest first so the alternation regex prefers the most specific match.
  const names = [...collectClassNames(masked)].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  );
  const taken = new Set();
  const map = new Map();
  for (const name of names) {
    const short = shortName(name, taken);
    taken.add(short);
    map.set(name, short);
  }
  return map;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rename every mapped class in the stylesheet in a single pass. */
function renameCssClasses(css, classMap) {
  if (classMap.size === 0) return css;
  const { masked, strings } = maskLiterals(css);
  const alternation = [...classMap.keys()].map(escapeRegExp).join("|");
  const pattern = new RegExp("\\.(" + alternation + ")(?![\\w-])", "g");
  const renamed = masked.replace(pattern, (_, name) => "." + classMap.get(name));
  return unmaskLiterals(renamed, strings);
}

/** Rewrite `class="..."` / `class='...'` token lists in built HTML. */
function renameHtmlClasses(html, classMap) {
  if (classMap.size === 0) return html;
  return html.replace(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _quoted, dq, sq) => {
    const raw = dq !== undefined ? dq : sq;
    const quote = dq !== undefined ? '"' : "'";
    const renamed = raw
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => classMap.get(token) || token)
      .join(" ");
    return " class=" + quote + renamed + quote;
  });
}

/**
 * Stamp the stylesheet URL with a hash of its contents.
 *
 * This is not an optimisation, it is a correctness requirement. Mangled class
 * names are positional — adding or removing a rule reshuffles them, so `.m` may
 * be the theme label in one build and a toggle icon in the next. HTML and CSS
 * are therefore only valid as a matched pair: a browser (or CDN) holding a
 * cached stylesheet while loading fresh HTML will apply the wrong rules to the
 * wrong elements, which looks like a styling bug rather than a caching one.
 *
 * The hash changes whenever the CSS changes, so the pair can never skew.
 */
function addCssCacheBuster(html, hash) {
  // Match quoted or unquoted (already-minified files in the output directory
  // have had their quotes stripped by a previous run), but always emit quoted —
  // an unquoted value containing `?` trips the HTML parser downstream.
  return html.replace(
    /href=(["']?)\/css\/style\.css(?:\?v=[a-f0-9]+)?\1/g,
    'href="/css/style.css?v=' + hash + '"'
  );
}

function collectHtmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectHtmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

/**
 * @param {string} outputDir  Eleventy's output directory (`docs`).
 */
async function minifyOutput(outputDir) {
  if (!fs.existsSync(outputDir)) return;

  const cssPath = path.join(outputDir, "css", "style.css");
  let classMap = new Map();
  let cssHash = null;

  if (fs.existsSync(cssPath)) {
    const source = fs.readFileSync(cssPath, "utf8");
    classMap = buildClassMap(source);
    const { code } = transformCss({
      filename: "style.css",
      code: Buffer.from(renameCssClasses(source, classMap)),
      minify: true
    });
    fs.writeFileSync(cssPath, code);
    cssHash = crypto.createHash("sha1").update(code).digest("hex").slice(0, 8);
  }

  const htmlFiles = collectHtmlFiles(outputDir);
  for (const file of htmlFiles) {
    const source = fs.readFileSync(file, "utf8");
    let out = renameHtmlClasses(source, classMap);
    if (cssHash) out = addCssCacheBuster(out, cssHash);
    fs.writeFileSync(file, await minifyHtml(out, HTML_MINIFIER_OPTIONS));
  }

  return { htmlFiles: htmlFiles.length, classesRenamed: classMap.size, cssHash };
}

module.exports = { minifyOutput };
