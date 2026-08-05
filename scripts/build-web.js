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
