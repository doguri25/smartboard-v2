// ============================================================
// 디자인 테마(스킨) 적용·저장 — CSS 는 src/skins.css
// ============================================================
import { storage } from "./storage";

export interface Skin { id: string; name: string; desc: string; brand: string; preview: { page: string; surface: string; accent: string; text: string } }

export const SKINS: Skin[] = [
  { id: "light",  name: "밝은 기본",  desc: "깔끔한 흰 바탕",        brand: "default", preview: { page: "#f1f5f9", surface: "#ffffff", accent: "#6366f1", text: "#1e293b" } },
  { id: "dark",   name: "다크",       desc: "어두운 교실·저녁 수업",   brand: "default", preview: { page: "#0f172a", surface: "#1e293b", accent: "#818cf8", text: "#f1f5f9" } },
  { id: "chalk",  name: "칠판",       desc: "녹색 칠판과 크림색 판",   brand: "green",   preview: { page: "#173a2e", surface: "#fbf7ec", accent: "#10b981", text: "#2a2823" } },
  { id: "pastel", name: "파스텔",     desc: "저학년 교실에 어울리는 분홍", brand: "pink",  preview: { page: "#fff5fa", surface: "#ffffff", accent: "#ec4899", text: "#4a2f52" } },
  { id: "paper",  name: "종이 노트",  desc: "따뜻한 베이지와 명조 제목", brand: "orange", preview: { page: "#ede6d6", surface: "#fffdf7", accent: "#f97316", text: "#3a3126" } },
  { id: "ocean",  name: "오션",       desc: "깊은 바다색과 하늘색 강조",  brand: "teal",    preview: { page: "#0b2545", surface: "#13315c", accent: "#38bdf8", text: "#eaf4ff" } },
  { id: "mono",   name: "모노",       desc: "흑백 미니멀, 얇은 선",      brand: "default", preview: { page: "#ececef", surface: "#ffffff", accent: "#18181b", text: "#111114" } },
  { id: "lavender", name: "라벤더",   desc: "연보라 그라데이션",         brand: "purple",  preview: { page: "#f0ecfa", surface: "#ffffff", accent: "#7c3aed", text: "#2e244a" } },
  { id: "graphite", name: "그라파이트", desc: "차분한 흑연색 다크",       brand: "teal",    preview: { page: "#141518", surface: "#202226", accent: "#2dd4bf", text: "#f0f1f3" } },
  { id: "sunset", name: "선셋",       desc: "따뜻한 복숭아·코랄 그라데이션", brand: "orange", preview: { page: "#fff1ec", surface: "#ffffff", accent: "#f97316", text: "#4a2c24" } },
];

const KEY = "smartBoardSkin";

export function currentSkin(): string {
  const s = storage.getItem(KEY) || "light";
  return SKINS.some((k) => k.id === s) ? s : "light";
}

/** 스킨을 적용. 바탕색·판넬색 사용자 지정은 스킨 기본값으로 되돌리고 강조색은 스킨 추천값으로 */
export function applySkin(id: string, opts: { resetColors?: boolean; setBrand?: boolean } = {}) {
  const skin = SKINS.find((k) => k.id === id) ?? SKINS[0];
  document.documentElement.setAttribute("data-skin", skin.id);
  storage.setItem(KEY, skin.id);
  if (opts.resetColors) {
    document.body.style.backgroundColor = "";
    document.documentElement.style.removeProperty("--panel-bg");
    storage.setItem("smartBoardBgColor", "skin");
    storage.setItem("smartBoardPanelColor", "skin");
  }
  if (opts.setBrand) {
    const fn = (window as any).changeTheme;
    if (typeof fn === "function") fn(skin.brand);
  }
  renderSkinCards();
}

/** 환경설정의 테마 카드 그리기 */
export function renderSkinCards() {
  const box = document.getElementById("skin-cards");
  if (!box) return;
  const cur = currentSkin();
  box.innerHTML = SKINS.map((k) => `
    <button type="button" class="skin-card ${k.id === cur ? "active" : ""}" onclick="window.skins.apply('${k.id}')" title="${k.desc}">
      <div class="swatch" style="background:${k.preview.page}"><span style="background:${k.preview.surface}"></span><span style="background:${k.preview.accent}"></span><span style="background:${k.preview.surface}"></span></div>
      <div class="name">${k.name}</div>
    </button>`).join("");
}

export function initSkins() {
  // 저장된 스킨 적용 (색 설정은 건드리지 않음 — 사용자가 고른 바탕색이 있으면 legacy 가 덧입힘)
  const id = currentSkin();
  document.documentElement.setAttribute("data-skin", id);
  renderSkinCards();
}

declare global { interface Window { skins: { apply: (id: string) => void; render: () => void } } }
window.skins = { apply: (id) => applySkin(id, { resetColors: true, setBrand: true }), render: renderSkinCards };
