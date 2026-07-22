// Copies the web app (index.html + assets it references) into www/,
// which is the webDir Capacitor bundles into the native iOS project.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const wwwDir = path.join(root, "www");

const filesToCopy = [
  "index.html",
  "app_icon.png",
  "app_icon_rounded.svg",
  "Sec_logo_nobg.png",
  "primary_logo.svg",
  "yarn.png",
];

const dirsToCopy = ["avatar"];

fs.mkdirSync(wwwDir, { recursive: true });

for (const file of filesToCopy) {
  fs.copyFileSync(path.join(root, file), path.join(wwwDir, file));
}

for (const dir of dirsToCopy) {
  fs.cpSync(path.join(root, dir), path.join(wwwDir, dir), { recursive: true });
}

console.log(`Copied ${filesToCopy.length} files and ${dirsToCopy.length} folders into www/`);
