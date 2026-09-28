// ============================================================
// 판서 편집기 (4단계) — TipTap(ProseMirror) 기반
//  - 선택한 글자에만 글꼴·크기·색이 적용됨 (선택이 없으면 기본 글꼴·크기 변경)
//  - 사진: 모서리 손잡이로 크기 조절, 정렬, 드래그 앤 드롭·붙여넣기 삽입
//  - 표 삽입, 정렬, 굵게/기울임, 되돌리기
//  - 저장 형식은 HTML (v1 판서·보관 목록과 호환)
// legacy-app.js 는 window.boardEditor 로 이 API 를 씁니다.
// ============================================================
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

// --- 사진 노드: 너비/높이(px)와 정렬 속성 추가 ---------------------------------
const BoardImage = Image.extend({
  addAttributes() {
    const parsePx = (el: HTMLElement, attr: "width" | "height") => {
      const a = el.getAttribute(attr);
      if (a && /^\d+/.test(a)) return parseInt(a, 10);
      const s = el.style[attr];
      if (s && s.endsWith("px")) return parseInt(s, 10);
      return null;
    };
    return {
      ...this.parent?.(),
      width: { default: null, parseHTML: (el: HTMLElement) => parsePx(el, "width") },
      height: { default: null, parseHTML: (el: HTMLElement) => parsePx(el, "height") },
      align: {
        default: "center",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-align") || (el.parentElement?.style.textAlign as string) || "center",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": attrs.align }),
      },
    };
  },
});

const MAX_IMAGE_WIDTH = 1024;

type UpdateListener = () => void;

class BoardEditor {
  private editor!: Editor;
  private container!: HTMLElement;
  private listeners: UpdateListener[] = [];
  private toolbar: HTMLElement | null = null;
  /** 마지막으로 잡았던 글자 선택 범위. 글꼴 선택 상자 등을 누르면 브라우저가 선택을 풀어 버리는 경우가
   *  있어, 그때 이 범위에 서식을 적용한다. 편집기 안을 클릭하거나 글자를 치면 지워진다. */
  private lastRange: { from: number; to: number } | null = null;
  private lastEditorInteraction = 0;

  init(container: HTMLElement) {
    this.container = container;
    this.toolbar = document.getElementById("image-action-toolbar");
    this.editor = new Editor({
      element: container,
      extensions: [
        StarterKit.configure({ link: false, code: false, codeBlock: false }),
        TextStyleKit,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TableKit.configure({ table: { resizable: true } }),
        BoardImage.configure({
          allowBase64: true,
          resize: {
            enabled: true,
            directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
            minWidth: 40,
            minHeight: 40,
            alwaysPreserveAspectRatio: true,
          },
        }),
        Placeholder.configure({ placeholder: "이곳에 내용을 입력하거나 필기하세요..." }),
      ],
      content: "",
      editorProps: {
        attributes: { class: "sb-rich" },
        handleDrop: (_view, event, _slice, moved) => {
          const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (moved || files.length === 0) return false;
          event.preventDefault();
          files.forEach((f) => void this.insertImageFile(f));
          return true;
        },
        handlePaste: (_view, event) => {
          const items = Array.from(event.clipboardData?.items ?? []);
          const files = items.filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
          if (files.length === 0) return false;
          event.preventDefault();
          files.forEach((f) => void this.insertImageFile(f));
          return true;
        },
      },
      onUpdate: () => { this.listeners.forEach((cb) => cb()); this.trackSelection(); },
      onSelectionUpdate: () => { this.trackSelection(); this.updateImageToolbar(); },
      onBlur: () => setTimeout(() => this.updateImageToolbar(), 150),
    });

    // 사진 드롭 안내 표시
    container.addEventListener("dragover", (e) => { if (e.dataTransfer?.types.includes("Files")) container.classList.add("dragover"); });
    container.addEventListener("dragleave", () => container.classList.remove("dragover"));
    container.addEventListener("drop", () => container.classList.remove("dragover"));
    // 스크롤하면 사진 도구 위치 갱신
    container.addEventListener("scroll", () => this.updateImageToolbar());
    // 편집기 안에서의 직접 조작(클릭·키 입력)만 기억한 선택 범위를 지우게 함
    const mark = () => { this.lastEditorInteraction = Date.now(); };
    this.editor.view.dom.addEventListener("mousedown", mark, true);
    this.editor.view.dom.addEventListener("keydown", mark, true);
    // 판서 도구 모음의 버튼은 눌러도 편집기 포커스(=선택)를 뺏지 않게
    document.getElementById("notepad-toolbar")?.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
    document.getElementById("image-action-toolbar")?.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  }

  private trackSelection() {
    const sel = this.editor.state.selection;
    if (!sel.empty && !(sel instanceof NodeSelection)) { this.lastRange = { from: sel.from, to: sel.to }; return; }
    // 비어 있는 선택: 사용자가 편집기 안에서 직접 움직인 경우에만 기억을 지움
    if (Date.now() - this.lastEditorInteraction < 600) this.lastRange = null;
  }
  /** 현재 선택이 비어 있고 기억한 범위가 있으면 그 범위를 되살림. 서식 명령 앞에서 호출 */
  private restoreRange(): boolean {
    const sel = this.editor.state.selection;
    if (!sel.empty) return true;
    const r = this.lastRange;
    if (!r) return false;
    const max = this.editor.state.doc.content.size;
    if (r.from < 0 || r.to > max || r.from >= r.to) { this.lastRange = null; return false; }
    this.editor.commands.setTextSelection(r);
    return !this.editor.state.selection.empty;
  }

  // ---------- 내용 ----------
  getHTML() { return this.editor.isEmpty ? "" : this.editor.getHTML(); }
  setHTML(html: string) { this.editor.commands.setContent(html || "", { emitUpdate: false }); }
  clear() { this.editor.commands.clearContent(false); }
  isEmpty() { return this.editor.isEmpty; }
  onUpdate(cb: UpdateListener) { this.listeners.push(cb); }
  focus() { this.editor.commands.focus(); }
  /** 스크롤을 움직이지 않고 포커스만 (판서/알림 전환 때 화면 위치 유지) */
  focusNoScroll() { this.editor.commands.focus(undefined, { scrollIntoView: false }); }
  hasSelection() { return !this.editor.state.selection.empty || !!this.lastRange; }

  // ---------- 글꼴·크기·색: 선택 영역에만 ----------
  setFontFamily(f: string) { if (!this.restoreRange()) return; this.editor.chain().focus().setFontFamily(f).run(); }
  setFontSize(px: number) { if (!this.restoreRange()) return; this.editor.chain().focus().setFontSize(px + "px").run(); }
  setColor(c: string) {
    // 선택이 없으면(기억한 범위도 없으면) 커서 위치의 저장 마크로 → 이후 입력되는 글자에 적용
    this.restoreRange();
    this.editor.chain().focus().setColor(c).run();
  }
  /** 선택 영역 글자 크기를 delta 만큼 (선택 안의 여러 크기는 각각) */
  adjustSelectionFontSize(delta: number, fallbackPx: number) {
    if (!this.restoreRange()) return;
    const { from, to } = this.editor.state.selection;
    const tr = this.editor.state.tr;
    const markType = this.editor.schema.marks.textStyle;
    let changed = false;
    this.editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize);
      const existing = node.marks.find((m) => m.type === markType);
      const cur = parseInt((existing?.attrs.fontSize as string) || "", 10) || fallbackPx;
      const next = Math.min(150, Math.max(10, cur + delta));
      const attrs = { ...(existing?.attrs ?? {}), fontSize: next + "px" };
      tr.addMark(start, end, markType.create(attrs));
      changed = true;
    });
    if (changed) this.editor.view.dispatch(tr);
    this.editor.commands.focus();
  }

  // ---------- 기본 서식 ----------
  toggleBold() { this.editor.chain().focus().toggleBold().run(); }
  toggleItalic() { this.editor.chain().focus().toggleItalic().run(); }
  toggleUnderline() { this.editor.chain().focus().toggleUnderline().run(); }
  align(a: "left" | "center" | "right") {
    if (this.selectedImage()) this.alignImage(a);
    else this.editor.chain().focus().setTextAlign(a).run();
  }
  undo() { this.editor.chain().focus().undo().run(); }
  redo() { this.editor.chain().focus().redo().run(); }
  insertTable(rows: number, cols: number) {
    this.editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
  }

  // ---------- 사진 ----------
  /** 파일을 최대 1024px, JPEG 0.8 로 줄여 삽입 (v1 과 같은 규칙) */
  insertImageFile(file: File): Promise<void> {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) { alert("이미지 파일만 삽입할 수 있습니다."); resolve(); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > MAX_IMAGE_WIDTH) { h = Math.round((h * MAX_IMAGE_WIDTH) / w); w = MAX_IMAGE_WIDTH; }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          // 처음 크기: 편집 영역 너비의 절반
          const editorW = this.editor.view.dom.clientWidth || 800;
          const width = Math.max(40, Math.min(w, Math.round(editorW * 0.5)));
          const height = Math.round((width * h) / w);
          // 글자를 선택한 상태여도 그 글자를 지우지 않도록 선택 끝에 삽입
          const at = this.editor.state.selection.to;
          this.editor.chain().focus().setTextSelection(at).setImage({ src: dataUrl, alt: "판서 사진", width, height }).run();
          resolve();
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  private selectedImage(): { node: any; pos: number } | null {
    const sel = this.editor.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "image") return { node: sel.node, pos: sel.from };
    return null;
  }
  alignImage(align: "left" | "center" | "right") {
    if (!this.selectedImage()) return;
    this.editor.chain().focus().updateAttributes("image", { align }).run();
  }
  scaleImage(factor: number) {
    const sel = this.selectedImage();
    if (!sel) return;
    const dom = this.editor.view.nodeDOM(sel.pos) as HTMLElement | null;
    const img = dom?.querySelector("img");
    if (!img) return;
    const curW = img.clientWidth || sel.node.attrs.width || 300;
    const curH = img.clientHeight || sel.node.attrs.height || 200;
    const width = Math.max(40, Math.round(curW * factor));
    const height = Math.max(40, Math.round((curH * width) / curW));
    this.editor.chain().focus().updateAttributes("image", { width, height }).run();
    setTimeout(() => this.updateImageToolbar(), 0);
  }
  deleteImage() {
    if (!this.selectedImage()) return;
    this.editor.chain().focus().deleteSelection().run();
  }
  deselect() {
    const { state, view } = this.editor;
    const sel = TextSelection.near(state.doc.resolve(state.selection.to), 1);
    view.dispatch(state.tr.setSelection(sel));
    view.focus();
  }

  /** 선택된 사진 위에 작은 도구 모음 표시 */
  private updateImageToolbar() {
    const tb = this.toolbar;
    if (!tb) return;
    const sel = this.selectedImage();
    if (!sel) { tb.classList.add("hidden"); return; }
    const dom = this.editor.view.nodeDOM(sel.pos) as HTMLElement | null;
    const img = dom?.querySelector("img");
    if (!img) { tb.classList.add("hidden"); return; }
    tb.classList.remove("hidden"); // 보이게 한 뒤에야 offsetParent/크기를 잴 수 있음
    const parent = tb.offsetParent as HTMLElement | null;
    if (!parent) { tb.classList.add("hidden"); return; }
    const r = img.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const c = this.container.getBoundingClientRect();
    let left = r.left + r.width / 2 - tb.offsetWidth / 2 - p.left;
    let top = r.top - p.top - tb.offsetHeight - 8;
    if (top < c.top - p.top + 4) top = Math.min(r.bottom - p.top + 8, c.bottom - p.top - tb.offsetHeight - 4);
    left = Math.max(c.left - p.left + 4, Math.min(left, c.right - p.left - tb.offsetWidth - 4));
    tb.style.left = left + "px";
    tb.style.top = top + "px";
  }
}

export const boardEditor = new BoardEditor();

declare global {
  interface Window { boardEditor: BoardEditor }
}
window.boardEditor = boardEditor;
