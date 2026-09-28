# 스마트 전자칠판 v2 (하루이음)

기존 일렉트론 버전(v1.6.11)을 Tauri 2 + Vite + TypeScript로 옮기는 프로젝트입니다.

## 현재 상태: v2.5.2
- 1단계: Tauri 창에서 기존 앱 실행
- 2단계:
  - 인라인 스크립트 → `src/legacy-app.js` 로 분리 (기능 변경 없음)
  - 두 번 정의돼 있던 함수 8개 정리, 일렉트론 전용 코드 제거
  - Tailwind·아이콘을 CDN 대신 앱에 포함 → 인터넷 없이도 화면이 뜸 (폰트는 아직 CDN)
  - 창 크기에 따라 앱 전체가 같은 비율로 줄어들도록 배율 적용 (`src/responsive.css`)
  - '항상 위' 버튼을 Tauri 창 API로 연결
  - 깃허브 액션으로 윈도우 설치 파일(exe) 자동 빌드 (`.github/workflows/build-windows.yml`)
  - 떠 있는 팝업(팝업 노트·타이머·소음 측정기·학습 약속) 드래그 이동, 오른쪽 아래 손잡이로 크기 조절,
    위치·크기 기억 (`src/floating.ts`, `src/floating.css`)
- 3단계:
  - 저장을 localStorage 에서 **파일**로 교체 (`src/storage.ts` ↔ Rust `save_store`)
    - 종류별로 파일을 나눔: settings / board / notice / saved-boards / popup-note
    - 입력 후 0.4초 멈추면 저장, 임시 파일에 쓴 뒤 교체(원자적), 직전 내용은 `.bak` 으로 보관
    - 파일이 깨져 있으면 `.bak` 에서 자동 복구, 창을 닫을 때 저장 안 된 것을 먼저 씀
    - 처음 실행 시 v1(일렉트론) 저장 파일이 있으면 자동으로 가져옴
  - 알림 모드에서 사진·글자 크기·지우기 조작 시 판서가 덮어써지던 버그 수정
  - 알람 소리: 'MP3 찾기' 버튼으로 파일 선택 → 앱 데이터 폴더로 복사 → 기본음/사용자 소리 재생 (`src/alarm-audio.ts`)
- 4단계: 판서 편집기를 TipTap 으로 교체 (`src/board-editor.ts`, `src/board-editor.css`)
  - 글꼴·크기·색이 **선택한 글자에만** 적용됨 (선택이 없으면 판서 전체의 기본 글꼴·크기 변경)
  - 사진: 모서리 손잡이로 크기 조절, 정렬(왼쪽/가운데/오른쪽), ±10%, 드래그 앤 드롭·붙여넣기 삽입
  - 글꼴 파일을 앱에 포함 (주아·나눔고딕·나눔명조·손글씨·감자꽃) → 오프라인에서도 같은 모양
  - 메이플스토리체 추가: 넥슨 배포 파일 2개를 `public/fonts/` 에 넣으면 적용 (README.txt 참고)
  - 되돌리기(Ctrl+Z), 굵게(Ctrl+B), 기울임(Ctrl+I), 밑줄(Ctrl+U), 표(열 너비 드래그 조절), 목록("1. ", "- " 입력)
- 5단계:
  - 날씨를 **기상청 단기예보 + 에어코리아**(공공데이터포털, 국내 서버)로 교체 (`src/weather.ts`, `src/regions.ts`)
    - 지역은 시/도 → 시/군/구 선택(전국 229곳 내장), 기상청 격자 좌표는 자동 계산
    - 날씨 창 ⚙ 에 공공데이터포털 인증키를 한 번 넣으면 됨 (아래 "API 키 준비" 참고)
  - 유튜브 **앱 안 검색 + 바로 재생** (`src/youtube.ts`): 검색 결과 12개를 썸네일로 보여주고 누르면 재생.
    주소 붙여넣기는 키 없이 재생. 검색은 유튜브 창 🔑 에 YouTube Data API 키 필요
  - 외부 API 는 Tauri http 플러그인으로 호출(브라우저 CORS 제약 없음). 허용 주소는 `src-tauri/capabilities/default.json`
- 6단계:
  - 앱이 다른 창 밑에 있거나 최소화돼도 타이머·알람이 정확히 울림 (`src/host.ts`, `src-tauri/src/lib.rs`)
    - 웹뷰의 setInterval 은 창이 가려지면 브라우저가 느리게 돌려서 생기던 문제. 시계를 Rust 스레드가 1초마다 보내는 이벤트로 돌림
    - 타이머는 남은 초를 세지 않고 '종료 시각'에서 계산 → tick 이 늦어도 실제 시간과 일치
    - 절전 등으로 몇 분이 통째로 빠져도, 그 사이 시각의 알람을 순서대로 울림(최대 10분)
    - 알람 팝업이 뜰 때 창을 앞으로 가져옴
  - 가로 메뉴에 팅커벨·아이스크림 버튼 추가. 누르면 기본 브라우저가 아닌 **앱 자체 창(최대화)** 으로 열림
    (사이트가 iframe 삽입을 막는 경우가 많아 별도 창을 씀. 로그인은 앱과 같은 프로필에 유지됨). 도구 설정에서 숨길 수 있음
- v2.1.0:
  - **디자인 테마 5종** (`src/skins.css`, `src/skins.ts`): 밝은 기본·다크·칠판·파스텔·종이 노트. 환경설정 → 디자인 테마.
    회색 계열 색·모서리·그림자를 전부 CSS 변수로 묶고 `tailwind.config.js` 에서 연결. 강조색·바탕색·판넬색 설정은 그 위에 덧입혀짐
  - **가로 도구 메뉴 자동 맞춤** (`src/fit.ts`): 버튼 전체 너비가 남은 공간보다 크면 비율로 줄이고, 여유가 있으면 1.25배까지 키움
  - **자동 업데이트** (`src/updater.ts`, Rust `check_update`/`install_update`): 아래 "자동 업데이트 운영" 참고
  - **버전 정보 자동화** (`src/version.ts`, `src/changelog.json`): 로고를 누르면 현재 버전과 변경 이력이 자동 표시.
    새 버전은 `node scripts/bump.mjs 2.3.0 "제목" "변경1" "변경2"` 로 올림 (package.json·tauri.conf.json·Cargo.toml·changelog 동시 갱신)
- v2.2.0:
  - 학습 약속 팝업도 크기 조절 (`src/floating.ts` — scale 모드)
  - 열고 닫는 효과·클릭 효과 (`src/motion.ts`, `src/motion.css`): 모달·떠 있는 창이 macOS 처럼 살짝 커지며 열리고 작아지며 닫힘.
    기존 코드가 `.active/.hidden` 을 바로 바꾸므로 MutationObserver 로 닫히는 순간을 잡아 `.closing` 을 잠깐 붙임. 버튼은 눌림(scale)+물결(ripple)
  - 디자인 다듬기 (`src/polish.css`): 유리 느낌 머리글, 도구 버튼 하이라이트, 시간표 현재 교시 강조, 떠 있는 창 손잡이 표시, 입력칸 초점 링
  - 판서 글꼴 변경 버그: 드래그 선택 뒤 글꼴 상자를 누르면 브라우저가 선택을 푸는 경우가 있어, 마지막 선택 범위를 기억해 두었다가 적용 (`src/board-editor.ts` lastRange)
- v2.2.1:
  - **창 닫기 버그 수정**: 닫기 전에 저장을 마치려고 close 를 가로챈 뒤 `destroy()` 로 닫는데, `core:window:allow-destroy` 권한이 빠져 있어
    X 버튼이 듣지 않았음 (`src-tauri/capabilities/default.json`, `src/main.ts`). 저장이 3초 넘게 걸려도 닫히도록 함
  - 학습 약속 묶음 상자의 테두리·그림자 제거 (안의 알약에만 적용)
  - 머리글 테마 연동: `--sk-header-*` 변수 (`src/skins.css`) 를 `src/polish.css` 에서 사용
  - 테마 추가: 오션(진한 바다색 다크), 모노(흑백 미니멀·평면 버튼), 라벤더(연보라), 그라파이트(흑연색 다크) — 총 9종
- v2.2.2:
  - 판서 도구 모음 둘레의 검정/흰 선 제거: 색 없이 `border` 만 쓴 곳의 기본 테두리색(DEFAULT)이 테마 매핑에서 빠져
    currentColor 로 그려지던 것 (`tailwind.config.js` borderColor.DEFAULT → `--sk-line`)
  - 테마 추가: 선셋(복숭아·코랄 그라데이션) — 총 10종
- v2.2.3: 학습 약속 팝업은 아래·왼쪽이 고정된 채 위로 자라므로 손잡이를 오른쪽 위로 옮기고, 가로·세로 끈 거리의 평균으로 배율 계산 (`src/floating.ts`)
- v2.3.0:
  - 급식 알레르기 표시 (`src/lunch.ts`): NEIS 식단의 "(1.2.5.)" 번호를 읽어, 급식 창 ⚠ 에서 체크한 재료가 든 메뉴를 붉게 + 재료 배지로 표시.
    체크하지 않은 번호는 숨김. 저장 키 `smartBoardAllergens`
  - 급식·학교 검색을 Tauri http 플러그인 경유로 전환 (허용 주소에 open.neis.go.kr 추가)
  - 시간표 제목 `whitespace-nowrap` + 볼륨 슬라이더가 줄어들 수 있게, 교시/시간/과목 글자 한 단계 키움
- v2.4.0:
  - 날씨 3일 예보 (`src/weather.ts` daily): 단기예보에서 날짜별 TMX/TMN·대표 하늘·가장 심한 강수형태·최대 강수확률
  - 유튜브를 모달에서 떠 있는 창(`#floating-youtube`, box 모드)으로 전환. 처음엔 화면 가운데(`centerFirst`), 이후 위치·크기 기억
  - 판서 ↔ 알림 전환 효과(`sb-mode-out/in`) + 모드별 스크롤 위치 저장(`smartBoardScroll_board/notice`), 포커스는 스크롤 없이(`focusNoScroll`)
  - 도구 메뉴 컨테이너 `overflow-hidden`, 최소 배율 0.3, 여유 8px — 가로 스크롤바가 생기지 않음
  - 버전 이력 최근 5개 + 더보기 (`src/version.ts`)
  - 버그 수정: 떠 있는 창 감시자 안에서 class 를 매번 건드려 무한 반복(CPU 100%)에 빠지던 문제 — 감시 전에 한 번만 정리
- v2.5.0:
  - 유튜브 검색 결과 제목이 잘리던 문제 (`src/youtube.ts`): 결과 그리드가 높이가 정해진 상자 안에 바로 들어 있어
    CSS 그리드가 행을 상자 높이에 맞춰 눌렀고, 카드가 `overflow-hidden` 이라 썸네일 아래 제목이 잘렸음.
    스크롤 상자 안에 별도 그리드(`#youtube-results-grid`)를 두고 카드를 `<div role="button">` 으로 바꿔 내용 높이대로 표시
  - 커서 물결 (`src/motion.ts` cursorRipple, `src/motion.css` `.sb-cursor-ripple`): 버튼이 아니어도 화면 어디를 누르든
    누른 지점에 테마 강조색 원이 퍼짐. 맨 위 고정 층(`#sb-click-fx`, pointer-events 없음)에 그리므로 어떤 창 위에서도 보임. 터치는 조금 더 크게
  - **로그인 기억** (`src-tauri/src/lib.rs` enable_login_memory):
    - 메인 창과 사이트 창(팅커벨·아이스크림·유튜브)은 같은 WebView2 프로필(`%LOCALAPPDATA%\com.doguri.smartboard\EBWebView`)을 쓰므로
      쿠키(로그인 상태)가 앱을 껐다 켜도 남음. 사이트에서 "로그인 유지/자동 로그인"을 켜면 다음 실행 때 바로 로그인된 상태
    - WebView2 의 비밀번호 저장·자동 채우기(`IsPasswordAutosaveEnabled`, `IsGeneralAutofillEnabled`)는 기본이 꺼져 있어 켜 줌.
      엣지처럼 로그인할 때 "비밀번호 저장" 안내가 뜨고, 다음에는 아이디·비밀번호가 자동으로 채워짐 (Windows DPAPI 로 암호화 저장, 앱은 비밀번호를 보관하지 않음)
    - 유튜브 플레이어 머리글에 '유튜브 로그인' 버튼: youtube.com 을 앱 창으로 열어 로그인하면 같은 프로필이라 플레이어(임베드)에도 적용
    - Windows 전용 의존성 `webview2-com`, `windows-core` (`src-tauri/Cargo.toml`, tauri 와 같은 버전)
- v2.5.1: 학습 약속 팝업의 크기 조절 손잡이를 다른 창처럼 오른쪽 아래로 (`src/floating.ts` attachResize).
  이 창은 아래·왼쪽 기준으로 놓이므로, 조절하는 동안만 위·왼쪽 고정(`top`/`transform-origin: top left`)으로 바꿔 끄는 방향으로 커지게 하고,
  놓으면 보이는 위치 그대로 `bottom` 값으로 환산해 저장 (`.sb-resize-grip-top` 제거)
- v2.5.2 (지금): 깃허브 자동 업데이트 연결 — 저장소 https://github.com/doguri25/smartboard-v2
  - 앱의 업데이트 주소 기본값을 `https://github.com/doguri25/smartboard-v2/releases/latest/download/latest.json` 으로 내장 (`src/updater.ts` DEFAULT_UPDATE_URL).
    환경설정의 주소 칸은 비워 두면 기본값을 씀
  - `.github/workflows/build-windows.yml`: main 에 push 된 버전의 릴리스가 없으면 윈도우 러너에서 빌드 → 릴리스 생성 → setup.exe / .sig / latest.json 게시 (tauri-action).
    릴리스 본문은 `scripts/release-notes.mjs` 가 changelog 에서 만듦

## 개발 PC 준비 (macOS, 한 번만)
```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh   # 질문에는 Enter
```
Rust 설치 후 터미널을 껐다 켭니다. Node.js는 nodejs.org에서 LTS 설치.

## 실행
```bash
npm install
npm run tauri dev
```

## 자동 업데이트 운영 (깃허브 릴리스)
저장소: https://github.com/doguri25/smartboard-v2 (공개 — 앱이 로그인 없이 latest.json 을 받아야 함)

준비 (한 번만): 저장소 Settings → Secrets and variables → Actions → New repository secret →
이름 `TAURI_SIGNING_PRIVATE_KEY`, 값은 `src-tauri/updater.key` 파일 내용 전체. (키 파일은 절대 저장소에 올리지 말 것 — .gitignore 에 제외돼 있음)

새 버전 내는 순서:
```
node scripts/bump.mjs 2.6.0 "제목" "변경 사항 1" "변경 사항 2"
git add -A && git commit -m "v2.6.0" && git push
```
main 에 올라온 버전의 릴리스가 아직 없으면 워크플로가 알아서 빌드해 `v2.6.0` 릴리스를 만듭니다(이미 있는 버전이면 건너뜀).
몇 분 뒤 Releases 에 `SmartBoard_2.6.0_x64-setup.exe`, `.sig`, `latest.json` 이 올라가고,
설치된 앱은 시작할 때(그리고 6시간마다) 확인해 안내 띠를 띄움 → [지금 업데이트] → 내려받기 → 설치 → 재시작.
로고를 눌러 나오는 버전 창의 [업데이트 확인] 으로 바로 확인할 수도 있음.
Actions 탭에서 "Run workflow" 로 태그 없이 수동 실행도 가능(현재 package.json 버전으로 릴리스).

수동 배포(깃허브 액션 없이 직접 빌드한 경우): `node scripts/make-latest-json.mjs` 로 latest.json 을 만들고
setup.exe · .sig · latest.json 세 파일을 해당 버전 릴리스에 올리면 됨.

## 윈도우 설치 파일
- `SmartBoard_2.4.0_x64-setup.exe` — 설치 파일. 두 번 클릭 → 설치 → 시작 메뉴/바탕화면의 "SmartBoard" 실행.
  관리자 권한 없이 현재 사용자 계정에 설치됩니다. 처음 실행 때 v1(일렉트론)의 시간표·설정을 자동으로 가져옵니다.
- 서명이 없는 파일이라 Windows SmartScreen 경고("Windows의 PC 보호")가 뜰 수 있습니다.
  **추가 정보 → 실행** 을 누르면 됩니다.
- 이 파일은 리눅스에서 `x86_64-pc-windows-gnu` 타깃으로 크로스 컴파일해 만든 것입니다
  (`src-tauri/.cargo/config.toml`, `src-tauri/tauri.cross.conf.json` 이 그 설정). 일반 개발 PC 에서는 아래 깃허브 액션이 더 쉽습니다.

## 윈도우 설치 파일 만들기 (깃허브 액션)
맥에서는 윈도우 exe를 만들 수 없어서 깃허브 서버에서 빌드합니다.
1. 이 폴더에서 처음 한 번:
   ```bash
   git init
   git add .
   git commit -m "v2 2단계: Tauri 이전, 코드 분리, 반응형 배율"
   ```
2. github.com → New repository → 이름 `smartboard-v2` (Private 추천) → Create
3. 화면에 나오는 안내대로:
   ```bash
   git remote add origin https://github.com/<내계정>/smartboard-v2.git
   git branch -M main
   git push -u origin main
   ```
4. 저장소 → **Actions** 탭 → 왼쪽 "Windows 설치 파일 빌드" → **Run workflow**
5. 10~15분 뒤 완료되면 실행 페이지 하단 **Artifacts** 에서 `SmartBoard-windows-installer` 다운로드
   (압축을 풀면 `SmartBoard_2.0.0_x64-setup.exe` 가 나옵니다)

이후에는 코드를 고치고 `git add . && git commit -m "..." && git push` 한 뒤 4~5번만 반복하면 됩니다.

## API 키 준비 (한 번만)
**공공데이터포털 (날씨·미세먼지)** — data.go.kr
1. 회원가입 → 로그인
2. 검색창에 "기상청_단기예보" → `기상청_단기예보 ((구)_동네예보) 조회서비스` → 활용신청 (자동 승인)
3. 검색창에 "에어코리아 대기오염정보" → `한국환경공단_에어코리아_대기오염정보` → 활용신청
4. 마이페이지 → 인증키 발급현황 → **일반 인증키(Encoding 또는 Decoding, 아무거나)** 복사
5. 앱의 날씨 창 → ⚙ → 지역 선택 + 인증키 붙여넣기 → 저장
   (신청 직후에는 키가 아직 안 먹을 수 있어요. 최대 1시간 정도 걸립니다)

**YouTube Data API (검색용, 선택)** — console.cloud.google.com
1. 프로젝트 만들기 → "API 및 서비스" → 라이브러리 → `YouTube Data API v3` 사용 설정
2. 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키 → 복사
3. 앱의 유튜브 창 → 🔑 → 붙여넣기 → 저장
- 무료 할당량으로 하루 약 100회 검색. 주소 붙여넣기 재생은 키와 무관.

## 데이터 파일 위치
- Windows: `%APPDATA%\com.doguri.smartboard\data\`
- macOS: `~/Library/Application Support/com.doguri.smartboard/data/`
- 안에 `settings.json`, `board.json`, `notice.json`, `saved-boards.json`, `popup-note.json` 과 각각의 `.bak`,
  그리고 `alarm/` 폴더(선택한 알람 소리)가 생깁니다. 이 폴더를 통째로 복사하면 다른 PC로 옮길 수 있습니다.

## 알아둘 점
- 판서 안의 사진은 HTML 안에 base64(최대 1024px, JPEG) 로 들어갑니다. 파일 저장이라 용량 제한은 없습니다.
- v1 에서 만든 판서는 그대로 불러오지만, 예전 방식(`<font>` 태그)으로 넣은 글자색은 유지되지 않을 수 있습니다.
- `npm run dev` 로 브라우저에서만 열면 파일 대신 localStorage 를 씁니다(테스트용).
- 소음측정기(마이크)는 macOS에서 권한 설정을 추가로 해야 해서 아직 동작하지 않습니다.
- 로그인 기억은 사이트가 세션 쿠키만 쓰면(로그인 유지 옵션이 없으면) 앱을 껐다 켰을 때 다시 로그인해야 하지만,
  아이디·비밀번호는 자동으로 채워져 있으니 로그인 버튼만 누르면 됩니다. 저장된 비밀번호는 WebView2 프로필 폴더를 지우면 함께 지워집니다.
- `legacy/` 는 v1 원본 보관용입니다. 빌드에 포함되지 않습니다.

## 폴더
```
index.html               화면 (HTML만 남음)
src/main.ts              TypeScript 진입점: 아이콘, Tauri 창 API, 화면 배율
src/legacy-app.js        v1 기능 코드 전체 (다음 단계에서 모듈로 분리)
src/responsive.css       창 크기에 따른 배율 규칙
src/floating.ts/.css     떠 있는 팝업 드래그·크기조절·위치 기억
src/storage.ts           저장소 (메모리 캐시 + 파일 저장, 버킷 분리)
src/alarm-audio.ts       알람 소리 선택·재생
src/board-editor.ts/.css 판서 편집기 (TipTap): 선택 서식, 사진 크기·정렬, 표
src/weather.ts           기상청·에어코리아 날씨 (지역·인증키 설정 포함)
src/regions.ts           전국 시/군/구 좌표표 + 기상청 격자 변환
src/youtube.ts           유튜브 검색·재생
src/lunch.ts             급식 식단·학교 검색·알레르기 표시
src/net.ts               외부 API 호출 도우미 (Tauri http 플러그인)
src/host.ts              1초 tick·창 앞으로·사이트 창 열기 (Tauri 창 API)
src/skins.ts/.css        디자인 테마 (변수 정의·적용·설정 카드)
src/fit.ts               가로 도구 메뉴 너비 맞춤
src/updater.ts           자동 업데이트 확인·설치 UI
src/version.ts           버전 정보 창 (changelog.json)
src/motion.ts/.css       열고 닫는 효과·클릭 효과
src/polish.css           디자인 다듬기
scripts/bump.mjs         버전 올리기
scripts/make-latest-json.mjs  업데이트용 latest.json 만들기
public/fonts/            메이플스토리체 파일을 넣는 곳
src-tauri/src/lib.rs     Rust 명령: 파일 저장/읽기, MP3 가져오기, v1 데이터 가져오기
src/tailwind.css         Tailwind 진입 파일 (설정은 tailwind.config.js)
public/alarm.mp3         기본 알람음
legacy/                  v1 원본 보관
src-tauri/               Rust/Tauri 설정 (tauri.conf.json, 권한, 아이콘)
.github/workflows/       윈도우 exe 자동 빌드
app-icon.png             아이콘 원본 (1024x1024)
```
