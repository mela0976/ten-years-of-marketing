import roadside from '../content/roadside.js';

function element(document, tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(document, text, className, action) {
  const node = element(document, 'button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  // 保留原生 Enter／空白鍵作答，只攔住長按造成的重複確認。
  node.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  return node;
}

export function renderAnswerList(target, options, { answers, selected, answerLabel = '正解' }) {
  const document = target.ownerDocument;
  const list = element(document, 'div', 'answer-list');
  options.forEach(({ title, lines = [] }, index) => {
    const isAnswer = answers.includes(index);
    const isSelected = selected.includes(index);
    const card = element(document, 'div', `answer-card${isAnswer ? ' is-answer' : ''}${isSelected ? ' is-selected' : ''}`);
    card.append(element(document, 'strong', 'answer-title', title));
    for (const line of lines) card.append(element(document, 'span', 'answer-detail', line));
    if (isAnswer || isSelected) {
      const mark = isAnswer && isSelected ? `${answerLabel} · 你選的` : isAnswer ? answerLabel : '你選的';
      card.append(element(document, 'span', `answer-mark${isAnswer ? '' : ' is-mine'}`, mark));
    }
    list.append(card);
  });
  target.append(list);
}

// 依型別選擇內容檔中的揭曉欄位，回傳要在同一畫面出現的段落。
export function getRevealMessages(game, input) {
  if (game.type === 'swipe' && !game.scored) {
    const count = input.choices.filter((choice) => choice === game.countSide).length;
    return [game.revealByCount.replaceAll('{n}', String(count))];
  }
  if (game.type === 'agent') {
    return [input.choice === game.agentPick ? game.revealSame : game.revealDiff];
  }
  if (game.type === 'stop') {
    const outcome = input.stopped ? game.revealStopped : game.revealNever;
    return [
      outcome.replaceAll('{report}', String(input.report)).replaceAll('{fresh}', String(input.fresh)),
      `${game.reveal} 這題每多跑一格，新客比例就更低，所以要及早按停。`,
    ];
  }
  return [game.reveal];
}

// 僅填入題目內容，不建立面板；外層版面與焦點生命週期由主流程管理。
export function renderQuiz(target, { chapter, result, choice, onAnswer, onContinue }) {
  const question = roadside[chapter - 1];
  const document = target.ownerDocument;
  const heading = element(document, 'h2', 'game-prompt', question.prompt);
  target.append(heading);

  if (typeof result === 'boolean') {
    const feedback = element(document, 'p', `verdict ${result ? 'is-right' : 'is-wrong'}`, result ? '答對了' : '沒猜中');
    target.append(feedback);
    renderAnswerList(target, question.options.map((title) => ({ title })), { answers: [question.answer], selected: [choice] });
    const reveal = element(document, 'p', 'reveal-text', question.reveal);
    const next = button(document, '繼續走', 'primary-button', onContinue);
    next.dataset.primary = 'true';
    target.append(reveal, next);
    return;
  }

  const choices = element(document, 'div', 'reply-grid');
  const buttons = question.options.map((text, index) => {
    const choice = button(document, text, 'choice-card reply-card', () => onAnswer(index));
    choice.dataset.quizIndex = String(index);
    return choice;
  });
  // 左右鍵只移動焦點，不提前作答；Tab 與觸控仍沿用原生按鈕。
  choices.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + direction + buttons.length) % buttons.length].focus({ preventScroll: true });
  });
  choices.append(...buttons);
  target.append(choices);
}
