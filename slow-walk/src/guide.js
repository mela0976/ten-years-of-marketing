import './guide.css';

const STORAGE_KEY = 'getting-there-guide-v1';
const initialState = () => ({ walked: false, released: false, reply: false, game: false, auto: false });

function readGuide() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const state = initialState();
    for (const key of Object.keys(state)) state[key] = saved?.[key] === true;
    return state;
  } catch {
    return initialState();
  }
}

export function createGuide({ frame, menu, chapterList, hint, stage, replay }) {
  let state = readGuide();
  let distance = 0;
  let releaseUntil = 0;
  let hintTimer = 0;
  let phase = '';
  const bubble = document.createElement('div');
  bubble.className = 'guide-bubble';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-hidden', 'true');
  bubble.innerHTML = '<span class="guide-hand" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><path d="M19 24V9a3 3 0 0 1 6 0v11-4a3 3 0 0 1 6 0v5-2a3 3 0 0 1 6 0v8c0 9-5 15-13 15h-2c-5 0-8-3-11-7l-4-6a3 3 0 0 1 5-4l7 7z"/></svg></span><span class="guide-text"></span>';
  frame.append(bubble);
  const text = bubble.querySelector('.guide-text');
  const hand = bubble.querySelector('.guide-hand');
  const settings = document.createElement('div');
  settings.className = 'guide-settings';
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'guide-menu-button';
  const replayButton = document.createElement('button');
  replayButton.type = 'button';
  replayButton.className = 'guide-menu-button';
  replayButton.textContent = '重看操作說明';
  // 自動走改由標題列的開關控制，選單只留重看操作說明。
  settings.append(replayButton);
  menu.insertBefore(settings, chapterList);

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 無法儲存時仍可在本次旅程使用。 */ }
  }
  function refreshMenu() {
    auto.textContent = '自動走';
    auto.setAttribute('aria-pressed', String(state.auto));
    auto.dataset.state = state.auto ? '開' : '關';
  }
  function toggleAuto() {
    state.auto = !state.auto;
    save();
    refreshMenu();
    return state.auto;
  }
  auto.addEventListener('click', toggleAuto);
  replayButton.addEventListener('click', () => {
    state = initialState();
    distance = 0;
    releaseUntil = 0;
    phase = '';
    save();
    refreshMenu();
    replay();
  });
  refreshMenu();

  function shortHint(message, fallback, expectedPhase) {
    hint.textContent = message;
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      if (phase === expectedPhase && hint.textContent === message) hint.textContent = fallback;
    }, 3500);
  }

  return {
    get auto() { return state.auto; },
    toggleAuto,
    enter(flow, gameType) {
      phase = flow.phase;
      if (flow.chapter !== 1) return;
      if (phase === 'chat' && !state.reply) {
        state.reply = true;
        save();
        shortHint('選一個回覆', '選擇一個回覆。', phase);
      } else if (phase === 'game' && !state.game) {
        state.game = true;
        save();
        refreshMenu();
        const instruction = gameType === 'slider' ? '拖動滑桿' : gameType === 'swipe' ? '左右滑動或選擇' : '選一個答案';
        shortHint(instruction, '完成眼前的小互動。', phase);
      }
    },
    moved(flow, amount) {
      if (flow.chapter !== 1 || state.walked) return;
      distance += Math.max(0, amount);
      if (distance >= 150) { state.walked = true; save(); }
    },
    released(flow, hadMoved) {
      if (flow.chapter !== 1 || state.released || !hadMoved) return;
      state.released = true;
      releaseUntil = performance.now() + 2500;
      save();
    },
    update(flow, chatStop) {
      let message = '';
      let point = null;
      let showHand = false;
      if (!flow.menuOpen && flow.chapter === 1 && (flow.phase === 'walk1' || flow.phase === 'walk2')) {
        if (performance.now() < releaseUntil) {
          message = '放開就停下';
          point = { x: flow.x, y: 395 };
        } else if (flow.phase === 'walk1' && !state.walked) {
          message = window.matchMedia('(pointer: coarse)').matches ? '按住畫面往前走' : '按住 → 往前走';
          point = { x: flow.x, y: 395 };
          showHand = true;
        } else if (flow.phase === 'walk1' && flow.x >= chatStop - 300) {
          message = '快到了';
          point = { x: chatStop + 210, y: 395 };
        }
      }
      bubble.classList.toggle('is-visible', Boolean(point));
      bubble.setAttribute('aria-hidden', String(!point));
      if (!point) return;
      if (text.textContent !== message) text.textContent = message;
      hand.hidden = !showHand;
      const pos = stage.worldToScreen(point.x, point.y);
      const rect = frame.getBoundingClientRect();
      bubble.style.left = `${Math.max(110, Math.min(rect.width - 110, pos.left))}px`;
      bubble.style.top = `${Math.max(70, Math.min(rect.height - 12, pos.top))}px`;
    },
  };
}
