// ============================================================
// 외부 API 호출 도우미
// Tauri 안에서는 plugin-http(Rust 쪽에서 요청 → CORS 제약 없음)를,
// 그냥 브라우저에서는 window.fetch 를 씁니다.
// 허용 주소는 src-tauri/capabilities/default.json 의 http 범위에 있어야 합니다.
// ============================================================
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauri } from "./storage";

export class HttpError extends Error {
  constructor(public status: number, message: string, public body = "") { super(message); }
}

export async function httpGetText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const f = isTauri() ? tauriFetch : window.fetch.bind(window);
    const res = await f(url, { method: "GET", signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`, text);
    return text;
  } finally { window.clearTimeout(t); }
}

/** JSON 으로 파싱. data.go.kr 은 키 오류 때 XML 을 돌려주므로 그 경우 읽기 쉬운 메시지로 바꿈 */
export async function httpGetJson<T = any>(url: string): Promise<T> {
  const text = await httpGetText(url);
  try { return JSON.parse(text) as T; }
  catch {
    const m = /<returnAuthMsg>([^<]*)<\/returnAuthMsg>|<returnReasonCode>([^<]*)<\/returnReasonCode>|<errMsg>([^<]*)<\/errMsg>/.exec(text);
    throw new Error(m ? `API 오류: ${m[1] || m[3] || "코드 " + m[2]}` : "응답을 해석할 수 없습니다: " + text.slice(0, 80));
  }
}
