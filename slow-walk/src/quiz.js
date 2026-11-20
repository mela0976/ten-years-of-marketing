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

// 僅填入題目內容，不建立面板；外層版面與焦點生命週期由主流程管理。
export function renderQuiz(target, { chapter, result, choice, onAnswer, onContinue }) {
  const question = roadside[chapter - 1];
  const document = target.ownerDocument;
  const heading = element(document, 'h2', 'game-prompt', question.prompt);
  target.append(heading);

  if (typeof result === 'boolean') {
    const feedback = element(document, 'p', `verdict ${result ? 'is-right' : 'is-wrong'}`, result ? '答對了' : `沒猜中，正解是「${question.options[question.answer]}」`);
    // 每個選項都列出來：正解與玩家的選擇各自標示。
    const list = element(document, 'div', 'answer-list quiz-answer-list');
    question.options.forEach((text, index) => {
      const card = element(document, 'div', `answer-card${index === question.answer ? ' is-answer' : ''}${index === choice ? ' is-selected' : ''}`);
      card.append(element(document, 'strong', 'answer-title', text));
      if (index === question.answer) card.append(element(document, 'span', 'answer-mark', '正解'));
      else if (index === choice) card.append(element(document, 'span', 'answer-mark is-mine', '你選的'));
      list.append(card);
    });
    const reveal = element(document, 'p', 'reveal-text', question.reveal);
    const next = button(document, '繼續走', 'primary-button', onContinue);
    next.dataset.primary = 'true';
    target.append(feedback, list, reveal, next);
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
