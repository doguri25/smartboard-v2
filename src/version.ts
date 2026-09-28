// ============================================================
// 버전 정보 창 (하루이음 로고 클릭)
//  - 버전은 package.json(빌드 시 __APP_VERSION__) 과 Tauri 설정에서 자동으로 가져옴
//  - 변경 이력은 src/changelog.json 에서 자동으로 표시 (새 버전은 scripts/bump.mjs 로 추가)
// ============================================================
import { getVersion } from "@tauri-apps/api/app";
import changelog from "./changelog.json";
import { isTauri } from "./storage";

interface Entry { version: string; date: string; title: string; items: string[] }
const entries = changelog as Entry[];

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : entries[0]?.version ?? "0.0.0";
export const latestEntry = () => entries[0];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function renderVersionModal() {
  let ver = APP_VERSION;
  if (isTauri()) { try { ver = await getVersion(); } catch { /* 무시 */ } }
  const vt = document.getElementById("version-text");
  if (vt) vt.textContent = `v${ver}`;
  const box = document.getElementById("version-history");
  if (!box) return;
  const LIMIT = 5;
  const expanded = box.dataset.expanded === "1";
  const shown = expanded ? entries : entries.slice(0, LIMIT);
  box.innerHTML = shown.map((e, i) => `
    <div class="${i === 0 ? "" : "border-t border-slate-200 pt-3 mt-3"}">
      <div class="flex items-baseline justify-between gap-2">
        <span class="font-bold ${i === 0 ? "text-brand-600" : "text-slate-700"}">v${esc(e.version)}${i === 0 ? ' <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full ml-1">현재</span>' : ""}</span>
        <span class="text-xs text-slate-400">${esc(e.date)}</span>
      </div>
      ${e.title ? `<div class="text-sm font-bold text-slate-600 mt-1">${esc(e.title)}</div>` : ""}
      <ul class="mt-1 space-y-1 text-sm text-slate-600 list-disc pl-5">${e.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>
    </div>`).join("");
  if (entries.length > LIMIT) {
    box.innerHTML += `<button type="button" id="version-more-btn" class="mt-3 w-full py-2 text-sm font-bold text-brand-600 hover:bg-brand-50 rounded-lg border border-brand-100 transition">${expanded ? "접기" : `이전 버전 ${entries.length - LIMIT}개 더보기`}</button>`;
    document.getElementById("version-more-btn")!.onclick = () => { box.dataset.expanded = expanded ? "0" : "1"; void renderVersionModal(); };
  }
}
