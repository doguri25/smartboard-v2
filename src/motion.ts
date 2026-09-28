// ============================================================
// 움직임 효과 (2.2.0)
//  - 팝업(모달)과 떠 있는 창이 열리고 닫힐 때 macOS 처럼 살짝 커지며 나타나고, 작아지며 사라짐
//    (기존 코드가 .active / .hidden 클래스를 바로 바꾸므로, 클래스 변화를 지켜보다가
//     닫히는 순간 .closing 을 잠깐 붙여 사라지는 애니메이션을 재생)
//  - 클릭 효과: 누르는 순간 살짝 눌리는 느낌 + 물결(ripple)
//  - 커서 물결(2.5.0): 버튼이 아니어도 화면 어디를 클릭(터치)하든 그 지점에서 원형 물결이 퍼짐
// CSS 는 src/motion.css
// ============================================================
const CLOSE_MS = 190;

function watchModal(m: HTMLElement) {
  let wasActive = m.classList.contains("active");
  let timer = 0;
  new MutationObserver(() => {
    const active = m.classList.contains("active");
    if (wasActive && !active && !m.classList.contains("closing")) {
      m.classList.add("closing");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => m.classList.remove("closing"), CLOSE_MS);
    }
    if (active && m.classList.contains("closing")) { window.clearTimeout(timer); m.classList.remove("closing"); }
    wasActive = active;
  }).observe(m, { attributes: true, attributeFilter: ["class"] });
}

function watchFloating(el: HTMLElement) {
  let wasHidden = el.classList.contains("hidden");
  let timer = 0;
  new MutationObserver(() => {
    const hidden = el.classList.contains("hidden");
    if (!wasHidden && hidden && !el.classList.contains("closing")) {
      el.classList.add("closing");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove("closing"), CLOSE_MS);
    }
    if (!hidden && el.classList.contains("closing")) { window.clearTimeout(timer); el.classList.remove("closing"); }
    wasHidden = hidden;
  }).observe(el, { attributes: true, attributeFilter: ["class"] });
}

/** 물결 효과: 누른 지점에서 원이 퍼져 나감 */
function ripple(e: PointerEvent) {
  if (e.button !== 0) return;
  const origin = e.target as HTMLElement | null;
  if (!origin || typeof origin.closest !== "function") return;
  const target = origin.closest<HTMLElement>("button, .timetable-slot, .skin-card, #activity-indicator, .sb-tap");
  if (!target || target.closest(".ProseMirror") || (target as HTMLButtonElement).disabled) return;
  if (getComputedStyle(target).position === "static") target.style.position = "relative";
  const box = document.createElement("span");
  box.className = "sb-ripple-box";
  const r = target.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const dot = document.createElement("span");
  dot.className = "sb-ripple";
  dot.style.width = dot.style.height = size + "px";
  dot.style.left = e.clientX - r.left - size / 2 + "px";
  dot.style.top = e.clientY - r.top - size / 2 + "px";
  box.appendChild(dot);
  target.appendChild(box);
  dot.addEventListener("animationend", () => box.remove(), { once: true });
  window.setTimeout(() => box.remove(), 800);
}

/** 커서 물결: 화면 어디를 눌러도 누른 지점에서 원이 퍼져 나감 (별도 오버레이 층에 그림) */
let fxLayer: HTMLElement | null = null;
function cursorRipple(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  if (!fxLayer) {
    fxLayer = document.createElement("div");
    fxLayer.id = "sb-click-fx";
    fxLayer.setAttribute("aria-hidden", "true");
    document.body.appendChild(fxLayer);
  }
  // 겹치는 창 위에 계속 보이도록 항상 body 맨 뒤에 둔다
  if (fxLayer !== document.body.lastElementChild) document.body.appendChild(fxLayer);
  const ring = document.createElement("span");
  ring.className = "sb-cursor-ripple" + (e.pointerType === "touch" ? " is-touch" : "");
  ring.style.left = e.clientX + "px";
  ring.style.top = e.clientY + "px";
  fxLayer.appendChild(ring);
  ring.addEventListener("animationend", () => ring.remove(), { once: true });
  window.setTimeout(() => ring.remove(), 900);
  // 너무 많이 쌓이지 않게 정리
  while (fxLayer.childElementCount > 12) fxLayer.firstElementChild?.remove();
}

export function initMotion() {
  document.querySelectorAll<HTMLElement>(".modal").forEach(watchModal);
  document.querySelectorAll<HTMLElement>(".sb-floating").forEach(watchFloating);
  document.addEventListener("pointerdown", ripple, { passive: true });
  document.addEventListener("pointerdown", cursorRipple, { passive: true, capture: true });
  // 안전장치: 어떤 이유로든 .closing 이 남아 있으면 0.5초 뒤 강제로 정리 (창이 안 닫히는 일이 없도록)
  window.setInterval(() => {
    document.querySelectorAll<HTMLElement>(".closing").forEach((el) => {
      const isModal = el.classList.contains("modal");
      const shouldBeClosed = isModal ? !el.classList.contains("active") : el.classList.contains("hidden");
      if (shouldBeClosed) el.classList.remove("closing");
    });
  }, 500);
}
