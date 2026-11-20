import content from '../content/content.js';
// 題目情境另存，和 game3d 共用的原稿維持一致。
import chapterContext from '../content/context.js';
import { chapters as chapterArt } from './chapters/index.js';
import { getRunTotals, multiIsCorrect, personaId, sliderIsCorrect, stopIsCorrect, swipeScoreIsCorrect } from './logic.js';
// 路上小問：只接流程與內容掛勾，沿用既有面板。
import { createFlowState, createProgress, getWalkTarget, transitionFlow } from './flow.js';
import { getRevealMessages, renderAnswerList, renderQuiz } from './quiz.js';
import { AudioManager } from './audio.js';
import { StageRenderer } from './stage.js';
import { createGuide } from './guide.js';
import './style.css';
// 全螢幕舞台與閱讀面板共用的版面樣式，集中在既有元件樣式之後。
import './viewport.css';

const PROGRESS_KEY = 'getting-there-progress-v1';
const WALK_SPEED = 80;
// 只在 ?debug=1 時生效的走路倍速，給驗收腳本用。
const DEBUG_PARAMS = new URLSearchParams(window.location.search);
const DEBUG_SPEED = DEBUG_PARAMS.get('debug') === '1' ? Math.min(20, Math.max(1, Number(DEBUG_PARAMS.get('speed')) || 1)) : 1;
const FOOTSTEP_DISTANCE = 36;

const ui = Object.fromEntries([
  'title-screen', 'intro-text', 'start-button', 'game-screen', 'stage-frame', 'stage-host', 'stage-fallback',
  'chapter-year', 'chapter-title', 'progress', 'auto-button', 'mute-button', 'menu-button', 'scene-caption', 'world-prompt',
  'story-panel', 'story-content', 'hint', 'chapter-menu', 'close-menu', 'chapter-list',
].map((id) => [id, document.getElementById(id)]));

function readSavedProgress() {
  try {
    return createProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return createProgress();
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // The active journey remains playable when browser storage is unavailable.
  }
}

function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem('getting-there-muted-v1');
  } catch {
    // Starting over still resets the in-memory run.
  }
}

function element(tag, className = '', text = undefined) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function makeButton(text, className, action, options = {}) {
  const node = element('button', className, text);
  node.type = 'button';
  if (options.disabled) node.disabled = true;
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.pressed !== undefined) node.setAttribute('aria-pressed', String(options.pressed));
  if (options['data-primary']) node.dataset.primary = 'true';
  node.addEventListener('click', action);
  return node;
}

function setChildren(target, children) {
  target.replaceChildren(...children.filter(Boolean));
}

function currentContent() {
  return content.chapters[flow.chapter - 1];
}

function currentArt() {
  return chapterArt[flow.chapter - 1];
}

let saved = readSavedProgress();
let audio = new AudioManager(saved.muted);
let flow = createFlowState({ ...saved, muted: audio.muted });
const stage = new StageRenderer(ui['stage-host'], ui['stage-fallback'], ui['story-panel']);
// 引導自行管理顯示與設定，沿用既有章節選擇和移動流程。
const guide = createGuide({
  frame: ui['stage-frame'], menu: ui['chapter-menu'], chapterList: ui['chapter-list'], hint: ui.hint, stage,
  replay: () => {
    dispatch({ type: 'SELECT_CHAPTER', chapter: 1 });
    ui['chapter-menu'].close();
  },
});
let activeStageChapter = null;
let heldPointerId = null;
const heldKeys = new Set();
let moving = false;
let manualStartX = null;
let lastFrame = 0;
let elapsedSeconds = 0;
let lastFootstepX = 640;
let confirmIgnoreUntil = 0;
let departTimer = 0;
let departRemaining = 0;
let departDeadline = 0;
let personaPage = 0;
let pendingKindness = null;
const completedKindness = new Set();
let stopGame = null;
let swipePointer = null;
let swipeChoices = [];

function setHint(text) {
  ui.hint.textContent = text;
}

function focusFirstAction() {
  const target = ui['story-content'].querySelector('[data-primary="true"], button:not(:disabled), input');
  target?.focus({ preventScroll: true });
}

function scheduleFocus(expectedRevision = flow.revision) {
  requestAnimationFrame(() => {
    if (flow.revision === expectedRevision) focusFirstAction();
  });
}

function renderProgress() {
  const list = element('ol', 'progress-list');
  for (const chapter of content.chapters) {
    const item = element('li', 'progress-step');
    if (chapter.year === currentContent().year) item.classList.add('is-current');
    if (flow.progress.results[String(chapter.year - 2017)]) item.classList.add('is-complete');
    const marker = element('span', 'progress-marker');
    marker.setAttribute('aria-label', `${chapter.year} 年${chapter.title}${item.classList.contains('is-current') ? '，目前章節' : ''}${item.classList.contains('is-complete') ? '，已完成' : ''}`);
    marker.setAttribute('role', 'img');
    item.append(marker);
    list.append(item);
  }
  ui.progress.replaceChildren(list);
}

function updateHeader() {
  const chapter = currentContent();
  ui['chapter-year'].textContent = String(chapter.year);
  ui['chapter-title'].textContent = chapter.title;
  renderProgress();
  ui['auto-button'].setAttribute('aria-pressed', String(guide.auto));
  ui['auto-button'].classList.toggle('is-on', guide.auto);
  ui['mute-button'].textContent = flow.progress.muted ? '開啟聲音' : '靜音';
  ui['mute-button'].setAttribute('aria-pressed', String(flow.progress.muted));
  ui['mute-button'].setAttribute('aria-label', flow.progress.muted ? '開啟聲音' : '靜音');
  ui['scene-caption'].textContent = chapter.title;
}

function renderTitle() {
  ui['title-screen'].hidden = false;
  ui['game-screen'].hidden = true;
  ui['start-button'].textContent = flow.progress.farthest > 1 || Object.keys(flow.progress.results).length
    ? `從第 ${flow.progress.resume} 章繼續`
    : '開始旅程';
  ui['intro-text'].textContent = content.intro;
}

function renderChapterCard(target) {
  const chapter = currentContent();
  const copy = element('div', 'chapter-card-copy');
  copy.append(element('p', 'eyebrow', String(chapter.year)));
  copy.append(element('h2', 'chapter-card-title', chapter.title));
  copy.append(element('p', 'chapter-card-description', '準備好就出發。'));
  copy.append(makeButton('出發', 'primary-button', () => dispatch({ type: 'CARD_DONE' }), { ariaLabel: `開始 ${chapter.year} 年，${chapter.title}` }));
  target.append(copy);
}

function renderWalk(target) {
  const text = flow.phase === 'walk1' ? '街道慢慢向前展開。' : '沿著路繼續走。';
  target.append(element('p', 'story-line walk-copy', text));
}

const NO_STANDARD_ANSWER = '這題沒有標準答案';
let chatChoice = null;

function renderChat(target) {
  const chapter = currentContent();
  const revision = flow.revision;
  // 回覆留在面板上，讀完才把選擇交回原本的章節流程。
  if (chatChoice !== null) {
    const index = chatChoice;
    target.append(element('p', 'verdict', NO_STANDARD_ANSWER));
    target.append(lineWithUnit('你的回覆', chapter.chat.replies[index].text));
    target.append(element('p', 'reveal-text', chapter.takeaway));
    target.append(makeButton('繼續走', 'primary-button', () => {
      if (performance.now() >= confirmIgnoreUntil) dispatch({ type: 'REPLY', index, revision });
    }, { 'data-primary': true }));
    return;
  }

  const message = element('article', 'message-card');
  message.append(element('p', 'message-from', chapter.chat.from));
  message.append(element('p', 'message-text', chapter.chat.text));
  target.append(message);
  const choices = element('div', 'reply-grid');
  chapter.chat.replies.forEach((reply, index) => {
    const button = makeButton(reply.text, 'choice-card reply-card', () => chooseChatReply(index, revision));
    button.dataset.replyIndex = String(index);
    button.setAttribute('aria-label', `回覆 ${index + 1}：${reply.text}`);
    choices.append(button);
  });
  target.append(choices);
}

function chooseChatReply(index, revision = flow.revision) {
  if (flow.phase !== 'chat' || flow.menuOpen || flow.revision !== revision || chatChoice !== null
    || performance.now() < confirmIgnoreUntil || !currentContent().chat.replies[index]) return;
  chatChoice = index;
  confirmIgnoreUntil = performance.now() + 300;
  ui['story-panel'].scrollTop = 0;
  render();
  scheduleFocus(revision);
  audio.playNote('interact');
}

// 路上小問玩家選了哪一個，只用來在揭曉時標示，不進流程狀態與存檔。
let lastQuizChoice = null;

function lineWithUnit(label, value, unit = '') {
  const row = element('p', 'result-value');
  row.append(element('span', 'result-label', label));
  row.append(element('strong', 'result-number', `${value}${unit}`));
  return row;
}

function renderRevealMarks(target, chapter) {
  const game = chapter.game;
  const { input } = flow.pending;

  // 正解和玩家選擇各自有文字標示，同一格可同時成立。
  if (game.type === 'pick') {
    renderAnswerList(target, game.options, { answers: [game.answer], selected: [input.choice] });
  } else if (game.type === 'slider') {
    const comparison = element('div', 'result-comparison');
    comparison.append(lineWithUnit('你的猜測', input.guess, game.unit));
    comparison.append(lineWithUnit('正解', game.answer, game.unit));
    const low = Math.max(game.min, game.answer - game.tolerance);
    const high = Math.min(game.max, game.answer + game.tolerance);
    const unit = game.unit === '%' ? '%' : ` ${game.unit}`;
    target.append(comparison, element('p', 'reveal-note', `容許範圍 ${low}～${high}${unit}`));
  } else if (game.type === 'swipe') {
    const cards = element('div', 'revealed-swipe-list');
    game.cards.forEach((text, index) => {
      const line = element('div', 'revealed-swipe-card');
      line.append(element('span', 'revealed-card-text', text));
      if (game.scored) line.append(element('strong', 'revealed-card-side', `正解：${game[game.answers[index]]}`));
      line.append(element('span', 'answer-mark is-mine', `你選的：${game[input.choices[index]]}`));
      cards.append(line);
    });
    target.append(cards);
  } else if (game.type === 'multi') {
    renderAnswerList(target, game.options, { answers: game.answers, selected: input.selected });
  } else if (game.type === 'stop') {
    const comparison = element('div', 'result-comparison');
    comparison.append(lineWithUnit('你的選擇', input.stopped ? `第 ${input.tick} 格按停` : '沒有按停'));
    comparison.append(lineWithUnit('正解', `第 1～${game.goodUntilTick} 格按停`));
    target.append(comparison);
  } else if (game.type === 'agent') {
    renderAnswerList(target, game.options, { answers: [game.agentPick], selected: [input.choice], answerLabel: 'AI 選的' });
  }
}

function renderReveal(target) {
  const chapter = currentContent();
  const { correct, input } = flow.pending;
  // 結論、選擇與原因放在同一張面板，按停題也不拆成兩頁。
  const verdictClass = correct === null ? 'verdict' : `verdict ${correct ? 'is-right' : 'is-wrong'}`;
  const verdict = correct === null ? NO_STANDARD_ANSWER : correct ? '答對了' : '沒猜中';
  target.append(element('p', verdictClass, verdict));
  renderRevealMarks(target, chapter);
  for (const message of getRevealMessages(chapter.game, input)) target.append(element('p', 'reveal-text', message));
  const revision = flow.revision;
  target.append(makeButton('看下一站', 'primary-button', () => dispatch({ type: 'CONTINUE_REVEAL', revision }), { 'data-primary': true }));
}

function renderTakeaway(target) {
  const chapter = currentContent();
  target.append(element('p', 'takeaway-text', chapter.takeaway));
  target.append(element('p', 'source-line', `${chapter.book}　${chapter.source}`));
  target.append(makeButton('繼續', 'primary-button', () => dispatch({ type: 'CONTINUE_TAKEAWAY' }), { 'data-primary': true }));
}

function renderDepart(target) {
  target.append(element('p', 'depart-text', `搭上${currentArt().vehicle}，離開這一站。`));
  target.append(makeButton('繼續旅程', 'primary-button', () => dispatch({ type: 'DEPART_DONE' }), { 'data-primary': true }));
}

function calculatePersona() {
  const results = content.chapters.map((chapter, index) => {
    const result = flow.progress.results[String(index + 1)] ?? {};
    return {
      lean: result.lean ?? 'brand',
      perf: result.perf ?? 0,
      scored: chapter.game?.scored === true,
      correct: result.correct ?? null,
    };
  });
  const totals = getRunTotals(results);
  const id = personaId(totals.score, totals.perf);
  return { totals, persona: content.personas.find((entry) => entry.id === id) ?? content.personas.at(-1), results };
}

function renderPersona(target) {
  const { totals, persona, results } = calculatePersona();
  const page = element('div', 'persona-page');
  page.append(element('p', 'eyebrow', personaPage === 0 ? '十年足跡' : '走過的路'));
  if (personaPage === 0) {
    page.append(element('h2', 'persona-name', persona.name));
    page.append(element('p', 'persona-strength', persona.strength));
    page.append(element('p', 'persona-blind', persona.blind));
    page.append(element('p', 'score-line', `識破 ${totals.score} / 7`));
    const axis = element('div', 'persona-axis');
    axis.append(element('span', '', '績效'));
    const track = element('div', 'axis-track');
    const marker = element('span', 'axis-marker');
    const position = Math.max(0, Math.min(100, (1 - totals.perf / 10) * 100));
    marker.style.left = `${position}%`;
    marker.setAttribute('aria-label', `績效權重 ${totals.perf.toFixed(1)}，位於橫軸 ${Math.round(position)}%`);
    track.append(marker);
    axis.append(track, element('span', '', '品牌'));
    page.append(axis);
    page.append(element('p', 'read-line', `先讀這篇：${persona.read}`));
    page.append(makeButton('下一頁', 'primary-button', () => { personaPage = 1; render(); }, { 'data-primary': true }));
  } else {
    page.append(element('h2', 'recap-heading', '十年回顧'));
    // 小問成績只顯示於回顧，不傳入 calculatePersona 的人格計算。
    const quizCorrect = content.chapters.filter((_, index) => flow.progress.results[index + 1]?.quiz === true).length;
    page.append(element('p', 'score-line', `路上小問 答對 ${quizCorrect} / 10`));
    const recap = element('div', 'recap-grid');
    content.chapters.forEach((chapter, index) => {
      const result = results[index];
      const art = chapterArt[index];
      const cell = element('div', 'recap-cell');
      cell.style.setProperty('--recap-sky', art.palette.sky);
      cell.style.setProperty('--recap-warm', art.palette.warm);
      cell.setAttribute('aria-label', `${chapter.year} ${chapter.title}，${result.lean === 'perf' ? '績效方向' : '品牌方向'}，${result.scored ? (result.correct ? '答對' : '答錯') : '不計分'}`);
      const thumb = element('span', 'recap-thumb');
      const label = element('span', 'recap-year', String(chapter.year));
      const lean = element('span', `recap-lean ${result.lean === 'perf' ? 'leans-perf' : 'leans-brand'}`);
      const outcome = element('span', `recap-result ${!result.scored ? 'is-unscored' : result.correct ? 'is-correct' : 'is-wrong'}`);
      outcome.textContent = !result.scored ? '•' : result.correct ? '●' : '○';
      cell.append(thumb, label, lean, outcome);
      recap.append(cell);
    });
    page.append(recap);
    const actions = element('div', 'persona-actions');
    actions.append(makeButton('上一頁', 'secondary-button', () => { personaPage = 0; render(); }));
    actions.append(makeButton('複製結果', 'secondary-button', () => {
      const text = `${persona.name}｜識破 ${totals.score} / 7｜${persona.strength}`;
      try {
        const write = navigator.clipboard?.writeText(text);
        if (write) void write.catch(() => {});
      } catch { /* Copy failures are intentionally silent. */ }
    }));
    actions.append(makeButton('再走一次', 'primary-button', () => dispatch({ type: 'RESTART' }), { 'data-primary': true }));
    page.append(actions);
  }
  target.append(page);
}

function renderMenu() {
  const choices = content.chapters.map((chapter, index) => {
    const number = index + 1;
    const reached = number <= flow.progress.farthest;
    const button = makeButton(`${chapter.year}　${chapter.title}`, 'chapter-menu-item', () => {
      const changed = dispatch({ type: 'SELECT_CHAPTER', chapter: number });
      if (changed) ui['chapter-menu'].close();
    }, { disabled: !reached });
    if (number === flow.chapter) button.classList.add('is-current');
    if (!reached) button.append(element('span', 'locked-label', '尚未抵達'));
    return button;
  });
  setChildren(ui['chapter-list'], choices);
}

function render() {
  if (flow.phase === 'title') {
    renderTitle();
    return;
  }
  ui['title-screen'].hidden = true;
  ui['game-screen'].hidden = false;
  updateHeader();
  renderMenu();
  ui['story-content'].replaceChildren();
  const walking = ['walk1', 'walk2'].includes(flow.phase);
  // 同一個面板承接所有閱讀階段；走路時連同焦點與捲動區一併收起。
  const panel = ui['story-panel'];
  panel.hidden = walking;
  if (panel.dataset.phase !== flow.phase) panel.scrollTop = 0;
  panel.dataset.phase = flow.phase;
  // 只在走路階段關閉瀏覽器手勢，其他互動保留原生操作。
  ui['game-screen'].classList.toggle('guide-walking', ['walk1', 'walk2'].includes(flow.phase));

  if (flow.phase === 'card') {
    renderChapterCard(ui['story-content']);
    setHint('準備好就出發。');
  } else if (flow.phase === 'walk1' || flow.phase === 'walk2') {
    renderWalk(ui['story-content']);
    setHint(window.matchMedia('(pointer: coarse)').matches ? '按住畫面往前走' : '按住 → 往前走');
  } else if (flow.phase === 'chat') {
    renderChat(ui['story-content']);
    setHint(chatChoice === null ? '選擇一個回覆。' : '');
  } else if (flow.phase === 'quiz') {
    // 小問在原本的內容容器內呈現，保留版本防護以丟棄已卸下按鈕的回呼。
    const revision = flow.revision;
    renderQuiz(ui['story-content'], {
      chapter: flow.chapter, result: flow.pending?.quiz, choice: lastQuizChoice,
      onAnswer: (index) => {
        if (flow.revision !== revision || typeof flow.pending?.quiz === 'boolean' || performance.now() < confirmIgnoreUntil) return;
        lastQuizChoice = index;
        if (dispatch({ type: 'QUIZ_RESULT', index, revision })) audio.playNote('interact');
      },
      onContinue: () => {
        if (performance.now() >= confirmIgnoreUntil) dispatch({ type: 'CONTINUE_QUIZ', revision });
      },
    });
    setHint('路上小問');
  } else if (flow.phase === 'game') {
    renderGame(ui['story-content']);
    setHint('');
  } else if (flow.phase === 'reveal') {
    renderReveal(ui['story-content']);
    setHint('');
  } else if (flow.phase === 'takeaway') {
    renderTakeaway(ui['story-content']);
    setHint('帶著這句話繼續走。');
  } else if (flow.phase === 'depart') {
    renderDepart(ui['story-content']);
    setHint('下一站正在路上。');
  } else if (flow.phase === 'persona') {
    renderPersona(ui['story-content']);
    setHint('翻開你的十年足跡。');
  }
  updateWorldPrompt();
}

function renderChoiceLines(target, lines = []) {
  for (const line of lines) target.append(element('span', 'answer-detail', line));
}

function submitGame(input, correct) {
  if (performance.now() < confirmIgnoreUntil) return false;
  const changed = dispatch({ type: 'GAME_RESULT', input, correct });
  if (changed) audio.playNote('interact');
  return changed;
}

function renderGame(target) {
  const chapter = currentContent();
  const game = chapter.game;
  // 作答前先交代年鑑與案例，和題目一起閱讀。
  target.append(element('p', 'game-context', chapterContext[flow.chapter - 1]));
  target.append(element('h2', 'game-prompt', game.prompt));

  if (game.type === 'pick') {
    const grid = element('div', 'pick-grid');
    game.options.forEach((option, index) => {
      const card = makeButton('', 'choice-card pick-card', () => submitGame({ choice: index }, index === game.answer));
      card.dataset.choiceIndex = String(index);
      card.append(element('strong', 'answer-title', option.title));
      renderChoiceLines(card, option.lines);
      grid.append(card);
    });
    target.append(grid);
  } else if (game.type === 'slider') {
    const group = element('div', 'slider-group');
    const input = element('input', 'slider-input');
    input.type = 'range';
    input.id = 'slider-input';
    input.min = String(game.min);
    input.max = String(game.max);
    input.step = String(game.step);
    input.value = String(game.start);
    input.setAttribute('aria-label', `${game.prompt} 數值`);
    const value = element('output', 'slider-value', `${game.start}${game.unit}`);
    value.htmlFor = input.id;
    input.addEventListener('input', () => { value.textContent = `${input.value}${game.unit}`; });
    group.append(element('label', 'slider-label', '調整你的猜測'), input, value);
    group.append(makeButton('就這個', 'primary-button', () => {
      const guess = Number(input.value);
      const valid = Number.isFinite(guess) && guess >= game.min && guess <= game.max
        && Math.abs((guess - game.min) / game.step - Math.round((guess - game.min) / game.step)) < 0.000001;
      if (valid) submitGame({ guess }, sliderIsCorrect(guess, game.answer, game.tolerance));
    }, { 'data-primary': true }));
    target.append(group);
  } else if (game.type === 'swipe') {
    const cards = element('div', 'swipe-play');
    const index = swipeChoices.length;
    const cardText = game.cards[index];
    cards.append(element('p', 'swipe-count', `第 ${index + 1} 張，共 ${game.cards.length} 張`));
    const swipeCard = element('div', 'swipe-card', cardText);
    swipeCard.setAttribute('role', 'group');
    swipeCard.setAttribute('aria-label', cardText);
    swipeCard.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.target.closest('button')) return;
      swipePointer = { id: event.pointerId, x: event.clientX };
      swipeCard.setPointerCapture(event.pointerId);
    });
    swipeCard.addEventListener('pointerup', (event) => {
      if (!swipePointer || swipePointer.id !== event.pointerId) return;
      const delta = event.clientX - swipePointer.x;
      swipePointer = null;
      if (Math.abs(delta) >= 36) chooseSwipe(delta < 0 ? 'left' : 'right');
    });
    swipeCard.addEventListener('pointercancel', () => { swipePointer = null; });
    const buttons = element('div', 'swipe-buttons');
    buttons.append(makeButton(game.left, 'secondary-button', () => chooseSwipe('left')));
    buttons.append(makeButton(game.right, 'secondary-button', () => chooseSwipe('right')));
    cards.append(swipeCard, buttons);
    target.append(cards);
  } else if (game.type === 'multi') {
    const selected = new Set();
    const grid = element('div', 'multi-grid');
    const buttons = [];
    game.options.forEach((option, index) => {
      const button = makeButton('', 'choice-card multi-card', () => {
        if (selected.has(index)) selected.delete(index);
        else selected.add(index);
        button.setAttribute('aria-pressed', String(selected.has(index)));
        button.classList.toggle('is-selected', selected.has(index));
        confirm.disabled = selected.size === 0;
      }, { pressed: false });
      button.dataset.multiIndex = String(index);
      button.append(element('strong', 'answer-title', option.title));
      renderChoiceLines(button, option.lines);
      buttons.push(button);
      grid.append(button);
    });
    const confirm = makeButton('確認', 'primary-button', () => {
      const values = [...selected].sort((a, b) => a - b);
      if (values.length) submitGame({ selected: values }, multiIsCorrect(values, game.answers));
    }, { disabled: true, 'data-primary': true });
    target.append(grid, confirm);
  } else if (game.type === 'agent') {
    const grid = element('div', 'agent-grid');
    game.options.forEach((option, index) => {
      const button = makeButton('', 'choice-card agent-card', () => submitGame({ choice: index }, null));
      button.dataset.choiceIndex = String(index);
      button.append(element('strong', 'answer-title', option.title));
      renderChoiceLines(button, option.lines);
      grid.append(button);
    });
    target.append(grid);
  } else if (game.type === 'stop') {
    if (!stopGame || stopGame.chapter !== flow.chapter) {
      stopGame = { chapter: flow.chapter, started: false, running: false, stopped: false, tick: 0, nextAt: 0, remainingMs: game.intervalMs };
    }
    const meters = element('div', 'stop-meters');
    meters.append(makeStopMeter('report-meter', game.report.label, game.report.start, game.report.start + game.ticks * game.report.perTick, ''));
    meters.append(makeStopMeter('fresh-meter', game.fresh.label, game.fresh.start, game.fresh.start + game.ticks * game.fresh.perTick, game.fresh.unit ?? ''));
    const button = makeButton(stopGame.started ? '按停' : '開始', 'primary-button stop-action', toggleStop, { 'data-primary': true });
    button.setAttribute('aria-label', stopGame.started ? '按停自動優化' : '開始自動優化');
    target.append(meters, button);
    updateStopMeters();
  }
}

function makeStopMeter(id, label, start, end, unit) {
  const row = element('div', 'stop-meter');
  const header = element('div', 'stop-meter-header');
  header.append(element('span', 'stop-meter-label', label));
  header.append(element('strong', 'stop-meter-value', `${start}${unit}`));
  const track = element('div', 'stop-meter-track');
  const fill = element('span', 'stop-meter-fill');
  fill.style.width = '0%';
  track.append(fill);
  row.dataset.meter = id;
  row.dataset.start = String(start);
  row.dataset.end = String(end);
  row.dataset.unit = unit;
  row.append(header, track);
  return row;
}

function updateStopMeters() {
  if (!stopGame || flow.phase !== 'game' || currentContent().game?.type !== 'stop') return;
  const game = currentContent().game;
  const values = [
    { id: 'report-meter', value: game.report.start + stopGame.tick * game.report.perTick },
    { id: 'fresh-meter', value: Math.max(0, game.fresh.start + stopGame.tick * game.fresh.perTick) },
  ];
  for (const item of values) {
    const row = ui['story-content'].querySelector(`[data-meter="${item.id}"]`);
    if (!row) continue;
    row.querySelector('.stop-meter-value').textContent = `${item.value}${row.dataset.unit}`;
    const start = Number(row.dataset.start);
    const end = Number(row.dataset.end);
    const progress = Math.abs(end - start) < 0.001 ? 0 : (item.value - start) / (end - start);
    row.querySelector('.stop-meter-fill').style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  }
  const button = ui['story-content'].querySelector('.stop-action');
  if (button && stopGame.started) button.textContent = '按停';
}

function toggleStop() {
  if (flow.phase !== 'game' || currentContent().game?.type !== 'stop' || performance.now() < confirmIgnoreUntil) return;
  if (!stopGame?.started) {
    stopGame = { chapter: flow.chapter, started: true, running: true, stopped: false, tick: 0, nextAt: performance.now() + currentContent().game.intervalMs, remainingMs: currentContent().game.intervalMs };
    audio.playNote('interact');
    render();
    // 開始鈕換成按停鈕後，鍵盤可直接接續操作。
    focusFirstAction();
    return;
  }
  stopGame.running = false;
  stopGame.stopped = true;
  finishStop(true);
}

function finishStop(stopped) {
  const game = currentContent().game;
  const tick = stopGame?.tick ?? 0;
  const report = game.report.start + tick * game.report.perTick;
  const fresh = Math.max(0, game.fresh.start + tick * game.fresh.perTick);
  const correct = stopped ? stopIsCorrect(tick, game.goodUntilTick) : false;
  submitGame({ tick, stopped, report, fresh }, correct);
}

function chooseSwipe(side) {
  if (flow.phase !== 'game' || currentContent().game?.type !== 'swipe' || performance.now() < confirmIgnoreUntil) return;
  if (side !== 'left' && side !== 'right') return;
  const game = currentContent().game;
  const current = swipeChoices;
  if (current.length >= game.cards.length) return;
  const choices = [...current, side];
  if (choices.length < game.cards.length) {
    swipeChoices = choices;
    audio.playNote('interact');
    render();
    focusFirstAction();
    return;
  }
  swipeChoices = [];
  const correctCount = game.answers ? choices.filter((value, index) => value === game.answers[index]).length : 0;
  const correct = game.scored ? swipeScoreIsCorrect(correctCount) : null;
  submitGame({ choices }, correct);
}

function applyEffect(effect) {
  if (!effect) return;
  if (effect.type === 'persist') saveProgress(effect.value);
  if (effect.type === 'clear') {
    audio.setMuted(false);
    clearProgress();
    personaPage = 0;
    stopGame = null;
  }
  if (effect.type === 'mute') audio.setMuted(effect.value);
}

function clearDepartTimer() {
  if (departTimer) window.clearTimeout(departTimer);
  departTimer = 0;
}

function pauseDepartTimer() {
  if (flow.phase !== 'depart') return;
  departRemaining = Math.max(0, departDeadline - performance.now());
  clearDepartTimer();
}

function scheduleDepartTimer() {
  if (flow.phase !== 'depart' || flow.menuOpen || document.hidden) return;
  clearDepartTimer();
  const delay = departRemaining || 3600;
  departDeadline = performance.now() + delay;
  const revision = flow.revision;
  departTimer = window.setTimeout(() => {
    departTimer = 0;
    departRemaining = 0;
    dispatch({ type: 'DEPART_DONE', revision });
  }, delay);
}

function ensureStageChapter(chapterId) {
  if (activeStageChapter === chapterId) return;
  const shouldFade = activeStageChapter !== null;
  activeStageChapter = chapterId;
  completedKindness.clear();
  pendingKindness = null;
  lastFootstepX = flow.x;
  stage.setChapter(chapterId);
  void audio.setChapter(chapterArt[chapterId - 1]);
  if (shouldFade) {
    ui['stage-frame'].classList.add('chapter-transitioning');
    void ui['stage-frame'].offsetWidth;
    requestAnimationFrame(() => {
      if (activeStageChapter === chapterId) ui['stage-frame'].classList.remove('chapter-transitioning');
    });
  }
}

function handleStateChange(previous, next) {
  if (previous.chapter !== next.chapter && next.phase !== 'title') ensureStageChapter(next.chapter);
  if (previous.phase === 'title' && next.phase !== 'title') ensureStageChapter(next.chapter);

  if (previous.phase !== next.phase) {
    setMoving(false);
    if (next.phase !== 'game') swipePointer = null;
    if (next.phase === 'walk1' || next.phase === 'walk2') lastFootstepX = next.x;
    // 小問同樣清除前進輸入並保留 300ms 防誤觸。
    if (next.phase === 'chat' || next.phase === 'game' || next.phase === 'quiz') confirmIgnoreUntil = performance.now() + 300;
    if (next.phase === 'game') {
      const game = currentContent().game;
      stopGame = game?.type === 'stop'
        ? { chapter: next.chapter, started: false, running: false, stopped: false, tick: 0, nextAt: 0, remainingMs: game.intervalMs }
        : null;
      swipeChoices = [];
    }
    if (next.phase === 'reveal') {
      audio.playNote('reveal');
    }
    if (next.phase === 'depart') {
      ui['stage-frame'].classList.add('departing');
      stage.startDeparture();
      departRemaining = 3600;
      scheduleDepartTimer();
    } else if (previous.phase === 'depart') {
      clearDepartTimer();
      departRemaining = 0;
      ui['stage-frame'].classList.remove('departing');
    }
    if (next.phase === 'chat') {
      chatChoice = null;
      audio.playNote('interact');
      swipePointer = null;
    }
    if (next.phase === 'persona') personaPage = 0;
    // 自動走仍經過原本的 MOVE 停靠判定。
    if (guide.auto && (next.phase === 'walk1' || next.phase === 'walk2') && !next.menuOpen && !document.hidden) setMoving(true);
  }
}

function dispatch(action) {
  const previous = flow;
  const result = transitionFlow(flow, action);
  if (result.state === flow) return false;
  flow = result.state;
  applyEffect(result.effect);
  handleStateChange(previous, flow);
  render();
  if (previous.phase !== flow.phase) guide.enter(flow, currentContent().game?.type);
  // 小問揭曉仍在 quiz 階段；換成繼續鈕時也要移交焦點並防止連點跳過說明。
  const quizAnswered = flow.phase === 'quiz' && previous.pending?.quiz !== flow.pending?.quiz;
  if (quizAnswered) confirmIgnoreUntil = performance.now() + 300;
  if (quizAnswered || (previous.phase !== flow.phase && ['card', 'chat', 'quiz', 'game', 'reveal', 'takeaway', 'depart', 'persona'].includes(flow.phase))) {
    scheduleFocus(flow.revision);
  }
  return true;
}

function setMoving(value) {
  const nextValue = Boolean(value) && (flow.phase === 'walk1' || flow.phase === 'walk2') && !flow.menuOpen;
  if (!nextValue) {
    heldPointerId = null;
    heldKeys.clear();
    manualStartX = null;
  }
  if (moving === nextValue) return;
  moving = nextValue;
}

function holdMove(pointerId = null) {
  if (flow.phase !== 'walk1' && flow.phase !== 'walk2') return;
  if (pointerId !== null) {
    if (heldPointerId !== null) return;
    heldPointerId = pointerId;
  }
  if (manualStartX === null) manualStartX = flow.x;
  setMoving(true);
}

function releaseMove(pointerId = null) {
  if (pointerId !== null && heldPointerId !== pointerId) return;
  if (pointerId !== null) heldPointerId = null;
  if (heldPointerId !== null || heldKeys.size) return;
  guide.released(flow, manualStartX !== null && flow.x > manualStartX);
  manualStartX = null;
  if (!guide.auto) setMoving(false);
}

function pauseStopTimer() {
  if (!stopGame?.running) return;
  stopGame.remainingMs = Math.max(0, stopGame.nextAt - performance.now());
  stopGame.running = false;
}

function resumeStopTimer() {
  if (!stopGame?.started || stopGame.stopped || flow.phase !== 'game' || flow.menuOpen || document.hidden) return;
  stopGame.running = true;
  stopGame.nextAt = performance.now() + Math.max(0, stopGame.remainingMs);
}

function openMenu() {
  if (flow.phase === 'title' || flow.menuOpen) return;
  setMoving(false);
  pauseStopTimer();
  pauseDepartTimer();
  if (dispatch({ type: 'OPEN_MENU' })) {
    renderMenu();
    ui['chapter-menu'].showModal();
  }
}

function closeMenu() {
  if (flow.menuOpen) dispatch({ type: 'CLOSE_MENU' });
  if (guide.auto && !document.hidden) setMoving(true);
  resumeStopTimer();
  scheduleDepartTimer();
}

function updateWorldPrompt() {
  // 題目已在閱讀面板中。場景泡泡只在走路、有善意互動時出現。
  if (!pendingKindness || (flow.phase !== 'walk1' && flow.phase !== 'walk2')) {
    ui['world-prompt'].hidden = true;
    return;
  }
  const prompt = ui['world-prompt'];
  prompt.hidden = false;
  prompt.textContent = '順手幫一下';
  const position = stage.worldToScreen(pendingKindness.x, 330);
  const inset = prompt.offsetWidth / 2 + 8;
  prompt.style.left = `clamp(calc(env(safe-area-inset-left, 0px) + ${inset}px), ${position.left}px, calc(100% - env(safe-area-inset-right, 0px) - ${inset}px))`;
  prompt.style.top = `${position.top}px`;
  prompt.setAttribute('aria-label', pendingKindness.label);
  prompt.dataset.kindness = 'true';
}

function triggerKindness() {
  if (!pendingKindness) return;
  completedKindness.add(`${flow.chapter}:${pendingKindness.x}`);
  stage.showKindness(pendingKindness.x);
  audio.playNote('kindness');
  pendingKindness = null;
  updateWorldPrompt();
}

function checkKindness(oldX, newX) {
  if (pendingKindness || oldX === newX) return;
  const item = currentArt().kindness.find((entry) => entry.x > oldX && entry.x <= newX && !completedKindness.has(`${flow.chapter}:${entry.x}`));
  if (item) pendingKindness = item;
}

function tickMovement(deltaSeconds) {
  if (!moving || flow.menuOpen) return;
  const chapter = currentArt();
  // 小問前後仍是 walk2，由流程決定下一個停靠點。
  const { stopAt, next } = getWalkTarget(flow, chapter.stops);
  const previous = flow;
  const result = transitionFlow(flow, { type: 'MOVE', delta: WALK_SPEED * DEBUG_SPEED * deltaSeconds, stopAt, next });
  if (result.state === flow) return;
  flow = result.state;
  guide.moved(previous, flow.x - previous.x);
  checkKindness(previous.x, flow.x);
  if ((flow.phase === 'walk1' || flow.phase === 'walk2') && flow.x - lastFootstepX >= FOOTSTEP_DISTANCE) {
    audio.playNote('step');
    lastFootstepX = flow.x;
  }
  if (previous.phase !== flow.phase) {
    handleStateChange(previous, flow);
    render();
    guide.enter(flow, currentContent().game?.type);
    scheduleFocus(flow.revision);
  }
}

function tickStop(now) {
  if (!stopGame?.running || flow.phase !== 'game' || flow.menuOpen) return;
  const game = currentContent().game;
  let changed = false;
  while (now >= stopGame.nextAt && stopGame.tick < game.ticks) {
    stopGame.tick += 1;
    stopGame.nextAt += game.intervalMs;
    stopGame.remainingMs = game.intervalMs;
    changed = true;
  }
  if (!changed) return;
  if (stopGame.tick >= game.ticks) {
    stopGame.running = false;
    stopGame.stopped = false;
    finishStop(false);
    return;
  }
  updateStopMeters();
}

function frame(now) {
  if (document.hidden) return;
  const delta = lastFrame ? Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)) : 0;
  lastFrame = now;
  elapsedSeconds += delta;
  tickMovement(delta);
  tickStop(now);
  stage.update({ x: flow.x, timeSeconds: elapsedSeconds, moving, pose: flow.phase === 'chat' ? 'wave' : 'walk' });
  guide.update(flow, currentArt().stops.chat);
  updateWorldPrompt();
  requestAnimationFrame(frame);
}

function unlockAudio() {
  void audio.unlock().then((unlocked) => {
    if (unlocked && !audio.ambient && audio.chapter) audio.startAmbient(audio.chapter);
  });
}

function handleVisibilityChange() {
  if (document.hidden) {
    setMoving(false);
    pauseStopTimer();
    pauseDepartTimer();
    audio.pause();
    return;
  }
  lastFrame = 0;
  if (guide.auto && !flow.menuOpen) setMoving(true);
  resumeStopTimer();
  scheduleDepartTimer();
  void audio.resume().then((resumed) => {
    if (!resumed) return;
    if (!audio.ambient && audio.chapter) audio.startAmbient(audio.chapter);
  });
  requestAnimationFrame(frame);
}

function debugStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== '1') return;
  const requested = Number(params.get('c'));
  if (!Number.isInteger(requested) || requested < 1 || requested > content.chapters.length) return;
  const progress = createProgress({ v: 1, resume: requested, farthest: requested, results: {}, done: false, muted: flow.progress.muted });
  flow = createFlowState(progress);
  flow = transitionFlow(flow, { type: 'BEGIN' }).state;
  if (params.get('g') === '1') {
    flow = transitionFlow(flow, { type: 'CARD_DONE' }).state;
    flow = transitionFlow(flow, { type: 'MOVE', delta: 5000, stopAt: currentArt().stops.chat, next: 'chat' }).state;
    flow = transitionFlow(flow, { type: 'REPLY', index: 0 }).state;
    // 保留舊有 g=1 直接驗小互動的入口；略過的小問記為未答對，不增加成績。
    flow = transitionFlow(flow, { type: 'MOVE', delta: 5000, ...getWalkTarget(flow, currentArt().stops) }).state;
    flow = { ...flow, pending: { ...flow.pending, quiz: false } };
    flow = transitionFlow(flow, { type: 'CONTINUE_QUIZ' }).state;
    const next = currentContent().game ? 'game' : 'takeaway';
    const stopAt = currentContent().game ? currentArt().stops.interaction : currentArt().stops.takeaway;
    flow = transitionFlow(flow, { type: 'MOVE', delta: 5000, stopAt, next }).state;
  }
  window.__gt = {};
  Object.defineProperty(window.__gt, 'state', { enumerable: true, get: () => flow });
  Object.defineProperty(window.__gt, 'flow', { enumerable: true, get: () => flow });
  window.__gt.dispatch = dispatch;
  window.__gt.stage = stage;
  Object.defineProperty(window.__gt, 'audio', { enumerable: true, get: () => audio });
}

function focusGroup(selector, direction) {
  const items = [...ui['story-content'].querySelectorAll(selector)];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
  const index = (start + direction + items.length) % items.length;
  // 方向鍵移到面板下緣的選項時，讓內部捲動區跟著焦點移動。
  items[index].focus();
}

function adjustSlider(direction) {
  const input = ui['story-content'].querySelector('#slider-input');
  if (!input) return;
  if (document.activeElement !== input) input.focus({ preventScroll: true });
  const next = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + direction * Number(input.step)));
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitSlider() {
  const input = ui['story-content'].querySelector('#slider-input');
  const button = ui['story-content'].querySelector('.slider-group .primary-button');
  if (input && button) button.click();
}

function onKeyDown(event) {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (ui['chapter-menu'].open) return;
  // 走到停靠點後，仍按住的確認鍵不得重複觸發剛出現的題目。
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    return;
  }

  const activeControl = event.target instanceof Element && event.target.closest('button, input, select, textarea');
  // 空白鍵只在非控制項焦點時走路，保留按鈕原生的鍵盤操作。
  if ((flow.phase === 'walk1' || flow.phase === 'walk2') && (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd' || (event.key === ' ' && !activeControl))) {
    event.preventDefault();
    heldKeys.add(event.key.toLowerCase());
    holdMove();
    return;
  }
  if (!activeControl && !ui['world-prompt'].hidden && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    if (pendingKindness) triggerKindness();
    else focusFirstAction();
    return;
  }

  // 數字鍵與點選共用揭曉；閱讀回饋時保留繼續鈕的原生操作。
  if (flow.phase === 'chat' && chatChoice === null) {
    if (/^[1-4]$/.test(event.key) && !event.repeat) {
      event.preventDefault();
      chooseChatReply(Number(event.key) - 1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusGroup('.reply-card', event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
  }

  if (flow.phase === 'game') {
    const game = currentContent().game;
    if (game.type === 'swipe' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      chooseSwipe(event.key === 'ArrowLeft' ? 'left' : 'right');
      return;
    }
    if ((game.type === 'pick' || game.type === 'multi' || game.type === 'agent') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      focusGroup(game.type === 'multi' ? '.multi-card' : '[data-choice-index]', event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (game.type === 'slider') {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (document.activeElement?.id === 'slider-input') return;
        event.preventDefault();
        adjustSlider(event.key === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter' && document.activeElement?.id === 'slider-input') {
        event.preventDefault();
        submitSlider();
        return;
      }
    }
    if (game.type === 'stop' && event.key === ' ' && !event.target.closest('button')) {
      event.preventDefault();
      toggleStop();
      return;
    }
  }

  if (event.key === ' ' && !event.target.closest('button, input, select, textarea')) event.preventDefault();
}

function onKeyUp(event) {
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd' || event.key === ' ') {
    heldKeys.delete(event.key.toLowerCase());
    releaseMove();
  }
}

function beginPointerMove(event) {
  if (!event.isPrimary || event.button !== 0 || event.target.closest('button, input, select, textarea, a, dialog')) return;
  if (flow.phase !== 'walk1' && flow.phase !== 'walk2') return;
  event.preventDefault();
  unlockAudio();
  holdMove(event.pointerId);
}

function bindInteractions() {
  ui['intro-text'].textContent = content.intro;
  ui['start-button'].addEventListener('click', () => {
    unlockAudio();
    dispatch({ type: 'BEGIN' });
  });
  // 舞台與題目區的空白處都能按住，不攔截選單或互動控制項。
  ui['game-screen'].addEventListener('pointerdown', beginPointerMove);
  window.addEventListener('pointerup', (event) => releaseMove(event.pointerId));
  window.addEventListener('pointercancel', (event) => releaseMove(event.pointerId));
  window.addEventListener('blur', releaseAllInput);
  window.addEventListener('focus', () => { if (guide.auto && !document.hidden && !flow.menuOpen) setMoving(true); });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  // 只用鍵盤玩的人也要能聽到聲音。
  window.addEventListener('keydown', unlockAudio, { capture: true, once: true });

  // 自動走：開啟後主角自己走到下一個停靠點，抵達後停下等玩家。
  ui['auto-button'].addEventListener('click', () => {
    const on = guide.toggleAuto();
    updateHeader();
    if (on && (flow.phase === 'walk1' || flow.phase === 'walk2') && !flow.menuOpen) setMoving(true);
    else if (!on) setMoving(false);
  });
  ui['mute-button'].addEventListener('click', () => {
    const muted = !flow.progress.muted;
    dispatch({ type: 'SET_MUTED', muted });
  });
  ui['menu-button'].addEventListener('click', openMenu);
  ui['close-menu'].addEventListener('click', () => ui['chapter-menu'].close());
  ui['chapter-menu'].addEventListener('close', closeMenu);
  ui['chapter-menu'].addEventListener('cancel', () => {
    pauseStopTimer();
    pauseDepartTimer();
  });
  ui['world-prompt'].addEventListener('click', () => {
    if (pendingKindness) triggerKindness();
    else focusFirstAction();
  });
}

function releaseAllInput() {
  heldPointerId = null;
  heldKeys.clear();
  setMoving(false);
}

function start() {
  bindInteractions();
  debugStateFromUrl();
  if (flow.phase !== 'title') ensureStageChapter(flow.chapter);
  render();
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => stage.resize(), { passive: true });
}

document.addEventListener('visibilitychange', handleVisibilityChange);
// 從瀏覽器的返回快取還原時（手機切回分頁常見），畫布可能已失效：重建目前的章節。
window.addEventListener('pageshow', (event) => {
  if (event.persisted && activeStageChapter !== null) stage.setChapter(activeStageChapter);
});
start();



