const fs = require('fs');
const esbuild = require('esbuild');

const htmlFile = 'index.html';
const cssFile = 'style.css';
const jsEntry = 'js/main.js';
const outputHtml = 'final.html';

// 1. Read HTML
let html = fs.readFileSync(htmlFile, 'utf8');

// 2. Inline CSS
const css = fs.readFileSync(cssFile, 'utf8');
html = html.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']style\.css["']\s*\/?>/,
  `<style>\n${css}\n</style>`
);

// 3. Bundle JS (resolve all imports)
const result = esbuild.buildSync({
  entryPoints: [jsEntry],
  bundle: true,        // follows all imports
  minify: true,
  format: 'iife',      // inline safely, converts module to IIFE
  write: false,
});

const bundledJs = result.outputFiles[0].text;

// 4. Replace <script type="module" src="js/main.js"> with inline bundle
html = html.replace(
  /<script\s+type=["']module["']\s+src=["']js\/main\.js["']\s*><\/script>/,
  `<script>\n${bundledJs}\n</script>`
);

// 5. Write final HTML
fs.writeFileSync(outputHtml, html, 'utf8');
console.log('All JS and CSS inlined into', outputHtml);
