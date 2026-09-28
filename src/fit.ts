// ============================================================
// 가로 도구 메뉴를 너비에 맞춰 비율로 줄이고 늘림 (2.1.0)
//  - 버튼들의 원래 너비가 남은 공간보다 크면 zoom 으로 줄여 한 줄에 다 들어가게
//  - 공간이 남으면 최대 1.25배까지 키움
//  - 창 크기 변경·버튼 숨김/표시 때 다시 계산
// ============================================================
interface FitOptions { min?: number; max?: number }

export function fitToWidth(el: HTMLElement, opts: FitOptions = {}) {
  const min = opts.min ?? 0.45, max = opts.max ?? 1.25;
  const parent = el.parentElement!;
  let raf = 0;

  const measure = () => {
    raf = 0;
    // 다른 형제(설정 버튼 등)가 차지한 너비를 뺀 남은 공간
    const pcs = getComputedStyle(parent);
    const gap = parseFloat(pcs.columnGap || pcs.gap || "0") || 0;
    let siblings = 0, n = 0;
    for (const c of Array.from(parent.children)) {
      if (c === el) continue;
      const r = (c as HTMLElement).getBoundingClientRect();
      if (r.width > 0) { siblings += r.width; n++; }
    }
    // 4px 여유: 소수점 반올림으로 1~2px 넘쳐 스크롤바가 생기는 것을 막음
    const avail = parent.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - siblings - gap * n - 8;
    // 원래 크기(zoom 1)에서의 내용 너비
    const prev = el.style.zoom;
    el.style.zoom = "1";
    el.style.flex = "0 0 auto";
    const natural = el.scrollWidth;
    el.style.flex = "";
    if (natural <= 0 || avail <= 0) { el.style.zoom = prev; return; }
    const z = Math.min(max, Math.max(min, avail / natural));
    el.style.zoom = z.toFixed(4);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };

  new ResizeObserver(schedule).observe(parent);
  new MutationObserver(schedule).observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ["style", "class"] });
  window.addEventListener("resize", schedule);
  document.fonts?.ready.then(schedule);
  window.addEventListener("load", schedule);
  [300, 1000, 2500].forEach((ms) => window.setTimeout(schedule, ms)); // 글꼴·아이콘이 늦게 자리 잡는 경우
  schedule();
}

export function initFit() {
  const tools = document.getElementById("toolbar-tools");
  if (tools) fitToWidth(tools, { min: 0.3, max: 1.25 });
}
