import fs from "fs";
import path from "path";

const pkgPath = path.resolve(process.cwd(), "node_modules/lightningcss/package.json");
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.exports) {
      if (pkg.exports["./package.json"] && pkg.exports["."]) {
        // already properly formatted
      } else {
        const rootConditions = {};
        for (const [key, val] of Object.entries(pkg.exports)) {
          if (!key.startsWith(".")) {
            rootConditions[key] = val;
          }
        }
        pkg.exports = {
          ".": Object.keys(rootConditions).length > 0 ? rootConditions : (pkg.exports["."] || "./node/index.js"),
          "./package.json": "./package.json",
        };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8");
        console.log("[patch-lightningcss] Successfully normalized lightningcss exports with '.' and './package.json'.");
      }
    }
  } catch (err) {
    console.warn("[patch-lightningcss] Failed to patch lightningcss:", err);
  }
} else {
  console.log("[patch-lightningcss] lightningcss/package.json not found, skipping.");
}
