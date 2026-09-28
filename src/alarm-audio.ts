// ============================================================
// 알람 소리 (3단계)
//  - "MP3 찾기" 버튼: 파일 선택 창 → Rust 가 data/alarm/ 로 복사 → 파일 이름 저장
//  - 재생: Rust 에서 바이트를 받아 Blob URL 로 만들어 <audio> 에 넘김
//    (앱 폴더에 mp3 를 넣고 이름을 손으로 적던 v1 방식 대체)
// ============================================================
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauri, storage } from "./storage";

const DEFAULT_ALARM_URL = "alarm.mp3"; // public/alarm.mp3
const cache = new Map<string, string>(); // 파일 이름 → Blob URL
const loading = new Map<string, Promise<string>>();

/** data/alarm/<name> 을 읽어 Blob URL 로 캐시 */
export async function preloadAlarm(name: string): Promise<string> {
  if (!name) return DEFAULT_ALARM_URL;
  if (cache.has(name)) return cache.get(name)!;
  if (!isTauri()) return DEFAULT_ALARM_URL;
  if (loading.has(name)) return loading.get(name)!;
  const p = (async () => {
    try {
      const buf = await invoke<ArrayBuffer>("read_alarm_mp3", { name });
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      cache.set(name, url);
      return url;
    } catch (e) {
      console.warn(`알람 파일(${name})을 읽지 못해 기본음을 씁니다:`, e);
      return DEFAULT_ALARM_URL;
    } finally { loading.delete(name); }
  })();
  loading.set(name, p);
  return p;
}

/** 기존 코드(playAlarmMelody)가 동기적으로 부름: 준비된 URL 이 있으면 그것, 없으면 기본음 */
export function getAlarmUrl(name: string): string {
  if (!name) return DEFAULT_ALARM_URL;
  const url = cache.get(name);
  if (url) return url;
  void preloadAlarm(name); // 다음 번을 위해 미리 읽어 둠
  return DEFAULT_ALARM_URL;
}

/** 파일 선택 창을 열어 가져오고, 저장·캐시까지 마친 뒤 파일 이름을 돌려줌 (취소하면 null) */
export async function pickAlarmMp3(): Promise<string | null> {
  if (!isTauri()) { alert("파일 선택은 앱에서만 가능합니다."); return null; }
  const picked = await open({
    multiple: false,
    directory: false,
    title: "알람 소리 파일 선택",
    filters: [{ name: "소리 파일", extensions: ["mp3", "wav", "m4a", "ogg"] }],
  });
  if (!picked || typeof picked !== "string") return null;
  const name = await invoke<string>("import_alarm_mp3", { src: picked });
  cache.delete(name); // 같은 이름으로 다시 골랐을 수 있으니 새로 읽음
  storage.setItem("smartBoardCustomMp3", name);
  await preloadAlarm(name);
  return name;
}
