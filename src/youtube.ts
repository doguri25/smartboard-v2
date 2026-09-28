// ============================================================
// 유튜브 (5단계) — YouTube Data API v3 로 앱 안에서 검색 + 바로 재생
//
//  준비: Google Cloud Console(console.cloud.google.com) → 프로젝트 만들기
//    → "API 및 서비스" → 라이브러리에서 "YouTube Data API v3" 사용 설정
//    → 사용자 인증 정보 → API 키 만들기 → 유튜브 창 ⚙ 에 붙여넣기
//  하루 할당량 10,000 (검색 1회 = 100) → 하루 약 100회 검색
//
//  주소를 붙여넣으면 검색 없이 바로 재생 (키 없어도 됨)
//  저장 키: smartBoardYoutubeKey
// ============================================================
import { httpGetJson } from "./net";
import { storage } from "./storage";

const URL_RE = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
const el = (id: string) => document.getElementById(id);

interface Result { id: string; title: string; channel: string; thumb: string; published: string }

function getKey() { return (storage.getItem("smartBoardYoutubeKey") || "").trim(); }
function setKey(k: string) { storage.setItem("smartBoardYoutubeKey", k.trim()); }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const decodeEntities = (s: string) => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

function showPlayer(videoId: string) {
  const iframe = el("youtube-iframe") as HTMLIFrameElement | null;
  if (!iframe) return;
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.classList.remove("hidden");
  el("youtube-placeholder")?.classList.add("hidden");
  el("youtube-results")?.classList.add("hidden");
  el("youtube-back-btn")?.classList.remove("hidden");
}

export function stopPlayer() {
  const iframe = el("youtube-iframe") as HTMLIFrameElement | null;
  if (iframe) { iframe.src = ""; iframe.classList.add("hidden"); }
  el("youtube-back-btn")?.classList.add("hidden");
  const results = el("youtube-results");
  const grid = el("youtube-results-grid") ?? results;
  if (results && grid && grid.childElementCount) results.classList.remove("hidden");
  else el("youtube-placeholder")?.classList.remove("hidden");
}

function renderResults(list: Result[]) {
  const box = el("youtube-results"); if (!box) return;
  el("youtube-placeholder")?.classList.add("hidden");
  box.classList.remove("hidden");
  box.scrollTop = 0;
  const grid = el("youtube-results-grid") ?? box;
  if (!list.length) { grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-bold">검색 결과가 없습니다.</div>`; return; }
  // 카드는 <div role="button"> — <button> 은 그리드 안에서 높이가 눌려 제목이 잘리는 문제가 있었음
  grid.innerHTML = list.map((v) => `
    <div role="button" tabindex="0" data-video="${v.id}" class="yt-card sb-tap text-left bg-white rounded-2xl border border-slate-200 hover:border-red-400 hover:shadow-lg transition group cursor-pointer select-none">
      <div class="aspect-video bg-slate-200 overflow-hidden rounded-t-2xl"><img src="${v.thumb}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform"></div>
      <div class="p-3">
        <div class="yt-card-title font-bold text-slate-800 leading-snug line-clamp-2" title="${esc(v.title)}">${esc(v.title)}</div>
        <div class="text-xs text-slate-500 mt-1 truncate">${esc(v.channel)} · ${v.published}</div>
      </div>
    </div>`).join("");
  grid.querySelectorAll<HTMLElement>(".yt-card").forEach((card) => {
    const go = () => showPlayer(card.dataset.video || "");
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
}

function setStatus(msg: string, isError = false) {
  const s = el("youtube-status"); if (!s) return;
  s.textContent = msg;
  s.className = `text-sm font-bold ${isError ? "text-red-600" : "text-slate-500"} ${msg ? "" : "hidden"}`;
}

export async function search(query: string) {
  const q = query.trim();
  if (!q) { alert("검색어 또는 영상 주소를 입력해 주세요!"); return; }
  const m = q.match(URL_RE);
  if (m && m[2].length === 11) { showPlayer(m[2]); return; }
  if (!getKey()) { toggleKeyPanel(true); setStatus("검색하려면 YouTube API 키가 필요합니다. 주소를 붙여넣으면 키 없이 바로 재생됩니다.", true); return; }
  setStatus("검색 중...");
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=strict&maxResults=12&regionCode=KR&relevanceLanguage=ko&q=${encodeURIComponent(q)}&key=${encodeURIComponent(getKey())}`;
    const j = await httpGetJson(url);
    const list: Result[] = (j.items ?? []).map((i: any) => ({
      id: i.id?.videoId, title: decodeEntities(i.snippet?.title ?? ""), channel: i.snippet?.channelTitle ?? "",
      thumb: i.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${i.id?.videoId}/mqdefault.jpg`,
      published: (i.snippet?.publishedAt ?? "").slice(0, 10),
    })).filter((v: Result) => v.id);
    stopPlayer();
    renderResults(list);
    setStatus("");
  } catch (e: any) {
    const body = e?.body ? String(e.body) : "";
    let msg = e?.message || String(e);
    if (/quotaExceeded/.test(body)) msg = "오늘의 검색 할당량(약 100회)을 다 썼습니다. 내일 다시 검색할 수 있고, 주소 붙여넣기는 계속 됩니다.";
    else if (/API key not valid|keyInvalid/.test(body)) msg = "API 키가 올바르지 않습니다. ⚙ 에서 다시 확인해 주세요.";
    else if (/accessNotConfigured|has not been used/.test(body)) msg = "이 키의 프로젝트에서 YouTube Data API v3 가 사용 설정되지 않았습니다.";
    setStatus("검색 실패: " + msg, true);
    console.error("유튜브 검색 오류:", e, body.slice(0, 300));
  }
}

export function toggleKeyPanel(show?: boolean) {
  const p = el("youtube-key-panel"); if (!p) return;
  const willShow = show ?? p.classList.contains("hidden");
  p.classList.toggle("hidden", !willShow);
  if (willShow) { const i = el("youtube-api-key") as HTMLInputElement | null; if (i) { i.value = getKey(); i.focus(); } }
}
export function saveKeyFromPanel() {
  const i = el("youtube-api-key") as HTMLInputElement | null;
  setKey(i?.value ?? "");
  toggleKeyPanel(false);
  setStatus(getKey() ? "API 키를 저장했습니다. 이제 검색어로 찾을 수 있어요." : "API 키를 비웠습니다. 주소 붙여넣기만 됩니다.");
}

declare global {
  interface Window {
    youtubeUI: { search: (q: string) => Promise<void>; play: (id: string) => void; stop: () => void; toggleKeyPanel: (s?: boolean) => void; saveKey: () => void };
  }
}
window.youtubeUI = { search, play: showPlayer, stop: stopPlayer, toggleKeyPanel, saveKey: saveKeyFromPanel };
