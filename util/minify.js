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
const CleanCSS = require("clean-css");
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

/** Replace quoted strings with placeholders so url()/font names are never treated as selectors. */
function maskStrings(css) {
  const strings = [];
  const stringPattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  const masked = css.replace(stringPattern, (match) => {
    strings.push(match);
    return SENTINEL + (strings.length - 1) + SENTINEL;
  });
  return { masked, strings };
}

function unmaskStrings(css, strings) {
  const pattern = new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g");
  return css.replace(pattern, (_, i) => strings[Number(i)]);
}

/** Generate short names: a, b, ... z, a0, a1, ... */
function shortName(index) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  if (index < alphabet.length) return alphabet[index];
  const rest = index - alphabet.length;
  return alphabet[rest % alphabet.length] + Math.floor(rest / alphabet.length);
}

/**
 * Collect class names from selector position only (the text before each `{`),
 * skipping at-rule preludes like `@media (...)` and `@font-face`.
 */
function collectClassNames(maskedCss) {
  const withoutComments = maskedCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set();
  const rulePattern = /(^|[{};])([^{}@;]+)\{/g;
  let rule;
  while ((rule = rulePattern.exec(withoutComments)) !== null) {
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
  const { masked } = maskStrings(css);
  // Longest first so the alternation regex prefers the most specific match.
  const names = [...collectClassNames(masked)].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  );
  return new Map(names.map((name, i) => [name, shortName(i)]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rename every mapped class in the stylesheet in a single pass. */
function renameCssClasses(css, classMap) {
  if (classMap.size === 0) return css;
  const { masked, strings } = maskStrings(css);
  const alternation = [...classMap.keys()].map(escapeRegExp).join("|");
  const pattern = new RegExp("\\.(" + alternation + ")(?![\\w-])", "g");
  const renamed = masked.replace(pattern, (_, name) => "." + classMap.get(name));
  return unmaskStrings(renamed, strings);
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

  if (fs.existsSync(cssPath)) {
    const source = fs.readFileSync(cssPath, "utf8");
    classMap = buildClassMap(source);
    const output = new CleanCSS({ level: 2 }).minify(renameCssClasses(source, classMap));
    if (output.errors.length) {
      throw new Error("CSS minification failed: " + output.errors.join(", "));
    }
    fs.writeFileSync(cssPath, output.styles);
  }

  const htmlFiles = collectHtmlFiles(outputDir);
  for (const file of htmlFiles) {
    const source = fs.readFileSync(file, "utf8");
    const minified = await minifyHtml(renameHtmlClasses(source, classMap), HTML_MINIFIER_OPTIONS);
    fs.writeFileSync(file, minified);
  }

  return { htmlFiles: htmlFiles.length, classesRenamed: classMap.size };
}

module.exports = { minifyOutput };
