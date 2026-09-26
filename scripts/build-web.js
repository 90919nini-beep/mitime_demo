// Copies the web app (index.html + assets it references) into www/,
// which is the webDir Capacitor bundles into the native iOS project.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const wwwDir = path.join(root, "www");

const filesToCopy = [
  "index.html",
  // index.html's own <link>/manifest references still expect these exact
  // served filenames — the source files were renamed at some point without
  // updating those references, so the copy renames them back on the way out
  // rather than touching every embedded reference (including a URL-encoded
  // inline manifest data: URI in index.html itself).
  { src: "logo icon/small_icon.png", dest: "app_icon.png" },
  { src: "logo icon/small_icon_rounded.svg", dest: "app_icon_rounded.svg" },
  "logo icon/Sec_logo_nobg.png",
  "logo icon/primary_logo.svg",
  "logo icon/yarn.png",
  "empty_projects_folder.png",
  "empty_patterns.png",
  "empty_yarn.png",
  "empty_tools.png",
  "empty_swatches.png",
  "empty_parties_nearby.png",
  "empty_parties_host.png",
  "knit_stitch.png", // Color Grid "Realistic" preview: the one neutral stitch texture, recoloured at runtime
];

const dirsToCopy = ["avatar"];

fs.mkdirSync(wwwDir, { recursive: true });

for (const entry of filesToCopy) {
  const src = typeof entry === "string" ? entry : entry.src;
  const dest = typeof entry === "string" ? path.basename(entry) : entry.dest;
  fs.copyFileSync(path.join(root, src), path.join(wwwDir, dest));
}

for (const dir of dirsToCopy) {
  fs.cpSync(path.join(root, dir), path.join(wwwDir, dir), { recursive: true });
}

console.log(`Copied ${filesToCopy.length} files and ${dirsToCopy.length} folders into www/`);

// ─── Launch-speed optimization ───────────────────────────────────────────────
// The source index.html is a dev-friendly single file: it pulls React (dev
// build), Babel, Tailwind's runtime compiler, etc. from CDNs and compiles ~30k
// lines of JSX *on the device* every launch — 30+ seconds of blank screen on a
// phone. The shipped www/index.html is rewritten here to do all of that work at
// build time instead: JSX is precompiled, libraries are bundled locally (React
// production builds), and Tailwind's CSS is generated ahead of time. The source
// index.html is left untouched, so the plain web deploy keeps working as before.
// Set NO_OPTIMIZE=1 to ship the source file as-is (e.g. to bisect a regression).
async function optimize() {
  const esbuild = require("esbuild");
  const { execFileSync } = require("child_process");

  const nm = (p) => path.join(root, "node_modules", p);
  const vendorDir = path.join(wwwDir, "vendor");
  fs.mkdirSync(vendorDir, { recursive: true });
  const vendorFiles = {
    "react.production.min.js": nm("react/umd/react.production.min.js"),
    "react-dom.production.min.js": nm("react-dom/umd/react-dom.production.min.js"),
    "supabase.js": nm("@supabase/supabase-js/dist/umd/supabase.js"),
    "iconify.min.js": nm("@iconify/iconify/dist/iconify.min.js"),
    "pdf.min.js": nm("pdfjs-dist/build/pdf.min.js"),
    "tesseract.min.js": nm("tesseract.js/dist/tesseract.min.js"),
  };
  for (const [name, src] of Object.entries(vendorFiles)) {
    fs.copyFileSync(src, path.join(vendorDir, name));
  }

  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  // 1. Precompile the <script type="text/babel"> block (JSX -> plain JS).
  // Identifiers are not mangled: the app's top-level consts/functions share one
  // global script scope, exactly as they did under Babel.
  const openTag = '<script type="text/babel">';
  const start = html.indexOf(openTag);
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) throw new Error("build-web: couldn't find the text/babel script block");
  const jsx = html.slice(start + openTag.length, end);
  const compiled = await esbuild.transform(jsx, {
    loader: "jsx",
    target: "safari15",
    minifyWhitespace: true,
  });
  fs.writeFileSync(path.join(wwwDir, "app.js"), compiled.code);
  html = html.slice(0, start) + '<script src="app.js"></script>' + html.slice(end + "</script>".length);

  // 2. Tailwind: generate the CSS ahead of time instead of running the CDN's
  // in-browser JIT (which also re-scans the DOM on every mutation).
  const tmpCss = path.join(wwwDir, ".tailwind-input.css");
  fs.writeFileSync(tmpCss, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  try {
    execFileSync(
      process.execPath,
      [nm("tailwindcss/lib/cli.js"), "-i", tmpCss, "-o", path.join(wwwDir, "tailwind.css"), "--content", path.join(root, "index.html"), "--minify"],
      { cwd: root, stdio: ["ignore", "ignore", "inherit"] }
    );
  } finally {
    fs.rmSync(tmpCss, { force: true });
  }

  // 3. Swap the CDN <script> tags for local files. pdf.js and Tesseract are only
  // used by the "import a pattern" flow, so they load after first paint rather
  // than blocking launch (the app already guards on window.Tesseract being ready).
  const cdnTags = [
    /^[ \t]*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/unpkg\.com\/react@18\/umd\/react\.development\.js"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/unpkg\.com\/react-dom@18\/umd\/react-dom\.development\.js"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2[^"]*"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@iconify\/iconify@3[^"]*"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/[^"]+"><\/script>\r?\n/m,
    /^[ \t]*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/tesseract\.js\/[^"]+"><\/script>\r?\n/m,
  ];
  let firstTag = true;
  for (const re of cdnTags) {
    if (!re.test(html)) throw new Error(`build-web: expected CDN tag not found: ${re}`);
    html = html.replace(re, () => {
      if (!firstTag) return "";
      firstTag = false;
      return [
        '  <link rel="stylesheet" href="tailwind.css"/>',
        '  <script src="vendor/react.production.min.js"></script>',
        '  <script src="vendor/react-dom.production.min.js"></script>',
        '  <script src="vendor/supabase.js"></script>',
        '  <script src="vendor/iconify.min.js"></script>',
        "",
      ].join("\n");
    });
  }
  const lateLoader =
    "<script>window.addEventListener('load',function(){setTimeout(function(){" +
    "['vendor/pdf.min.js','vendor/tesseract.min.js'].forEach(function(src){" +
    "var s=document.createElement('script');s.src=src;s.async=true;document.head.appendChild(s);});" +
    "},1000);});</script>\n";
  html = html.replace("</body>", () => lateLoader + "</body>");

  fs.writeFileSync(path.join(wwwDir, "index.html"), html);
  console.log(
    `Optimized: app.js ${(compiled.code.length / 1048576).toFixed(2)} MB, ` +
      `tailwind.css ${(fs.statSync(path.join(wwwDir, "tailwind.css")).size / 1024).toFixed(0)} KB, ` +
      `index.html ${(html.length / 1048576).toFixed(2)} MB`
  );
}

if (process.env.NO_OPTIMIZE) {
  console.log("NO_OPTIMIZE set — shipping source index.html unmodified.");
} else {
  optimize().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
