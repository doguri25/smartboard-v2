/**
 * SmartBoard App - Main Process
 * 1. 창의 이전 위치 및 크기 기억 (듀얼 모니터 대응)
 * 2. 작업 표시줄을 가리지 않는 최대화 실행
 */

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// 설정 파일이 저장될 경로 (사용자 앱 데이터 폴더)
const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

function createWindow() {
  // 1. 기본 창 상태 값 정의
  let windowState = {
    width: 1280,
    height: 800,
    x: undefined,
    y: undefined,
    isMaximized: false
  };

  // 2. 저장된 창 상태 데이터 불러오기
  try {
    if (fs.existsSync(stateFilePath)) {
      const data = fs.readFileSync(stateFilePath, 'utf8');
      windowState = JSON.parse(data);
    }
  } catch (err) {
    console.error("창 상태 로드 실패:", err);
  }

  // 3. 브라우저 창 생성
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    show: false, // 창이 준비될 때까지 숨김 (깜빡임 방지)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true // 메뉴바 자동 숨김
  });

  // 4. HTML 파일 로드
  mainWindow.loadFile('index.html');

  // 5. 창 상태 저장 함수 정의
  const saveState = () => {
    const isMaximized = mainWindow.isMaximized();
    // 최대화 상태일 때는 좌표를 업데이트하지 않고 상태값만 저장 (나중에 원복 시 크기 유지를 위해)
    const bounds = mainWindow.getBounds();

    const newState = {
      width: isMaximized ? windowState.width : bounds.width,
      height: isMaximized ? windowState.height : bounds.height,
      x: isMaximized ? windowState.x : bounds.x,
      y: isMaximized ? windowState.y : bounds.y,
      isMaximized: isMaximized
    };

    try {
      fs.writeFileSync(stateFilePath, JSON.stringify(newState));
    } catch (err) {
      console.error("창 상태 저장 실패:", err);
    }
  };

  // 6. 창이 로드 준비가 되었을 때의 처리
  mainWindow.once('ready-to-show', () => {
    if (windowState.isMaximized) {
      mainWindow.maximize(); // 작업 표시줄을 남기고 최대화
    }
    mainWindow.show(); // 설정 완료 후 화면에 표시
  });

  // 7. 창 이벤트 리스너 등록 (상태 변화 기록)
  mainWindow.on('resize', saveState);
  mainWindow.on('move', saveState);
  mainWindow.on('close', saveState);
}

// Electron 준비 완료 시 실행
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 모든 창이 닫혔을 때 종료 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});