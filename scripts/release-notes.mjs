#!/usr/bin/env node
// 깃허브 릴리스 본문(변경 이력)을 src/changelog.json 에서 뽑아 출력
//   node scripts/release-notes.mjs            → 현재 package.json 버전의 이력
import fs from "node:fs";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const log = JSON.parse(fs.readFileSync("src/changelog.json", "utf8"));
const entry = log.find((e) => e.version === pkg.version) || log[0];
const lines = [`## ${entry.title}`, "", ...entry.items.map((i) => `- ${i}`), "", `설치: 아래 \`SmartBoard_${pkg.version}_x64-setup.exe\` 를 내려받아 실행하세요. 이미 설치돼 있으면 앱이 스스로 업데이트합니다.`];
process.stdout.write(lines.join("\n") + "\n");
