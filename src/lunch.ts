// ============================================================
// 급식 (2.3.0) — NEIS 급식 식단 + 알레르기 표시
//  - 학교 검색·식단 조회는 Tauri http 플러그인으로 (CORS 없이)
//  - 알레르기: 19가지 중 우리 반에 해당하는 것만 체크 → 그 재료가 든 메뉴는 붉게 표시,
//    체크하지 않은 알레르기 번호는 숨김
//  저장 키: smartBoardSchool (학교), smartBoardAllergens (체크한 번호 배열)
// ============================================================
import { httpGetJson } from "./net";
import { storage } from "./storage";

export const ALLERGENS: Record<number, string> = {
  1: "난류(계란)", 2: "우유", 3: "메밀", 4: "땅콩", 5: "대두(콩)", 6: "밀", 7: "고등어", 8: "게", 9: "새우",
  10: "돼지고기", 11: "복숭아", 12: "토마토", 13: "아황산류", 14: "호두", 15: "닭고기", 16: "쇠고기", 17: "오징어",
  18: "조개류(굴·전복·홍합)", 19: "잣",
};

interface School { code: string; officeCode: string; name: string }
const el = (id: string) => document.getElementById(id);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function getSchool(): School | null {
  try { return JSON.parse(storage.getItem("smartBoardSchool") || "null"); } catch { return null; }
}
export function getAllergens(): number[] {
  try { const a = JSON.parse(storage.getItem("smartBoardAllergens") || "[]"); return Array.isArray(a) ? a.map(Number).filter((n) => ALLERGENS[n]) : []; } catch { return []; }
}
function setAllergens(list: number[]) { storage.setItem("smartBoardAllergens", JSON.stringify([...new Set(list)].sort((a, b) => a - b))); }

// ---------- 알레르기 설정 패널 ----------
export function renderAllergyChips() {
  const box = el("allergy-chips"); if (!box) return;
  const on = new Set(getAllergens());
  box.innerHTML = Object.entries(ALLERGENS).map(([n, name]) => {
    const active = on.has(Number(n));
    return `<button type="button" onclick="window.lunch.toggleAllergen(${n})" class="px-2.5 py-1 rounded-full text-sm font-bold border transition ${active ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-rose-200 text-rose-700 hover:bg-rose-100"}"><span class="opacity-70 mr-1">${n}</span>${name}</button>`;
  }).join("");
}
export function toggleAllergyPanel(show?: boolean) {
  const p = el("allergy-panel"); if (!p) return;
  const willShow = show ?? p.classList.contains("hidden");
  p.classList.toggle("hidden", !willShow);
  if (willShow) { el("school-selector-panel")?.classList.add("hidden"); renderAllergyChips(); }
}
export function toggleAllergen(n: number) {
  const list = getAllergens();
  const i = list.indexOf(n);
  if (i >= 0) list.splice(i, 1); else list.push(n);
  setAllergens(list);
  renderAllergyChips();
  void renderMenu(); // 표시 즉시 갱신
}
export function clearAllergens() { setAllergens([]); renderAllergyChips(); void renderMenu(); }

// ---------- 식단 ----------
interface Dish { name: string; codes: number[] }
/** "미역국(5.6.9.)" → { name: "미역국", codes: [5,6,9] }  (숫자 뒤 마침표·별표 허용) */
export function parseDish(raw: string): Dish {
  const codes: number[] = [];
  const name = raw.replace(/\(([\d.\s*]+)\)/g, (_, inner: string) => {
    inner.split(/[.\s*]+/).forEach((x) => { const n = parseInt(x, 10); if (n >= 1 && n <= 19 && !codes.includes(n)) codes.push(n); });
    return "";
  }).replace(/\s+/g, " ").trim();
  return { name, codes };
}

let lastMeal: { dishes: Dish[]; cal: string; date: Date } | null = null;

function dishHtml(d: Dish, checked: Set<number>) {
  const hit = d.codes.filter((c) => checked.has(c));
  if (hit.length) {
    const badges = hit.map((c) => `<span class="ml-1.5 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-sm font-bold whitespace-nowrap">${esc(ALLERGENS[c])}</span>`).join("");
    return `<div class="text-2xl font-bold text-rose-600 flex items-center flex-wrap gap-y-1"><i data-lucide="triangle-alert" class="w-6 h-6 mr-2 shrink-0 text-rose-500"></i><span>${esc(d.name)}</span>${badges}</div>`;
  }
  return `<div class="text-2xl font-bold text-slate-800 flex items-center"><span class="w-2 h-2 bg-emerald-400 rounded-full mr-3 shrink-0"></span>${esc(d.name)}</div>`;
}

async function renderMenu() {
  const c = el("modal-lunch-content"); const school = getSchool();
  if (!c || !school || !lastMeal) return;
  const checked = new Set(getAllergens());
  const m = lastMeal;
  const hitCount = m.dishes.filter((d) => d.codes.some((x) => checked.has(x))).length;
  const legend = checked.size
    ? `<div class="mt-4 text-sm text-rose-600 font-bold flex items-center gap-2 flex-wrap"><i data-lucide="triangle-alert" class="w-4 h-4"></i>표시 중: ${[...checked].sort((a, b) => a - b).map((x) => esc(ALLERGENS[x])).join(", ")}${hitCount ? ` · 오늘 ${hitCount}개 메뉴 주의` : " · 오늘은 해당 메뉴 없음"}</div>`
    : `<div class="mt-4 text-sm text-slate-400 font-bold">위의 ⚠ 버튼으로 알레르기 표시를 설정할 수 있어요.</div>`;
  c.innerHTML = `<div class="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
      <h3 class="text-3xl font-bold text-emerald-800 mb-2">${esc(school.name)}</h3>
      <p class="text-emerald-600 font-bold mb-6 text-xl">${m.date.getFullYear()}년 ${m.date.getMonth() + 1}월 ${m.date.getDate()}일 오늘의 식단</p>
      <div class="space-y-4">${m.dishes.map((d) => dishHtml(d, checked)).join("")}</div>
      ${legend}
      <div class="mt-6 text-right text-base text-slate-500 font-bold border-t border-emerald-200 pt-4">열량: ${esc(m.cal || "-")}</div>
    </div>`;
  window.lucide?.createIcons();
}

export async function fetchLunch() {
  const c = el("modal-lunch-content"); const school = getSchool();
  if (!c || !school) return;
  c.innerHTML = '<div class="flex flex-col items-center py-10"><i data-lucide="loader-2" class="w-10 h-10 text-emerald-500 animate-spin mb-4"></i></div>';
  window.lucide?.createIcons();
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  try {
    const data = await httpGetJson(`https://open.neis.go.kr/hub/mealServiceDietInfo?Type=json&ATPT_OFCDC_SC_CODE=${school.officeCode}&SD_SCHUL_CODE=${school.code}&MLSV_YMD=${ymd}`);
    const row = data?.mealServiceDietInfo?.[1]?.row?.[0];
    if (!row) { lastMeal = null; c.innerHTML = '<div class="text-center text-slate-500 py-10 font-bold text-xl bg-slate-50 rounded-2xl">오늘 등록된 급식 식단 정보가 없습니다.</div>'; return; }
    const dishes = String(row.DDISH_NM || "").split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean).map(parseDish);
    lastMeal = { dishes, cal: row.CAL_INFO || "", date: now };
    await renderMenu();
  } catch (e) {
    console.error("급식 오류:", e);
    c.innerHTML = '<div class="text-center text-red-500 py-10 font-bold text-xl bg-red-50 rounded-2xl">급식 정보를 가져오는데 실패했습니다.</div>';
  }
}

export async function searchSchool() {
  const input = el("school-search-input") as HTMLInputElement | null;
  const q = input?.value.trim(); const c = el("school-search-results");
  if (!q || !c) return;
  c.innerHTML = '<div class="text-base py-2">검색 중...</div>';
  try {
    const data = await httpGetJson(`https://open.neis.go.kr/hub/schoolInfo?Type=json&SCHUL_NM=${encodeURIComponent(q)}`);
    const rows = data?.schoolInfo?.[1]?.row as any[] | undefined;
    c.innerHTML = "";
    if (!rows?.length) { c.innerHTML = '<div class="p-2 text-red-500">결과 없음</div>'; return; }
    rows.forEach((sch) => {
      const btn = document.createElement("button");
      btn.className = "text-left p-3 bg-white border rounded-lg text-base font-bold hover:bg-emerald-50 transition";
      btn.innerText = `[${sch.LCTN_SC_NM}] ${sch.SCHUL_NM}`;
      btn.onclick = () => {
        storage.setItem("smartBoardSchool", JSON.stringify({ code: sch.SD_SCHUL_CODE, officeCode: sch.ATPT_OFCDC_SC_CODE, name: sch.SCHUL_NM }));
        el("school-selector-panel")?.classList.add("hidden");
        void fetchLunch();
      };
      c.appendChild(btn);
    });
  } catch (e) { console.error(e); c.innerHTML = '<div class="p-2 text-red-500">검색 오류</div>'; }
}

declare global {
  interface Window { lunch: { fetch: () => Promise<void>; search: () => Promise<void>; toggleAllergyPanel: (s?: boolean) => void; toggleAllergen: (n: number) => void; clearAllergens: () => void; hasSchool: () => boolean } }
}
window.lunch = { fetch: fetchLunch, search: searchSchool, toggleAllergyPanel, toggleAllergen, clearAllergens, hasSchool: () => !!getSchool() };
