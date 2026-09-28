// ============================================================
// 자동 업데이트 (2.1.0)
//  - 시작 후 잠시 뒤 '업데이트 주소(latest.json)'를 확인해 새 버전이 있으면 안내 띠를 띄움
//  - [지금 업데이트] → 내려받기 진행률 표시 → 설치 → 자동 재시작
//  - 버전 정보 창의 [업데이트 확인] 버튼으로 수동 확인
//  설정 키: smartBoardUpdateUrl (latest.json 주소), smartBoardAutoUpdate ('true'/'false')
//  2.5.2: 주소를 비워 두면 기본 주소(깃허브 릴리스)를 씁니다 → 따로 설정하지 않아도 자동 업데이트가 됨
// ============================================================
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri, storage } from "./storage";

interface UpdateInfo { version: string; current: string; notes?: string | null; date?: string | null }

const el = (id: string) => document.getElementById(id);
export const DEFAULT_UPDATE_URL = "https://github.com/doguri25/smartboard-v2/releases/latest/download/latest.json";
export const getUpdateUrl = () => (storage.getItem("smartBoardUpdateUrl") || "").trim() || DEFAULT_UPDATE_URL;
export const isAutoUpdate = () => storage.getItem("smartBoardAutoUpdate") !== "false";

let pending: UpdateInfo | null = null;
let installing = false;

function setStatus(msg: string, kind: "info" | "ok" | "error" = "info") {
  const s = el("update-status"); if (!s) return;
  s.textContent = msg;
  s.className = `text-sm font-bold mb-3 ${kind === "error" ? "text-red-500" : kind === "ok" ? "text-emerald-600" : "text-slate-500"}`;
  s.classList.remove("hidden");
}

export async function check(silent: boolean): Promise<UpdateInfo | null> {
  if (!isTauri()) { if (!silent) setStatus("업데이트 확인은 앱에서만 됩니다.", "error"); return null; }
  const url = getUpdateUrl();
  if (!silent) setStatus("확인 중...");
  try {
    const info = await invoke<UpdateInfo | null>("check_update", { endpoint: url });
    if (info) {
      pending = info;
      if (!silent) setStatus(`새 버전 v${info.version} 이 있습니다. (현재 v${info.current})`, "ok");
      showBanner(info);
    } else if (!silent) setStatus("최신 버전을 사용 중입니다.", "ok");
    return info;
  } catch (e) {
    console.warn("업데이트 확인 실패:", e);
    if (!silent) setStatus("확인 실패: " + String(e).slice(0, 120), "error");
    return null;
  }
}

function showBanner(info: UpdateInfo) {
  let b = el("update-banner");
  if (!b) {
    b = document.createElement("div");
    b.id = "update-banner";
    b.className = "fixed top-3 left-1/2 -translate-x-1/2 z-[300] bg-white border border-slate-200 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 animate-pop-in";
    document.body.appendChild(b);
  }
  const notes = (info.notes || "").split("\n").filter(Boolean).slice(0, 3).map((l) => `<div class="text-xs text-slate-500">· ${l.replace(/[<>]/g, "")}</div>`).join("");
  b.innerHTML = `
    <div class="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0"><i data-lucide="download" class="w-6 h-6"></i></div>
    <div class="min-w-0">
      <div class="font-bold text-slate-800">새 버전 v${info.version} 이 나왔습니다 <span class="text-xs text-slate-400 font-medium">(현재 v${info.current})</span></div>
      <div id="update-banner-notes">${notes}</div>
      <div id="update-progress" class="hidden mt-1 w-64 h-2 bg-slate-200 rounded-full overflow-hidden"><div id="update-progress-bar" class="h-full bg-brand-500 transition-all" style="width:0%"></div></div>
    </div>
    <button id="update-now-btn" class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold whitespace-nowrap">지금 업데이트</button>
    <button id="update-later-btn" class="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-bold whitespace-nowrap">나중에</button>`;
  b.classList.remove("hidden");
  el("update-now-btn")!.onclick = () => void install();
  el("update-later-btn")!.onclick = () => b!.classList.add("hidden");
  window.lucide?.createIcons();
}

export async function install() {
  if (!pending || installing) return;
  installing = true;
  const btn = el("update-now-btn") as HTMLButtonElement | null;
  const later = el("update-later-btn");
  if (btn) { btn.disabled = true; btn.textContent = "내려받는 중..."; btn.classList.add("opacity-60"); }
  later?.classList.add("hidden");
  el("update-progress")?.classList.remove("hidden");
  const un = await listen<{ downloaded?: number; total?: number | null; installing?: boolean }>("sb-update-progress", (ev) => {
    const p = ev.payload;
    const bar = el("update-progress-bar");
    if (p.installing) { if (btn) btn.textContent = "설치 중... 곧 다시 시작됩니다"; if (bar) bar.style.width = "100%"; return; }
    if (bar && p.total) bar.style.width = Math.min(100, Math.round(((p.downloaded ?? 0) / p.total) * 100)) + "%";
    if (btn && p.total) btn.textContent = `내려받는 중 ${Math.round(((p.downloaded ?? 0) / p.total) * 100)}%`;
  });
  try {
    await storage.flushAll(); // 저장 안 된 것을 먼저 파일에
    await invoke("install_update", { endpoint: getUpdateUrl() });
  } catch (e) {
    installing = false;
    un();
    if (btn) { btn.disabled = false; btn.textContent = "다시 시도"; btn.classList.remove("opacity-60"); }
    later?.classList.remove("hidden");
    const notes = el("update-banner-notes");
    if (notes) notes.innerHTML = `<div class="text-xs text-red-500">업데이트 실패: ${String(e).replace(/[<>]/g, "").slice(0, 160)}</div>`;
  }
}

/** 환경설정의 업데이트 입력칸 채우기/저장 */
export function renderUpdateSettings() {
  const u = el("setting-update-url") as HTMLInputElement | null;
  const a = el("toggle-auto-update") as HTMLInputElement | null;
  if (u) u.value = (storage.getItem("smartBoardUpdateUrl") || "").trim(); // 비어 있으면 기본 주소 사용
  if (a) a.checked = isAutoUpdate();
}
export function saveUpdateSettings() {
  const u = el("setting-update-url") as HTMLInputElement | null;
  const a = el("toggle-auto-update") as HTMLInputElement | null;
  if (u) storage.setItem("smartBoardUpdateUrl", u.value.trim());
  if (a) storage.setItem("smartBoardAutoUpdate", String(a.checked));
}

export function initUpdater() {
  if (!isTauri() || !isAutoUpdate() || !getUpdateUrl()) return;
  window.setTimeout(() => void check(true), 8000);           // 시작 8초 뒤 한 번
  window.setInterval(() => void check(true), 6 * 3600 * 1000); // 이후 6시간마다
}

declare global { interface Window { updater: { checkNow: () => Promise<void>; install: () => Promise<void>; renderSettings: () => void; saveSettings: () => void } } }
window.updater = { checkNow: async () => { await check(false); }, install, renderSettings: renderUpdateSettings, saveSettings: saveUpdateSettings };
