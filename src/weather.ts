// ============================================================
// 날씨·미세먼지 (5단계) — 기상청 단기예보 + 에어코리아 (공공데이터포털)
//
//  왜 바꿨나: 이전의 Open-Meteo 는 해외 서버라 학교 망에서 막힘. 공공데이터포털
//  (apis.data.go.kr)은 국내 정부 서버라 열려 있고, 인증키 하나로 두 API 를 씁니다.
//
//  준비: 공공데이터포털(data.go.kr) 가입 → 아래 두 개 "활용신청"(자동 승인)
//    1. 기상청_단기예보 ((구)_동네예보) 조회서비스
//    2. 한국환경공단_에어코리아_대기오염정보
//  → 마이페이지에서 인증키(일반 인증키)를 복사해 날씨 창 → 지역 설정에 붙여넣기
//
//  저장 키: smartBoardDataGoKrKey (인증키), smartBoardWeatherRegion (지역)
// ============================================================
import { httpGetJson } from "./net";
import { storage } from "./storage";
import { REGIONS, findRegion, latLonToGrid } from "./regions";

const KMA = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const AIR = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";
const DEFAULT_REGION = { sido: "충남", sigungu: "홍성군" };

interface Region { sido: string; sigungu: string; name: string; nx: number; ny: number; dust: string }
interface Hour { key: string; label: string; temp: number | null; sky: number; pty: number; hour: number }
interface Day { label: string; date: string; max: number | null; min: number | null; sky: number; pty: number; pop: number | null }
interface Weather {
  current: { temp: number | null; humidity: number | null; wind: number | null; sky: number; pty: number; rain: string };
  hourly: Hour[];
  today: { max: number | null; min: number | null };
  daily: Day[]; // 오늘·내일·모레
  updated: string;
}
interface Dust { pm10: number | null; pm25: number | null; station: string; time: string }

// ---------- 설정 ----------
function getKey(): string {
  return (storage.getItem("smartBoardDataGoKrKey") || "").trim();
}
function keyParam(): string {
  const k = getKey();
  return k.includes("%") ? k : encodeURIComponent(k); // 인코딩된 키를 붙여넣어도, 원본 키를 붙여넣어도 동작
}
export function getRegion(): Region {
  let saved: any = null;
  try { saved = JSON.parse(storage.getItem("smartBoardWeatherRegion") || "null"); } catch { /* 무시 */ }
  const found = (saved?.sido && findRegion(saved.sido, saved.sigungu)) || findRegion(DEFAULT_REGION.sido, DEFAULT_REGION.sigungu)!;
  const g = latLonToGrid(found.item.lat, found.item.lon);
  return { sido: found.sido.name, sigungu: found.item.name, name: `${found.sido.name} ${found.item.name}`, nx: g.nx, ny: g.ny, dust: found.sido.dust };
}
export function saveRegion(sido: string, sigungu: string) {
  if (!findRegion(sido, sigungu)) return;
  storage.setItem("smartBoardWeatherRegion", JSON.stringify({ sido, sigungu }));
}
export function saveKey(key: string) {
  storage.setItem("smartBoardDataGoKrKey", key.trim());
}

// ---------- 시간 계산 (기상청 발표 시각 규칙) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
function baseForNcst(now: Date) { // 초단기실황: 매시 정시, 10분 뒤 제공
  const t = new Date(now.getTime() - 10 * 60000);
  return { base_date: ymd(t), base_time: pad(t.getHours()) + "00" };
}
function baseForUltraFcst(now: Date) { // 초단기예보: 매시 30분, 45분 뒤 제공
  const t = new Date(now.getTime() - 45 * 60000);
  return { base_date: ymd(t), base_time: pad(t.getHours()) + "30" };
}
function baseForVilage(now: Date) { // 단기예보: 02,05,...,23시, 10분 뒤 제공
  const t = new Date(now.getTime() - 10 * 60000);
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = [...hours].reverse().find((x) => x <= t.getHours());
  if (h === undefined) { const y = new Date(t.getTime() - 24 * 3600000); return { base_date: ymd(y), base_time: "2300" }; }
  return { base_date: ymd(t), base_time: pad(h) + "00" };
}

// ---------- API 호출 ----------
async function kma(op: string, base: { base_date: string; base_time: string }, r: Region, rows: number) {
  const url = `${KMA}/${op}?serviceKey=${keyParam()}&pageNo=1&numOfRows=${rows}&dataType=JSON&base_date=${base.base_date}&base_time=${base.base_time}&nx=${r.nx}&ny=${r.ny}`;
  const j = await httpGetJson(url);
  const code = j?.response?.header?.resultCode;
  if (code !== "00") throw new Error(`기상청 ${op}: ${j?.response?.header?.resultMsg || code || "응답 없음"}`);
  return (j.response.body?.items?.item ?? []) as Array<{ category: string; obsrValue?: string; fcstValue?: string; fcstDate?: string; fcstTime?: string }>;
}

export async function fetchWeather(r: Region): Promise<Weather> {
  const now = new Date();
  const [ncst, ultra, vilage] = await Promise.all([
    kma("getUltraSrtNcst", baseForNcst(now), r, 20).catch((e) => { console.warn(e); return []; }),
    kma("getUltraSrtFcst", baseForUltraFcst(now), r, 120),
    kma("getVilageFcst", baseForVilage(now), r, 1000).catch((e) => { console.warn(e); return []; }),
  ]);

  const cur: Record<string, string> = {};
  ncst.forEach((i) => { cur[i.category] = i.obsrValue ?? ""; });

  // 시각별로 모으기: 초단기(6시간, T1H) 우선, 그 뒤는 단기(TMP)
  const byTime = new Map<string, Record<string, string>>();
  const put = (i: { category: string; fcstValue?: string; fcstDate?: string; fcstTime?: string }, prefer: boolean) => {
    const k = `${i.fcstDate}${i.fcstTime}`;
    const o = byTime.get(k) ?? {};
    if (prefer || !(i.category in o)) o[i.category] = i.fcstValue ?? "";
    byTime.set(k, o);
  };
  vilage.forEach((i) => put(i, false));
  ultra.forEach((i) => put(i, true));

  const num = (v: string | undefined) => (v === undefined || v === "" || v === "-" ? null : Number(v));
  const hourly: Hour[] = [];
  const start = new Date(now); start.setMinutes(0, 0, 0);
  for (let h = 0; h < 15; h++) {
    const t = new Date(start.getTime() + h * 3600000);
    const key = `${ymd(t)}${pad(t.getHours())}00`;
    const o = byTime.get(key);
    if (!o) continue;
    hourly.push({ key, label: h === 0 ? "지금" : `${t.getHours()}시`, hour: t.getHours(), temp: num(o.T1H) ?? num(o.TMP), sky: Number(o.SKY ?? 3), pty: Number(o.PTY ?? 0) });
  }
  const first = hourly[0];
  const todayKey = ymd(now);
  const tomorrow = new Date(now.getTime() + 24 * 3600000);
  const tomorrowKey = ymd(tomorrow);
  const dayStat = (dayKey: string) => {
    let max: number | null = null, min: number | null = null;
    for (const [k, o] of byTime) {
      if (!k.startsWith(dayKey)) continue;
      if (o.TMX) max = Number(o.TMX);
      if (o.TMN) min = Number(o.TMN);
    }
    if (max === null || min === null) { // 발표 시각에 따라 TMX/TMN 이 없으면 시간별 기온으로 대신
      const temps = [...byTime].filter(([k]) => k.startsWith(dayKey)).map(([, o]) => num(o.TMP) ?? num(o.T1H)).filter((x): x is number => x !== null);
      if (temps.length) { max = max ?? Math.max(...temps); min = min ?? Math.min(...temps); }
    }
    return { max, min };
  };
  // 3일치 요약: 최고/최저, 대표 하늘(낮 12시, 없으면 가장 가까운 시각), 강수형태는 그날 중 가장 심한 것, 강수확률 최댓값
  const dayLabels = ["오늘", "내일", "모레"];
  const daily: Day[] = [0, 1, 2].map((d) => {
    const dt = new Date(now.getTime() + d * 24 * 3600000);
    const key = ymd(dt);
    const stat = dayStat(key);
    const hours = [...byTime].filter(([k]) => k.startsWith(key)).sort(([a], [b]) => a.localeCompare(b));
    const rep = (byTime.get(`${key}1200`) ?? byTime.get(`${key}1500`) ?? byTime.get(`${key}0900`) ?? hours[Math.floor(hours.length / 2)]?.[1] ?? {}) as Record<string, string>;
    let pty = 0, pop: number | null = null;
    for (const [, o] of hours) {
      const p = Number(o.PTY ?? 0); if (p > pty) pty = p;
      if (o.POP !== undefined) pop = Math.max(pop ?? 0, Number(o.POP));
    }
    return { label: dayLabels[d], date: `${dt.getMonth() + 1}/${dt.getDate()}(${"일월화수목금토"[dt.getDay()]})`, max: stat.max, min: stat.min, sky: Number(rep.SKY ?? 3), pty, pop };
  });
  void tomorrowKey;
  return {
    current: {
      temp: num(cur.T1H) ?? first?.temp ?? null,
      humidity: num(cur.REH),
      wind: num(cur.WSD),
      sky: first?.sky ?? 3,
      pty: cur.PTY !== undefined ? Number(cur.PTY) : first?.pty ?? 0,
      rain: cur.RN1 && cur.RN1 !== "0" && cur.RN1 !== "강수없음" ? cur.RN1 : "",
    },
    hourly,
    today: dayStat(todayKey),
    daily,
    updated: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

export async function fetchDust(r: Region): Promise<Dust | null> {
  const url = `${AIR}?serviceKey=${keyParam()}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodeURIComponent(r.dust)}&ver=1.0`;
  const j = await httpGetJson(url);
  const code = j?.response?.header?.resultCode;
  if (code !== "00") throw new Error(`에어코리아: ${j?.response?.header?.resultMsg || code || "응답 없음"}`);
  const items = (j.response.body?.items ?? []) as Array<Record<string, string>>;
  const valid = items.filter((i) => i.pm10Value && i.pm10Value !== "-");
  if (!valid.length) return null;
  // 시/군/구 이름(홍성군 → 홍성)이 들어간 측정소를 우선, 없으면 시/도 평균
  const short = r.sigungu.replace(/(특별자치)?(시|군|구)$/, "");
  const hit = valid.find((i) => i.stationName?.includes(short));
  if (hit) return { pm10: Number(hit.pm10Value), pm25: hit.pm25Value && hit.pm25Value !== "-" ? Number(hit.pm25Value) : null, station: hit.stationName, time: hit.dataTime };
  const avg = (k: string) => { const v = valid.map((i) => Number(i[k])).filter((x) => !isNaN(x) && x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return { pm10: avg("pm10Value"), pm25: avg("pm25Value"), station: `${r.dust} 평균`, time: valid[0].dataTime };
}

// ---------- 표시 ----------
function describe(sky: number, pty: number, isDay: boolean) {
  if (pty === 1 || pty === 5) return { desc: pty === 5 ? "빗방울" : "비", icon: "cloud-rain", color: "text-blue-500" };
  if (pty === 2 || pty === 6) return { desc: "비/눈", icon: "cloud-rain-wind", color: "text-blue-400" };
  if (pty === 3 || pty === 7) return { desc: pty === 7 ? "눈날림" : "눈", icon: "cloud-snow", color: "text-sky-400" };
  if (pty === 4) return { desc: "소나기", icon: "cloud-drizzle", color: "text-blue-400" };
  if (sky === 1) return { desc: "맑음", icon: isDay ? "sun" : "moon", color: "text-orange-400" };
  if (sky === 3) return { desc: "구름많음", icon: isDay ? "cloud-sun" : "cloud-moon", color: "text-blue-400" };
  return { desc: "흐림", icon: "cloud", color: "text-slate-400" };
}
function dustGrade(v: number | null) {
  if (v === null) return { text: "정보없음", color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-100" };
  if (v <= 30) return { text: "좋음", color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100" };
  if (v <= 80) return { text: "보통", color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100" };
  if (v <= 150) return { text: "나쁨", color: "text-orange-500", bg: "bg-orange-50", border: "border-orange-100" };
  return { text: "매우나쁨", color: "text-red-500", bg: "bg-red-50", border: "border-red-100" };
}
const el = (id: string) => document.getElementById(id);
const icons = () => window.lucide?.createIcons();

function setHeader(iconHtml: string, text: string) {
  const ic = el("header-weather-icon-container"), tx = el("header-weather-text");
  if (ic) ic.innerHTML = iconHtml;
  if (tx) tx.innerText = text;
}

let lastWeather: Weather | null = null, lastDust: Dust | null = null, lastError = "";

export async function refreshWeather() {
  const r = getRegion();
  const title = el("weather-location-title"); if (title) title.innerText = r.sigungu + " ";
  if (!getKey()) {
    lastError = "no-key";
    setHeader('<i data-lucide="key-round" class="mr-2 text-amber-500 w-6 h-6"></i>', "날씨: 인증키 필요");
    const dt = el("header-dust-text"); if (dt) dt.innerText = "미세먼지: 인증키 필요";
    renderModal(r); icons(); return;
  }
  setHeader('<i data-lucide="loader-2" class="mr-2 text-slate-400 w-6 h-6 animate-spin"></i>', "날씨 확인 중..."); icons();
  const [w, d] = await Promise.allSettled([fetchWeather(r), fetchDust(r)]);
  if (w.status === "fulfilled") { lastWeather = w.value; lastError = ""; }
  else { lastWeather = null; lastError = String(w.reason?.message || w.reason); console.error("날씨 오류:", w.reason); }
  lastDust = d.status === "fulfilled" ? d.value : null;
  if (d.status === "rejected") console.error("미세먼지 오류:", d.reason);

  if (lastWeather) {
    const c = lastWeather.current;
    const info = describe(c.sky, c.pty, isDaytime(new Date().getHours()));
    setHeader(`<i data-lucide="${info.icon}" class="mr-2 ${info.color} w-6 h-6"></i>`, `[${r.sigungu}] ${info.desc}, ${c.temp ?? "-"}°C`);
  } else {
    setHeader('<i data-lucide="alert-circle" class="mr-2 text-red-500 w-6 h-6"></i>', "날씨 정보 오류");
  }
  const dg = dustGrade(lastDust?.pm10 ?? null);
  const dc = el("header-dust-container"), dt = el("header-dust-text");
  if (dc) dc.className = `flex items-center text-lg font-bold ${dg.color}`;
  if (dt) dt.innerText = lastDust ? `미세먼지: ${dg.text}` : "미세먼지: 정보없음";
  renderModal(r); icons();
}
const isDaytime = (h: number) => h >= 6 && h < 19;

function renderModal(r: Region) {
  const box = el("modal-weather-content"); if (!box) return;
  if (lastError === "no-key") {
    box.innerHTML = `<div class="text-center py-8"><i data-lucide="key-round" class="w-12 h-12 mx-auto text-amber-500 mb-3"></i><p class="font-bold text-lg text-slate-700">공공데이터포털 인증키가 필요합니다</p><p class="text-slate-500 mt-2">오른쪽 위 ⚙ 버튼을 눌러 지역과 인증키를 설정해 주세요.</p></div>`;
    return;
  }
  if (!lastWeather) {
    box.innerHTML = `<div class="text-center py-8"><i data-lucide="alert-circle" class="w-12 h-12 mx-auto text-red-400 mb-3"></i><p class="font-bold text-lg text-slate-700">날씨 정보를 가져오지 못했습니다</p><p class="text-slate-500 mt-2 text-sm break-all">${lastError || ""}</p><button onclick="window.weather.refresh()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">다시 시도</button></div>`;
    return;
  }
  const w = lastWeather, c = w.current;
  const info = describe(c.sky, c.pty, isDaytime(new Date().getHours()));
  const dg = dustGrade(lastDust?.pm10 ?? null), dg25 = dustGrade(lastDust?.pm25 === null || lastDust?.pm25 === undefined ? null : lastDust.pm25 * 2);
  const hourly = w.hourly.map((h, i) => {
    const hi = describe(h.sky, h.pty, isDaytime(h.hour));
    return `<div class="flex flex-col items-center min-w-[4.5rem] shrink-0"><span class="text-base ${i === 0 ? "text-blue-600 font-bold" : "text-slate-500"} mb-2">${h.label}</span><i data-lucide="${hi.icon}" class="${hi.color} w-8 h-8 mb-2"></i><span class="text-xl font-bold">${h.temp ?? "-"}°C</span></div>`;
  }).join("");
  const dayCards = w.daily.map((d, i) => {
    const di = describe(d.sky, d.pty, true);
    return `<div class="flex flex-col items-center ${i === 0 ? "bg-brand-50 border-brand-100" : "bg-slate-50 border-slate-200"} border rounded-xl p-3">
      <span class="font-bold ${i === 0 ? "text-brand-700" : "text-slate-700"}">${d.label}</span>
      <span class="text-xs text-slate-400 mb-1">${d.date}</span>
      <i data-lucide="${di.icon}" class="${di.color} w-9 h-9 my-1"></i>
      <span class="text-sm font-bold text-slate-600">${di.desc}</span>
      <span class="text-lg font-bold mt-1"><span class="text-red-500">${d.max ?? "-"}°</span> <span class="text-slate-300">/</span> <span class="text-blue-500">${d.min ?? "-"}°</span></span>
      ${d.pop !== null ? `<span class="text-xs text-slate-500 mt-0.5">강수 ${d.pop}%</span>` : ""}
    </div>`;
  }).join("");
  box.innerHTML = `
    <div class="flex items-center justify-between bg-slate-800 text-white p-6 rounded-2xl shadow-md mb-6 shrink-0">
      <div class="flex flex-col">
        <span class="text-slate-300 font-bold mb-1"><i data-lucide="map-pin" class="inline w-4 h-4 mr-1"></i>${r.name}</span>
        <span class="text-5xl font-bold">${c.temp ?? "-"}°C</span>
        <span class="text-xl mt-1 text-slate-200">${info.desc}${c.rain ? ` · 1시간 강수 ${c.rain}mm` : ""}</span>
        <span class="text-sm mt-2 text-slate-400">최고 ${w.today.max ?? "-"}° / 최저 ${w.today.min ?? "-"}° · 습도 ${c.humidity ?? "-"}% · 바람 ${c.wind ?? "-"}m/s</span>
      </div>
      <i data-lucide="${info.icon}" class="w-20 h-20 ${info.color}"></i>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6 shrink-0">
      <div class="${dg.bg} p-4 rounded-xl border ${dg.border} flex flex-col items-center shadow-sm"><i data-lucide="wind" class="${dg.color} w-8 h-8 mb-2"></i><span class="text-base font-bold">미세먼지 (PM10)</span><span class="text-2xl font-bold ${dg.color}">${dg.text}</span><span class="text-xs text-slate-400">${lastDust?.pm10 ?? "-"}㎍/㎥ · ${lastDust?.station ?? ""}</span></div>
      <div class="${dg25.bg} p-4 rounded-xl border ${dg25.border} flex flex-col items-center shadow-sm"><i data-lucide="haze" class="${dg25.color} w-8 h-8 mb-2"></i><span class="text-base font-bold">초미세먼지 (PM2.5)</span><span class="text-2xl font-bold ${dg25.color}">${lastDust?.pm25 === null || lastDust?.pm25 === undefined ? "정보없음" : dustGrade(lastDust.pm25 * 2).text}</span><span class="text-xs text-slate-400">${lastDust?.pm25 ?? "-"}㎍/㎥</span></div>
    </div>
    <div class="mb-2 font-bold text-slate-600">시간별 예보</div>
    <div class="flex overflow-x-auto gap-2 pb-3 hide-scrollbar shrink-0">${hourly || '<span class="text-slate-400">예보 없음</span>'}</div>
    <div class="mt-4 mb-2 font-bold text-slate-600">3일 예보</div>
    <div class="grid grid-cols-3 gap-3">${dayCards}</div>
    <div class="text-right text-xs text-slate-400 mt-3">기상청·에어코리아 · ${w.updated} 갱신</div>`;
}

// ---------- 지역·인증키 설정 패널 ----------
export function renderRegionPanel() {
  const r = getRegion();
  const sidoSel = el("weather-sido") as HTMLSelectElement | null;
  const sggSel = el("weather-sigungu") as HTMLSelectElement | null;
  const keyInput = el("weather-api-key") as HTMLInputElement | null;
  if (!sidoSel || !sggSel) return;
  sidoSel.innerHTML = REGIONS.map((s) => `<option value="${s.name}">${s.name}</option>`).join("");
  sidoSel.value = r.sido;
  fillSigungu(r.sido, r.sigungu);
  if (keyInput) keyInput.value = getKey();
}
export function fillSigungu(sido: string, selected?: string) {
  const sggSel = el("weather-sigungu") as HTMLSelectElement | null;
  const s = REGIONS.find((x) => x.name === sido);
  if (!sggSel || !s) return;
  sggSel.innerHTML = s.items.map((i) => `<option value="${i.name}">${i.name}</option>`).join("");
  sggSel.value = selected && s.items.some((i) => i.name === selected) ? selected : s.items[0].name;
}
export function applyRegionPanel() {
  const sido = (el("weather-sido") as HTMLSelectElement).value;
  const sgg = (el("weather-sigungu") as HTMLSelectElement).value;
  const key = (el("weather-api-key") as HTMLInputElement).value;
  saveRegion(sido, sgg);
  saveKey(key);
  el("region-selector-panel")?.classList.add("hidden");
  void refreshWeather();
}

declare global {
  interface Window {
    weather: { refresh: () => Promise<void>; renderRegionPanel: () => void; fillSigungu: (s: string) => void; applyRegionPanel: () => void };
  }
}
window.weather = { refresh: refreshWeather, renderRegionPanel, fillSigungu: (s) => fillSigungu(s), applyRegionPanel };
