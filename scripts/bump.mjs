#!/usr/bin/env node
// 버전 올리기: node scripts/bump.mjs 2.2.0 "제목" "변경 1" "변경 2" ...
// package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml 의 버전을 맞추고
// src/changelog.json 맨 앞에 새 항목을 넣습니다.
import fs from "node:fs";
const [ver, title, ...items] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(ver || "")) { console.error("사용법: node scripts/bump.mjs 2.2.0 \"제목\" \"변경 사항\" ..."); process.exit(1); }
const edit = (path, fn) => { const s = fs.readFileSync(path, "utf8"); fs.writeFileSync(path, fn(s)); console.log("updated", path); };
edit("package.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${ver}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version":\s*"[^"]+"/, `"version": "${ver}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${ver}"`));
const log = JSON.parse(fs.readFileSync("src/changelog.json", "utf8"));
if (log[0]?.version === ver) { log[0] = { ...log[0], title: title || log[0].title, items: items.length ? items : log[0].items }; }
else log.unshift({ version: ver, date: new Date().toISOString().slice(0, 10), title: title || "", items });
fs.writeFileSync("src/changelog.json", JSON.stringify(log, null, 2) + "\n");
console.log("changelog.json:", ver);
