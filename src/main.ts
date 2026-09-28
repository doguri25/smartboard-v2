// ============================================================
// 스마트 전자칠판 v2 진입점 (TypeScript)
//  1. 저장소(storage.ts)를 파일에서 메모리로 읽어 들이고
//  2. 아이콘·Tauri 창 API·알람 소리 API 를 전역(window)에 준비한 뒤
//  3. 기존 기능 코드(legacy-app.js)를 시작하고
//  4. 떠 있는 팝업, 화면 배율, 창 닫을 때 저장 마무리를 붙입니다.
// ============================================================
import { createIcons, icons } from "lucide";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { isTauri, storage } from "./storage";
import { getAlarmUrl, pickAlarmMp3, preloadAlarm } from "./alarm-audio";
import { onTick, bringToFront, openSite } from "./host";
import { startLegacyApp } from "./legacy-app";
import { initFloatingPanels } from "./floating";
import { initFit } from "./fit";
import { initMotion } from "./motion";
import { initSkins } from "./skins";
import { initUpdater } from "./updater";
import { renderVersionModal } from "./version";
import "./board-editor"; // window.boardEditor (legacy-app.js 와 HTML 버튼이 사용)
import "./weather";      // window.weather (기상청·에어코리아)
import "./youtube";      // window.youtubeUI (유튜브 검색·재생)
import "./lunch";        // window.lunch (급식·알레르기)
// 글꼴: 구글 폰트 CDN 대신 앱에 포함 (오프라인에서도 같은 모양)
import "@fontsource/jua";
import "@fontsource/nanum-gothic";
import "@fontsource/nanum-gothic/700.css";
import "@fontsource/nanum-myeongjo";
import "@fontsource/nanum-myeongjo/700.css";
import "@fontsource/poor-story";
import "@fontsource/gamja-flower";
import "./tailwind.css";
import "./responsive.css";
import "./floating.css";
import "./board-editor.css";
import "./skins.css";
import "./polish.css";
import "./motion.css";

// --- 아이콘 ------------------------------------------------------------
// 최신 lucide에는 브랜드 아이콘(youtube)이 없어서 비슷한 모양으로 대체
const iconSet = { ...icons, Youtube: icons.SquarePlay };
const lucideGlobal = { createIcons: () => createIcons({ icons: iconSet }) };

// --- Tauri 호스트 기능 (legacy-app.js 가 window.smartboardHost 로 사용) ----
const smartboardHost = {
  setAlwaysOnTop: (on: boolean) => getCurrentWindow().setAlwaysOnTop(on),
  pickAlarmMp3,
  getAlarmUrl,
  getDataDir: () => (isTauri() ? invoke<string>("get_data_dir") : Promise.resolve("(브라우저: localStorage)")),
  onTick,          // 1초 tick (Rust 스레드 → 창이 가려져도 정확)
  bringToFront,    // 알람 때 창을 앞으로
  openSite,        // 팅커벨·아이스크림 등 사이트를 자체 창으로
};

declare global {
  interface Window {
    lucide: typeof lucideGlobal;
    smartboardHost: typeof smartboardHost;
    renderVersionModal: typeof renderVersionModal;
  }
}
window.lucide = lucideGlobal;
window.smartboardHost = smartboardHost;
window.renderVersionModal = renderVersionModal;

// --- 화면 배율 ------------------------------------------------------------
// responsive.css 가 html font-size 를 창 크기에 맞춰 정하면 16px 기준 비율을 --ui-scale 에 넣음
function updateUiScale() {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  document.documentElement.style.setProperty("--ui-scale", (rootPx / 16).toFixed(4));
}
updateUiScale();
window.addEventListener("resize", updateUiScale);

// --- 저장 오류 알림 (작은 띠) ---------------------------------------------
function showToast(msg: string) {
  let el = document.getElementById("sb-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sb-toast";
    el.style.cssText = "position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);z-index:9999;background:#b91c1c;color:#fff;padding:.75rem 1.25rem;border-radius:1rem;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:80vw;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = "block";
  window.clearTimeout((el as any)._t);
  (el as any)._t = window.setTimeout(() => { el!.style.display = "none"; }, 6000);
}

// --- 창을 닫을 때 저장 안 된 것을 먼저 파일에 씀 -----------------------------
async function installCloseFlush() {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  let closing = false;
  await win.onCloseRequested(async (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    // 저장이 끝나면 창을 실제로 없앰. (destroy 는 core:window:allow-destroy 권한이 필요 —
    //  2.2.0 까지는 이 권한이 빠져 있어 창 닫기 버튼이 듣지 않았음)
    try { await Promise.race([storage.flushAll(), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { console.error("종료 전 저장 실패:", e); }
    try { await win.destroy(); } catch (e) { console.error("창 닫기 실패:", e); closing = false; }
  });
  // 창이 뒤로 가거나 최소화될 때도 한 번 저장
  document.addEventListener("visibilitychange", () => { if (document.hidden) void storage.flushAll(); });
}

// --- 시작 ------------------------------------------------------------------
async function boot() {
  storage.onError = showToast;
  await storage.init();
  if (document.readyState === "loading") {
    await new Promise<void>((r) => document.addEventListener("DOMContentLoaded", () => r(), { once: true }));
  }
  initSkins();          // 디자인 테마 (legacy 가 바탕색을 덧입히기 전에)
  startLegacyApp();
  initFloatingPanels();
  initFit();            // 가로 도구 메뉴 너비 맞춤
  initMotion();         // 열고 닫는 효과·클릭 효과
  initUpdater();        // 자동 업데이트 확인
  void preloadAlarm(storage.getItem("smartBoardCustomMp3") || "");
  void installCloseFlush();
  console.log("smartboard v2 loaded", isTauri() ? "(tauri)" : "(browser)");
}
void boot();
