#!/usr/bin/env node
// 자동 업데이트용 latest.json 만들기
//   node scripts/make-latest-json.mjs <설치파일이 올라갈 폴더 주소>
//   예) node scripts/make-latest-json.mjs https://github.com/내계정/smartboard-v2/releases/latest/download
// 빌드 결과(setup.exe 와 .sig)와 src/changelog.json 을 읽어 latest.json 을 만듭니다.
import fs from "node:fs";
import path from "node:path";
const base = (process.argv[2] || "https://github.com/doguri25/smartboard-v2/releases/latest/download").replace(/\/$/, "");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const log = JSON.parse(fs.readFileSync("src/changelog.json", "utf8"));
const entry = log.find((e) => e.version === pkg.version) || log[0];
const dirs = ["src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis", "src-tauri/target/release/bundle/nsis"];
const dir = dirs.find((d) => fs.existsSync(d));
if (!dir) { console.error("빌드 결과(bundle/nsis)를 찾을 수 없습니다. 먼저 빌드하세요."); process.exit(1); }
const exe = fs.readdirSync(dir).find((f) => f.endsWith("-setup.exe"));
const sig = exe && fs.existsSync(path.join(dir, exe + ".sig")) ? fs.readFileSync(path.join(dir, exe + ".sig"), "utf8").trim() : null;
if (!exe || !sig) { console.error("setup.exe 또는 .sig 파일이 없습니다. (bundle.createUpdaterArtifacts 와 서명키 확인)"); process.exit(1); }
const latest = {
  version: pkg.version,
  notes: [entry.title, ...entry.items.map((i) => "- " + i)].filter(Boolean).join("\n"),
  pub_date: new Date().toISOString(),
  platforms: { "windows-x86_64": { signature: sig, url: `${base}/${exe}` } },
};
const out = path.join(dir, "latest.json");
fs.writeFileSync(out, JSON.stringify(latest, null, 2) + "\n");
console.log("wrote", out, "→", latest.platforms["windows-x86_64"].url);
