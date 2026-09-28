// ============================================================
// Tauri 창·이벤트 관련 호스트 기능 (6단계)
//  - onTick: Rust 가 1초마다 보내는 sb-tick 을 받아 시계/알람/타이머를 돌림
//    (브라우저에서는 setInterval 로 대신)
//  - bringToFront: 알람이 울리면 다른 창 밑에 있어도 앞으로 가져옴
//  - openSite: 팅커벨·아이스크림 같은 사이트를 앱 자체 창(최대화)으로 엶
//    iframe 으로 넣으면 사이트 쪽에서 막는 경우가 많아 별도 창을 씁니다.
// ============================================================
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./storage";

export const SITES: Record<string, { url: string; title: string }> = {
  tinkerbell: { url: "https://www.tkbell.co.kr/", title: "팅커벨" },
  iscream: { url: "https://www.i-scream.co.kr/", title: "아이스크림" },
  // 2.5.0: 유튜브 로그인용 (같은 프로필을 쓰므로 여기서 로그인하면 플레이어에도 적용)
  youtube: { url: "https://www.youtube.com/", title: "유튜브" },
};

// 2.5.0: 로그인 기억
//  - 모든 사이트 창은 메인 창과 같은 WebView2 프로필(쿠키 저장소)을 쓰므로 로그인 상태가 앱을 껐다 켜도 유지됩니다.
//    (사이트가 "로그인 유지" 를 지원하면 자동 로그인, 아니면 아이디·비밀번호 자동 채우기)
//  - 비밀번호 저장/자동 채우기는 Rust 쪽(lib.rs enable_login_memory)에서 WebView2 설정으로 켭니다.

export function onTick(cb: () => void) {
  if (isTauri()) {
    void listen("sb-tick", () => cb());
  } else {
    window.setInterval(cb, 1000);
  }
  // 창이 다시 보일 때 즉시 한 번 (놓친 시간을 바로 반영)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cb(); });
}

export async function bringToFront() {
  if (!isTauri()) return;
  try {
    const w = getCurrentWindow();
    if (await w.isMinimized()) await w.unminimize();
    await w.show();
    await w.setFocus();
  } catch (e) { console.warn("창 앞으로 가져오기 실패:", e); }
}

export async function openSite(key: string) {
  const site = SITES[key];
  if (!site) return;
  if (!isTauri()) { window.open(site.url, "_blank"); return; }
  const label = `site-${key}`;
  try {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      if (await existing.isMinimized()) await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      return;
    }
    const win = new WebviewWindow(label, {
      url: site.url,
      title: `${site.title} - 하루이음`,
      width: 1600,
      height: 900,
      center: true,
      maximized: true,
      resizable: true,
    });
    win.once("tauri://error", (e) => {
      console.error("사이트 창 열기 실패:", e);
      void openUrl(site.url); // 창을 못 만들면 기본 브라우저로
    });
  } catch (e) {
    console.error("사이트 창 열기 실패:", e);
    void openUrl(site.url);
  }
}
