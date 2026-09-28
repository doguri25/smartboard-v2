// ============================================================
// 떠 있는 팝업(팝업 노트, 타이머, 소음 측정기, 학습 약속)을
//  - 머리글을 잡고 드래그로 옮기고
//  - 오른쪽 아래 손잡이로 크기를 바꾸고
//  - 위치·크기를 저장해 다시 열거나 앱을 다시 켜도 그 자리에 나오게 합니다.
//
// 저장 형식 (키 "sb.float.<id>"):
//   x, y : 화면 너비·높이에 대한 비율 (0~1) → 창 크기가 달라져도 비슷한 자리에
//   b    : 아래쪽 기준으로 붙는 위젯(학습 약속)의 bottom 비율
//   w, h : 상자 크기(rem) — mode "box"
//   s    : 확대 배율 — mode "scale"
// 저장은 storage.ts 를 통해 settings.json 에 들어갑니다.
// ============================================================
import { storage } from "./storage";

type Mode = "box" | "scale" | "move";
type Anchor = "top-left" | "bottom-left";

interface FloatingOptions {
  /** 옮길 요소의 id */
  id: string;
  /** 드래그 손잡이(머리글) 선택자. 생략하면 첫 번째 자식 요소 */
  handle?: string;
  /** box: 가로세로 크기 변경 / scale: 통째로 확대·축소 / move: 이동만 */
  mode: Mode;
  /** bottom-left: 아래쪽에 붙어서 위로 자라는 위젯(메뉴가 위로 열리는 학습 약속) */
  anchor?: Anchor;
  minW?: number; // rem
  minH?: number; // rem
  minScale?: number;
  maxScale?: number;
  /** 옮긴 적이 없으면 처음엔 화면 가운데에 (유튜브) */
  centerFirst?: boolean;
}

interface SavedState {
  x?: number; y?: number; b?: number;
  w?: number; h?: number; s?: number;
}

const STORAGE_PREFIX = "sb.float.";
let zCounter = 100;
const interacting = new Set<string>(); // 드래그/크기조절 중인 팝업 id
const registry: Array<{ el: HTMLElement; opts: FloatingOptions }> = [];

const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
const isVisible = (el: HTMLElement) => getComputedStyle(el).display !== "none";
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function load(id: string): SavedState {
  try { return JSON.parse(storage.getItem(STORAGE_PREFIX + id) || "{}"); } catch { return {}; }
}
function save(id: string, patch: SavedState) {
  try {
    const next = { ...load(id), ...patch };
    storage.setItem(STORAGE_PREFIX + id, JSON.stringify(next));
  } catch (e) { console.warn("팝업 위치 저장 실패", e); }
}

/** 저장된 상태를 요소에 적용하고 화면 안으로 밀어 넣습니다. */
function applyState(el: HTMLElement, opts: FloatingOptions) {
  if (interacting.has(opts.id)) return;
  const st = load(opts.id);
  el.style.position = "fixed";
  if (opts.mode === "box") {
    if (st.w) el.style.width = st.w + "rem";
    if (st.h) el.style.height = st.h + "rem";
  } else if (opts.mode === "scale") {
    el.style.transformOrigin = opts.anchor === "bottom-left" ? "bottom left" : "top left";
    if (st.s !== undefined) el.style.transform = `scale(${st.s})`;
  }

  const vw = window.innerWidth, vh = window.innerHeight;
  if (st.x === undefined && opts.centerFirst && isVisible(el)) {
    // 아직 옮긴 적이 없으면 화면 가운데에 (크기가 자리 잡은 다음 프레임에 계산)
    const center = () => {
      // 나타나는 애니메이션(scale) 중이라 getBoundingClientRect 는 작게 나오므로 offset 크기를 씀
      el.style.left = Math.max(0, (window.innerWidth - el.offsetWidth) / 2) + "px";
      el.style.top = Math.max(0, (window.innerHeight - el.offsetHeight) / 2) + "px";
      el.style.right = "auto"; el.style.bottom = "auto";
    };
    center(); requestAnimationFrame(center);
  }
  if (st.x !== undefined) {
    el.style.left = st.x * vw + "px";
    el.style.right = "auto";
    if (opts.anchor === "bottom-left") {
      el.style.bottom = (st.b ?? 0) * vh + "px";
      el.style.top = "auto";
    } else {
      el.style.top = (st.y ?? 0) * vh + "px";
      el.style.bottom = "auto";
    }
  }
  keepInside(el, opts);
}

/** 화면 밖으로 나간 부분이 있으면 안쪽으로 되돌립니다. (보이는 요소만) */
function keepInside(el: HTMLElement, opts: FloatingOptions) {
  if (!isVisible(el)) return;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = clamp(r.left, 0, Math.max(0, vw - r.width));
  if (opts.anchor === "bottom-left") {
    const bottom = clamp(vh - r.bottom, 0, Math.max(0, vh - r.height));
    if (Math.abs(left - r.left) > 0.5 || Math.abs(bottom - (vh - r.bottom)) > 0.5) {
      setPos(el, opts, left, undefined, bottom);
    }
  } else {
    const top = clamp(r.top, 0, Math.max(0, vh - r.height));
    if (Math.abs(left - r.left) > 0.5 || Math.abs(top - r.top) > 0.5) {
      setPos(el, opts, left, top);
    }
  }
}

/** 실제 화면 px 좌표로 위치를 지정하고 비율로 저장합니다. */
function setPos(el: HTMLElement, opts: FloatingOptions, left: number, top?: number, bottom?: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.position = "fixed";
  el.style.left = left + "px";
  el.style.right = "auto";
  if (opts.anchor === "bottom-left") {
    el.style.bottom = (bottom ?? 0) + "px";
    el.style.top = "auto";
    save(opts.id, { x: left / vw, b: (bottom ?? 0) / vh });
  } else {
    el.style.top = (top ?? 0) + "px";
    el.style.bottom = "auto";
    save(opts.id, { x: left / vw, y: (top ?? 0) / vh });
  }
}

function bringToFront(el: HTMLElement) {
  // 100~119 사이를 돌려 씀: 알람 팝업(z 120)보다는 항상 아래, 일반 창보다는 위
  zCounter = zCounter >= 119 ? 100 : zCounter + 1;
  el.style.zIndex = String(zCounter);
}

/** 머리글 드래그 */
function attachDrag(el: HTMLElement, handle: HTMLElement, opts: FloatingOptions) {
  handle.classList.add("sb-float-handle");
  let dragging = false, moved = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0, startBottom = 0;
  let width = 0, height = 0;

  handle.addEventListener("pointerdown", (e) => {
    // 머리글 안의 버튼·입력칸을 누른 경우는 드래그가 아님
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a, [contenteditable]")) return;
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    dragging = true; moved = false;
    interacting.add(opts.id);
    startX = e.clientX; startY = e.clientY;
    startLeft = r.left; startTop = r.top; startBottom = window.innerHeight - r.bottom;
    width = r.width; height = r.height;
    bringToFront(el);
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = clamp(startLeft + dx, 0, Math.max(0, vw - width));
    if (opts.anchor === "bottom-left") {
      const bottom = clamp(startBottom - dy, 0, Math.max(0, vh - height));
      el.style.left = left + "px"; el.style.right = "auto";
      el.style.bottom = bottom + "px"; el.style.top = "auto";
    } else {
      const top = clamp(startTop + dy, 0, Math.max(0, vh - height));
      el.style.left = left + "px"; el.style.right = "auto";
      el.style.top = top + "px"; el.style.bottom = "auto";
    }
  });

  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    interacting.delete(opts.id);
    try { handle.releasePointerCapture(e.pointerId); } catch { /* 무시 */ }
    if (moved) {
      const r = el.getBoundingClientRect();
      if (opts.anchor === "bottom-left") setPos(el, opts, r.left, undefined, window.innerHeight - r.bottom);
      else setPos(el, opts, r.left, r.top);
    }
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);

  // 드래그한 직후에 딸려오는 click은 무시 (학습 약속 위젯처럼 머리글 자체가 버튼인 경우)
  handle.addEventListener("click", (e) => {
    if (moved) { moved = false; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
}

/** 오른쪽 아래 손잡이로 크기 조절 */
function attachResize(el: HTMLElement, opts: FloatingOptions) {
  const grip = document.createElement("div");
  // 손잡이는 모든 창이 똑같이 오른쪽 아래 (2.5.1)
  // 아래쪽에 붙어 있는 창(학습 약속)은 크기를 조절하는 동안만 위·왼쪽을 고정으로 바꿔서
  // 마우스가 끄는 방향(오른쪽 아래)으로 커지게 하고, 놓으면 다시 아래쪽 기준으로 되돌려 저장한다
  const bottomAnchored = opts.anchor === "bottom-left";
  grip.className = "sb-resize-grip";
  grip.title = "크기 조절";
  el.appendChild(grip);

  let resizing = false;
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    resizing = true;
    interacting.add(opts.id);
    bringToFront(el);
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    if (bottomAnchored) {
      // 조절하는 동안: 위·왼쪽 고정 (보이는 위치는 그대로)
      const r = el.getBoundingClientRect();
      el.style.top = r.top + "px";
      el.style.bottom = "auto";
      if (opts.mode === "scale") el.style.transformOrigin = "top left";
    }
  });
  grip.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const r = el.getBoundingClientRect();
    if (opts.mode === "box") {
      const px = rootPx();
      const w = Math.max(opts.minW ?? 14, (e.clientX - r.left) / px);
      const h = Math.max(opts.minH ?? 10, (e.clientY - r.top) / px);
      el.style.width = w + "rem";
      el.style.height = h + "rem";
    } else if (opts.mode === "scale") {
      // 배율 = (고정된 모서리에서 손잡이까지의 실제 거리) / (원래 크기). 가로·세로 비율의 평균
      const naturalW = el.offsetWidth, naturalH = el.offsetHeight; // transform 적용 전 크기
      const sx = (e.clientX - r.left) / naturalW;
      const sy = (e.clientY - r.top) / naturalH;
      const s = clamp((sx + sy) / 2, opts.minScale ?? 0.6, opts.maxScale ?? 2.5);
      el.style.transform = `scale(${s})`;
    }
  });
  const end = (e: PointerEvent) => {
    if (!resizing) return;
    resizing = false;
    interacting.delete(opts.id);
    try { grip.releasePointerCapture(e.pointerId); } catch { /* 무시 */ }
    if (bottomAnchored) {
      // 다시 아래쪽 기준으로 (보이는 위치는 그대로 두고 bottom 값으로 환산)
      const r = el.getBoundingClientRect();
      if (opts.mode === "scale") el.style.transformOrigin = "bottom left";
      setPos(el, opts, r.left, undefined, window.innerHeight - r.bottom);
    }
    if (opts.mode === "box") {
      save(opts.id, { w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
    } else if (opts.mode === "scale") {
      const m = /scale\(([\d.]+)\)/.exec(el.style.transform);
      save(opts.id, { s: m ? parseFloat(m[1]) : 1 });
    }
    keepInside(el, opts);
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}

/** 팝업 하나를 등록합니다. */
export function makeFloating(opts: FloatingOptions) {
  const el = document.getElementById(opts.id) as HTMLElement | null;
  if (!el) { console.warn("떠 있는 팝업을 찾을 수 없음:", opts.id); return; }
  const handle = (opts.handle ? el.querySelector(opts.handle) : el.firstElementChild) as HTMLElement | null;
  if (!handle) { console.warn("드래그 손잡이를 찾을 수 없음:", opts.id); return; }

  // pop-in 애니메이션은 transform 을 덮어써서 배율 조절과 충돌하므로 opacity 전용으로 교체
  // (주의: 감시자(MutationObserver)를 붙이기 전에 한 번만 바꿔야 함 — 감시 중에 class 를 건드리면
  //  값이 같아도 변경 기록이 생겨 무한 반복에 빠짐)
  if (el.classList.contains("animate-pop-in")) el.classList.remove("animate-pop-in");
  if (el.classList.contains("-translate-x-1/2")) el.classList.remove("-translate-x-1/2"); // 첫 배치용 가운데 정렬은 위치 계산과 충돌
  el.classList.add("sb-floating");

  attachDrag(el, handle, opts);
  if (opts.mode !== "move") attachResize(el, opts);
  el.addEventListener("pointerdown", () => bringToFront(el), true);

  // 숨김 → 표시로 바뀔 때 저장된 자리로 되돌리고 화면 안에 있는지 확인
  new MutationObserver(() => { if (isVisible(el)) applyState(el, opts); })
    .observe(el, { attributes: true, attributeFilter: ["class"] });

  registry.push({ el, opts });
  applyState(el, opts);
}

/** 앱의 떠 있는 팝업 전부 등록 */
export function initFloatingPanels() {
  makeFloating({ id: "floating-popup-note", mode: "box", minW: 16, minH: 14 });
  makeFloating({ id: "floating-timer", mode: "scale", minScale: 0.6, maxScale: 3 });
  makeFloating({ id: "floating-noise-meter", mode: "scale", minScale: 0.6, maxScale: 3 });
  makeFloating({ id: "btn-tool-activity", handle: "#activity-indicator", mode: "scale", anchor: "bottom-left", minScale: 0.7, maxScale: 2.5 });
  makeFloating({ id: "floating-youtube", handle: ".cursor-move", mode: "box", minW: 28, minH: 18, centerFirst: true });

  // 창 크기가 바뀌면 비율 기준으로 다시 배치
  let t: number | undefined;
  window.addEventListener("resize", () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => registry.forEach(({ el, opts }) => applyState(el, opts)), 100);
  });
}
