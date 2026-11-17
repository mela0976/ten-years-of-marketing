import content from './content.js';
import gamify from './gamify-content.js';
import squad from './squad-content.js';
import { element, button, setPanel } from './ui.js';
import { rankTeams, rivalChapterAward, rivalQuickAward } from './logic.js';

const label = squad.labels;
let countdownTimer = null;
const format = (value, fields) => Object.entries(fields).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, String(replacement)), value);


// The Higgsfield meeting-room clip plays over the still. One element is reused across redraws so the loop
// does not restart every time the room state changes; a missing file or reduced-motion setting leaves the still.
let lobbyVideo = null;
function lobbyMotion() {
  if (lobbyVideo === false || typeof window === 'undefined') return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (!lobbyVideo) {
    const video = document.createElement('video');
    video.className = 'squad-lobby-motion';
    video.src = './video/lobby.mp4';
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true');
    video.addEventListener('error', () => { video.remove(); lobbyVideo = false; });
    lobbyVideo = video;
  }
  requestAnimationFrame(() => { if (lobbyVideo && lobbyVideo.isConnected) lobbyVideo.play().catch(() => {}); });
  return lobbyVideo;
}

function startCountdown(panel, deadline, prefix) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  if (deadline === null) return;
  countdownTimer = setInterval(() => {
    const node = panel.querySelector('.squad-countdown');
    if (!node) { clearInterval(countdownTimer); countdownTimer = null; return; }
    node.textContent = `${prefix} ${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))} 秒`;
  }, 500);
}

function fallbackSilhouette() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 80'); svg.setAttribute('aria-hidden', 'true');
  const head = document.createElementNS(svg.namespaceURI, 'circle'); head.setAttribute('cx', '32'); head.setAttribute('cy', '25'); head.setAttribute('r', '13'); head.setAttribute('fill', '#b9b4a6');
  const body = document.createElementNS(svg.namespaceURI, 'path'); body.setAttribute('d', 'M8 80 C8 53 19 45 32 45 C45 45 56 53 56 80 Z'); body.setAttribute('fill', '#b9b4a6');
  svg.append(head, body); return svg;
}

function avatar(name, image, color, className = 'squad-avatar') {
  const wrap = element('span', { className, attrs: { 'aria-label': name, role: 'img' } });
  wrap.style.backgroundColor = color;
  wrap.style.setProperty('--duty-color', color);
  const img = element('img', { attrs: { src: `./images/${image}.webp`, alt: '', loading: 'lazy' } });
  img.addEventListener('error', () => { if (!wrap.querySelector('svg')) wrap.replaceChildren(fallbackSilhouette()); }, { once: true });
  wrap.append(img); return wrap;
}

function entryScreen(panel, onStart, error = '', defaults = {}) {
  const name = element('input', { type: 'text', value: defaults.name ?? '', attrs: { placeholder: label.namePlaceholder, maxlength: squad.timing.nameMaxLength, autocomplete: 'name', 'aria-label': label.namePlaceholder } });
  let selectedDuty = defaults.duty ?? squad.duties[0].id;
  const roomCode = element('input', { type: 'text', value: defaults.roomCode ?? '', attrs: { placeholder: label.codePlaceholder, maxlength: 4, autocapitalize: 'characters', 'aria-label': label.codePlaceholder } });
  const invited = Boolean(defaults.roomInvite);
  const seatCards = element('div', { className: 'squad-entry-seats', attrs: { role: 'group', 'aria-label': label.pickDuty } });
  const updateSeats = () => seatCards.querySelectorAll('button').forEach((card) => card.setAttribute('aria-pressed', String(card.dataset.duty === selectedDuty)));
  for (const item of squad.duties) {
    const card = button('', () => { selectedDuty = item.id; updateSeats(); }, 'secondary', { 'aria-pressed': String(item.id === selectedDuty) });
    card.dataset.duty = item.id;
    card.classList.add('squad-entry-seat');
    card.append(avatar(item.name, item.image, item.color), element('span', { className: 'squad-seat-copy' }, [element('strong', { text: item.name }), element('small', { text: item.desk })]));
    seatCards.append(card);
  }
  const scene = element('section', { className: 'squad-lobby-entry' }, [
    element('div', {}, [element('div', { className: 'squad-entry-visual' }, [element('img', { attrs: { src: './images/lobby.webp', alt: '', loading: 'lazy' } }), lobbyMotion(), invited ? element('p', { className: 'squad-code-large', text: roomCode.value.toUpperCase() }) : null]), element('p', { className: 'panel-copy squad-entry-note', text: label.squadNote })]),
    element('div', { className: 'squad-entry-form' }, [
      name, seatCards,
      invited ? null : element('div', { className: 'squad-join-row' }, [roomCode, button(label.join, () => onStart({ mode: 'join', name: name.value, duty: selectedDuty, code: roomCode.value.trim().toUpperCase() }), 'secondary')]),
      error ? element('p', { className: 'squad-error', text: error, attrs: { role: 'alert' } }) : null,
      invited
        ? button(label.join, () => onStart({ mode: 'join', name: name.value, duty: selectedDuty, code: roomCode.value.trim().toUpperCase() }), 'primary')
        : element('div', { className: 'squad-entry-actions' }, [button(label.create, () => onStart({ mode: 'create', name: name.value, duty: selectedDuty }), 'primary'), button('和 AI 隊友玩', () => onStart({ mode: 'local', name: name.value || '你', duty: selectedDuty }), 'secondary')]),
    ]),
  ]);
  const image = scene.querySelector('.squad-entry-visual img'); image?.addEventListener('error', () => { image.hidden = true; image.parentElement.classList.add('has-fallback'); }, { once: true });
  setPanel(panel, label.squad, '開始一場小組討論', [scene], 'open');
  panel.classList.add('panel-squad-entry');
}

function renderLobby(panel, room, seat, client, callbacks) {
  const own = room.seats[seat];
  const seats = room.seats.map((member, index) => {
    const duty = squad.duties.find((item) => item.id === member.duty);
    return element('article', { className: `squad-seat-card${member.kind === 'empty' ? ' is-empty' : ''}` }, [
      avatar(duty?.name ?? '', duty?.image, duty?.color),
      element('div', { className: 'squad-seat-copy' }, [element('strong', { text: duty?.name }), element('span', { text: duty?.desk }), element('b', { text: member.kind === 'empty' ? label.empty : `${member.name}${member.kind === 'ai' ? `・${label.aiMate}` : ''}` })]),
      index === seat ? element('span', { className: 'squad-seat-tag is-self', text: '你' }) : null,
      member.host ? element('span', { className: 'squad-seat-tag', text: label.host }) : null,
      index === room.captainSeat && room.phase !== 'lobby' ? element('span', { className: 'squad-host-tag', text: label.captain }) : null,
    ]);
  });
  const invite = new URL(window.location.href); invite.searchParams.set('room', room.code);
  const children = [
    element('section', { className: 'squad-lobby-layout' }, [
      element('div', { className: 'squad-lobby-visual' }, [element('img', { attrs: { src: './images/lobby.webp', alt: '', loading: 'lazy' } }), lobbyMotion(), element('span', { text: client.mode === 'local' ? '本機小組' : label.roomCode }), element('strong', { className: 'squad-code-large', text: client.mode === 'local' ? '本機' : room.code }), client.mode === 'remote' ? button(label.copyLink, async () => { await navigator.clipboard?.writeText(invite.toString()).catch(() => {}); callbacks.status(label.copied); }, 'secondary') : null]),
      element('div', { className: 'squad-lobby-seats' }, seats),
    ]),
  ];
  const host = own?.host;
  if (host) {
    const team = element('select', { attrs: { 'aria-label': '小組名稱' } }, gamify.teams.map((item) => element('option', { value: item, text: item })));
    team.value = room.teamName;
    team.addEventListener('change', () => client.send({ type: 'setTeam', teamName: team.value }));
    const noTimer = element('input', { type: 'checkbox', checked: room.noTimer, attrs: { 'aria-label': '不計時' } });
    noTimer.addEventListener('change', () => client.send({ type: 'setNoTimer', noTimer: noTimer.checked }));
    children.push(element('div', { className: 'button-row squad-host-controls' }, [team, element('label', { className: 'timer-toggle' }, [noTimer, element('span', { text: '不計時' })]), button(room.seats.some((item) => item.kind === 'empty') ? label.startWithBots : label.start, () => client.send({ type: 'start' }), 'primary')]));
  } else children.push(element('p', { className: 'panel-copy squad-host-controls', text: label.waitingHost }));
  const image = children[0].querySelector('.squad-lobby-visual img'); image.addEventListener('error', () => { image.hidden = true; image.parentElement.classList.add('has-fallback'); }, { once: true });
  setPanel(panel, `${label.roomCode} ${room.code}`, room.teamName, children, 'open');
  panel.classList.add('panel-squad-lobby');
}

function renderDiscuss(panel, room, seat, client, status) {
  const chapter = content.chapters[room.chapter];
  const member = room.seats[seat];
  const duty = squad.duties.find((item) => item.id === member?.duty);
  const ownClue = squad.clues[room.chapter]?.[member?.duty] ?? '';
  const shown = room.cluesShown.includes(seat);
  const votes = element('div', { className: `option-grid squad-votes count-4`, attrs: { role: 'group', 'aria-label': '表態回覆' } }, chapter.chat.replies.map((reply, index) => {
    const ballot = Object.entries(room.votes).filter(([, vote]) => vote === index).map(([owner]) => room.seats[Number(owner)]);
    const isOwn = room.votes[seat] === index;
    const card = element('button', { className: `button button-option squad-vote${isOwn ? ' is-selected is-own-vote' : ''}`, type: 'button', attrs: { 'aria-pressed': String(isOwn), 'aria-label': `${label.vote}：${reply.text}` }, onClick: () => client.send({ type: 'vote', reply: index }) }, [element('strong', { text: reply.text }), element('span', { className: 'squad-ballots', attrs: { 'aria-hidden': 'true' } }, ballot.map((person) => { const role = squad.duties.find((item) => item.id === person?.duty); return avatar(person?.name, role?.image, role?.color, 'squad-avatar squad-ballot'); }))]);
    card.style.setProperty('--duty-color', duty?.color ?? '#1f6f5c');
    return card;
  }));
  const chat = element('div', { className: 'squad-chat-log', attrs: { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' } }, room.chat.slice(-12).map((line) => {
    const sender = typeof line.from === 'number' ? room.seats[line.from] : squad.advisors.find((person) => person.id === line.from);
    const role = typeof line.from === 'number' ? squad.duties.find((item) => item.id === sender?.duty) : sender;
    const own = line.from === seat;
    const message = element('article', { className: `squad-chat-message${line.kind === 'clue' ? ' is-clue' : ''}${line.kind === 'advisor' ? ' is-advisor' : ''}${own ? ' is-own' : ''}`, attrs: { style: `--duty-color:${role?.color ?? '#59666a'}` } }, [avatar(sender?.name ?? '系統', role?.image, role?.color ?? '#59666a', 'squad-avatar squad-chat-avatar'), element('div', {}, [element('strong', { text: `${sender?.name ?? '系統'}${typeof line.from === 'number' && role?.name ? `・${role.name}` : ''}` }), element('p', { text: line.text })])]);
    return message;
  }));
  const say = element('input', { type: 'text', attrs: { maxlength: squad.timing.chatMaxLength, placeholder: label.say, 'aria-label': label.say } });
  const sendButton = button(label.send, null, 'primary'); sendButton.type = 'submit';
  const chatInput = element('form', { className: 'squad-chat-input' }, [say, sendButton]);
  chatInput.addEventListener('submit', (event) => { event.preventDefault(); if (!say.value.trim()) return; client.send({ type: 'say', text: say.value }); say.value = ''; });
  const quick = element('div', { className: 'squad-quick-chat', attrs: { 'aria-label': '快速發言' } }, squad.quickChat.map((text) => button(text, () => client.send({ type: 'say', text }), 'secondary')));
  const asks = Math.max(0, squad.timing.advisorAsksPerChapter - room.advisorAsks);
  const advisorButton = button('AI', () => client.send({ type: 'askAdvisor' }), 'secondary', { disabled: asks <= 0, 'aria-label': `${label.askAdvisor}，剩 ${asks} 次`, title: label.askAdvisor });
  const advisorAction = element('span', { className: 'squad-advisor-action' }, [advisorButton, element('small', { text: `${asks}` })]);
  const clueCard = element('section', { className: 'paper-card squad-clue', attrs: { style: `--duty-color:${duty?.color ?? '#1f6f5c'}` } }, [element('div', { className: 'paper-kicker' }, [element('span', { text: label.yourClue }), element('span', { text: duty?.name })]), element('p', { text: ownClue }), button(shown ? label.clueShown : label.showClue, () => client.send({ type: 'showClue' }), 'secondary', { disabled: shown })]);
  const discussion = element('section', { className: 'squad-discussion' }, [element('h2', { className: 'squad-section-title', text: label.teamChat }), chat, element('div', { className: 'squad-chat-dock' }, [quick, element('div', { className: 'squad-chat-compose' }, [chatInput, advisorAction])])]);
  // The log is not in the document yet when this runs, so it has no height to scroll until the next frame.
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  const remaining = room.deadline === null ? null : Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
  const captain = room.seats[room.captainSeat];
  const children = [element('div', { className: 'squad-discuss-meta' }, [remaining === null ? null : element('p', { className: 'squad-countdown', text: `討論剩 ${remaining} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }), element('p', { className: 'squad-captain', text: `${label.captain}：${captain?.name ?? ''}` })]), element('div', { className: 'squad-discuss-layout' }, [element('div', { className: 'squad-discuss-main' }, [element('div', { className: 'chat-bubble' }, [element('p', { className: 'chat-speaker', text: chapter.chat.from }), element('p', { className: 'chat-text', text: chapter.chat.text })]), clueCard, votes]), discussion])];
  const count = Object.keys(room.votes).length;
  setPanel(panel, `${chapter.year}　${label.voted.replace('{n}', count).replace('{total}', active(room))}`, chapter.title, children, 'open');
  panel.classList.add('panel-squad-discuss');
  startCountdown(panel, room.deadline, '討論剩');
  status.textContent = label.voted.replace('{n}', count).replace('{total}', active(room));
}

function active(room) { return room.seats.filter((seat) => seat.kind !== 'empty').length; }

function waitingPerson(member, index, answers) {
  const role = squad.duties.find((item) => item.id === member.duty);
  const done = Object.hasOwn(answers, index);
  return element('div', { className: `squad-waiting-person${done ? ' is-done' : ''}`, attrs: { 'aria-label': `${member.name}，${done ? '已送出' : '等待送出'}` } }, [
    element('span', { className: 'squad-waiting-avatar-wrap' }, [
      avatar(member.name, role?.image, role?.color, `squad-avatar squad-compact-avatar${done ? ' is-done' : ' is-pending'}`),
      done ? element('span', { className: 'squad-waiting-check', text: '✓', attrs: { 'aria-hidden': 'true' } }) : null,
    ]),
    element('span', { text: member.name }),
  ]);
}

function miniGameOption(option) {
  const lines = (Array.isArray(option.lines) ? option.lines : []).filter((line) => typeof line === 'string' && line.trim());
  return element('div', { className: `squad-game-option${lines.length ? ' button-option option-paper-card' : ''}` }, [
    element('strong', { text: option.title }),
    ...lines.flatMap((line, index) => {
      if (index > 0) return [element('span', { className: 'option-lines option-evidence', text: line })];
      const match = line.match(/(\d+(?:\.\d+)?\s*[^\d\s]+)/u);
      if (!match) return [element('span', { className: 'option-lines', text: line })];
      const caption = `${line.slice(0, match.index).trim()} ${line.slice(match.index + match[0].length).trim()}`.trim();
      return [element('span', { className: 'option-metric', text: match[0] }), caption ? element('span', { className: 'option-label', text: caption }) : null];
    }),
  ]);
}

function renderGame(panel, room, seat, client) {
  if (room.phase === 'quick') return renderQuick(panel, room, seat, client);
  const chapter = content.chapters[room.chapter];
  const game = chapter.game;
  const submitted = Object.hasOwn(room.answers, seat);
  const wait = () => setPanel(panel, `${chapter.year}　小互動`, game.prompt, [
    room.deadline === null ? null : element('p', { className: 'squad-countdown', text: `剩餘 ${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }),
    element('div', { className: 'squad-waiting-avatars' }, room.seats.map((member, index) => waitingPerson(member, index, room.answers))),
    element('p', { className: 'panel-copy', text: format(label.waitingMates, { n: Object.keys(room.answers).length, total: active(room) }) }),
  ], 'open');
  if (submitted) { const result = wait(); startCountdown(panel, room.deadline, '剩餘'); return result; }
  const answer = (value) => client.send({ type: 'answer', answer: value });
  const options = game.options ?? [];
  const children = [];
  if (room.deadline !== null) children.push(element('p', { className: 'squad-countdown', text: `剩餘 ${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }));
  if (game.type === 'pick' || game.type === 'agent') children.push(element('div', { className: `option-grid squad-game-options count-${options.length}${options.length === 3 ? ' option-grid-compact' : ''}` }, options.map((option, index) => {
    const choice = button('', () => answer(index), 'option', { 'aria-label': option.title });
    choice.append(miniGameOption(option));
    return choice;
  })));
  else if (game.type === 'slider') {
    const range = element('input', { type: 'range', min: game.min, max: game.max, step: game.step, value: game.start, attrs: { 'aria-label': game.prompt } });
    const value = element('p', { className: 'range-value', text: `${game.start}${game.unit}` });
    range.addEventListener('input', () => { value.textContent = `${range.value}${game.unit}`; });
    children.push(value, range, button('送出答案', () => answer(Number(range.value)), 'primary'));
  } else if (game.type === 'multi') {
    const selected = new Set();
    children.push(element('div', { className: 'multi-options' }, options.map((option, index) => element('button', { className: 'button button-multi-option', type: 'button', text: option.title, attrs: { 'aria-pressed': 'false' }, onClick: (event) => { if (selected.has(index)) selected.delete(index); else selected.add(index); event.currentTarget.setAttribute('aria-pressed', String(selected.has(index))); } }))));
    children.push(button('送出答案', () => answer([...selected]), 'primary'));
  } else if (game.type === 'swipe') {
    const selected = [];
    children.push(...game.cards.map((card, index) => element('div', { className: 'squad-swipe-card' }, [element('p', { text: card }), button(game.left, () => { selected[index] = 'left'; }, 'secondary'), button(game.right, () => { selected[index] = 'right'; }, 'secondary')])), button('送出答案', () => answer(selected), 'primary'));
  } else if (game.type === 'stop') {
    const range = element('input', { type: 'range', min: 1, max: game.ticks + 1, value: 1, attrs: { 'aria-label': game.prompt } });
    children.push(element('p', { className: 'panel-copy', text: '選擇你認為該喊停的時點。' }), range, button('按停並送出', () => answer(Number(range.value)), 'primary'));
  }
  children.push(element('p', { className: 'panel-copy squad-waiting-count', text: format(label.waitingMates, { n: Object.keys(room.answers).length, total: active(room) }) }));
  setPanel(panel, `${chapter.year}　小互動`, game.prompt, children, 'open');
  panel.classList.add('panel-squad-game');
  startCountdown(panel, room.deadline, '剩餘');
}

function renderQuick(panel, room, seat, client) {
  const question = gamify.quick.questions[room.quickIndex];
  const answered = Object.hasOwn(room.answers, seat);
  const children = answered
    ? [room.deadline === null ? null : element('p', { className: 'squad-countdown', text: `剩餘 ${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }), element('div', { className: 'squad-waiting-avatars' }, room.seats.map((member, index) => waitingPerson(member, index, room.answers))), element('p', { className: 'panel-copy', text: format(label.waitingMates, { n: Object.keys(room.answers).length, total: active(room) }) })]
    : [room.deadline === null ? null : element('p', { className: 'squad-countdown', text: `剩餘 ${Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000))} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }), element('div', { className: 'option-grid count-3' }, question.options.map((option, index) => button(option, () => client.send({ type: 'quickAnswer', answer: index }), 'option'))), element('p', { className: 'panel-copy', text: `${room.quickIndex + 1}／${gamify.quick.questions.length}` })];
  setPanel(panel, '快問快答', question.q, children, 'open');
  panel.classList.add('panel-squad-game');
  if (answered) { startCountdown(panel, room.deadline, '剩餘'); return; }
  startCountdown(panel, room.deadline, '剩餘');
}

function answerText(game, raw) {
  if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'answer')) raw = raw.answer;
  if (Array.isArray(raw)) return raw.map((value) => typeof value === 'number' && game.options?.[value] ? game.options[value].title : value).join('、');
  if (game?.type === 'slider') return `${raw}${game.unit}`;
  if (game?.type === 'stop') return `第 ${raw?.tick ?? raw} 格`;
  return game?.options?.[Number(raw)]?.title ?? String(raw ?? '未作答');
}

function getRevealText(game, answer, correctCount) {
  if (!game) return '';
  if (game.type === 'agent') return answer === game.agentPick ? game.revealSame : game.revealDiff;
  if (game.type === 'swipe' && game.revealByCount) return game.revealByCount.replace('{n}', String((answer ?? []).filter((value) => value === game.countSide).length));
  if (game.type === 'stop') {
    const tick = Number(answer?.tick);
    const report = game.report.start + tick * game.report.perTick;
    const fresh = Math.max(0, game.fresh.start + tick * game.fresh.perTick);
    return tick > 0 && tick <= game.goodUntilTick
      ? game.revealStopped.replace('{fresh}', String(fresh)).replace('{report}', String(report))
      : game.revealNever.replace('{fresh}', String(fresh)).replace('{report}', String(report));
  }
  return game.reveal ?? '';
}

function renderReveal(panel, room, client) {
  const chapter = content.chapters[room.chapter]; const game = chapter.game;
  const participants = room.seats.map((member, index) => { const role = squad.duties.find((item) => item.id === member.duty); const user = room.answers[index]; const text = user ? answerText(game, user) : '逾時'; return element('div', { className: 'squad-answer-person' }, [avatar(member.name, role?.image, role?.color, 'squad-avatar squad-compact-avatar'), element('strong', { text: member.name }), element('span', { className: `squad-answer-text${text === answerText(game, room.teamAnswer) ? ' is-match' : ' is-different'}`, text })]); });
  const answer = answerText(game, room.teamAnswer);
  const bonuses = (room.lastBonuses ?? []).map((bonus) => label[`bonus${bonus[0].toUpperCase()}${bonus.slice(1)}`]);
  const teamReply = chapter.chat.replies[room.teamReply]?.text ?? '';
  const remaining = room.deadline === null ? null : Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000));
  const children = [remaining === null ? null : element('p', { className: 'squad-countdown', text: `揭曉剩 ${remaining} 秒`, attrs: { role: 'timer', 'aria-live': 'off' } }), element('div', { className: 'squad-answer-row' }, participants), element('div', { className: 'squad-team-cards' }, [element('article', { className: 'paper-card squad-team-card' }, [element('span', { className: 'squad-team-card-label', text: label.teamReply }), element('strong', { className: 'squad-team-card-value', text: teamReply })]), element('article', { className: 'paper-card squad-team-card' }, [element('span', { className: 'squad-team-card-label', text: label.teamAnswer }), element('strong', { className: 'squad-team-card-value', text: answer })])]), element('p', { className: `result-note${room.teamCorrect ? '' : ' is-wrong'}`, text: getRevealText(game, room.teamAnswer, room.teamCorrect) }), element('div', { className: 'squad-score-summary' }, [element('strong', { className: 'squad-score-number', text: `+${room.lastAward.toLocaleString('zh-TW')}` }), element('span', { className: 'squad-bonus-list' }, bonuses.map((bonus) => element('span', { className: 'squad-bonus-tag', text: bonus }))), element('span', { className: 'squad-score-caption', text: '本章得分' })]), button('看一句帶走', () => client.send({ type: 'ready' }), 'reveal')];
  setPanel(panel, `${chapter.year}　小組回饋`, label.teamAnswer, children, 'open');
  panel.classList.add('panel-squad-reveal');
  startCountdown(panel, room.deadline, '揭曉剩');
}

function renderTakeaway(panel, room, seat, client) {
  const chapter = content.chapters[Math.min(room.chapter, 9)];
  const board = element('ol', { className: 'squad-leaderboard', attrs: { 'aria-label': '小組排行榜' } });
  const paintBoard = (others = []) => {
    const simulated = Object.fromEntries(gamify.rivals.map((rival) => [rival.name, 0]));
    for (const result of room.results) if (Number.isInteger(result.chapter) && result.chapter < 9) {
      for (let index = 0; index < gamify.rivals.length; index += 1) simulated[gamify.rivals[index].name] += rivalChapterAward(index, result.chapter, room.seed, !room.noTimer);
    }
    if (room.results.filter((result) => Number.isInteger(result.quick)).length === gamify.quick.questions.length) {
      for (let index = 0; index < gamify.rivals.length; index += 1) simulated[gamify.rivals[index].name] += rivalQuickAward(index, room.seed);
    }
    const scores = { [room.teamName]: room.score, ...simulated };
    for (const other of others) if (other.teamName !== room.teamName) scores[other.teamName] = other.score;
    const rows = rankTeams(scores).slice(0, 6).map((team) => element('li', { className: 'squad-rank-row' }, [element('span', { text: `${team.rank}. ${team.name}` }), element('strong', { text: `${team.score.toLocaleString('zh-TW')} 分` })]));
    board.replaceChildren(...rows);
  };
  paintBoard();
  if (client.mode === 'remote') fetch('./api/board', { cache: 'no-store' }).then((response) => response.ok ? response.json() : []).then(paintBoard).catch(() => {});
  const children = [element('section', { className: 'paper-card closing-card' }, [element('div', { className: 'paper-kicker' }, [element('span', { text: `${chapter.year}　一句帶走` }), element('span', { className: 'closing-tag', text: chapter.book })]), element('p', { className: 'takeaway', text: chapter.takeaway }), element('p', { className: 'book-note', text: chapter.source })]), board, element('p', { className: 'panel-copy', text: format(label.readyCount, { n: room.ready.length, total: active(room) }) }), button(label.next, () => client.send({ type: 'ready' }), 'primary')];
  setPanel(panel, `${label.roomCode} ${room.code}`, `${chapter.year}　一句帶走`, children, 'open');
  panel.classList.add('panel-squad-takeaway');
}

function renderReview(panel, room, callbacks) {
  const persona = content.personas.find((item) => item.id === room.teamPersona) ?? content.personas.at(-1);
  const people = room.memberSummaries ?? room.seats.map((member, index) => ({ ...member, seat: index, persona: 'balance' }));
  const yearCells = element('div', { className: 'tenure-progress' }, [element('span', { text: '十年進度' }), element('div', {}, Array.from({ length: 10 }, (_, index) => element('span', { className: index < 10 ? 'is-done' : '' })))]);
  const children = [element('div', { className: 'squad-review-grid' }, [element('section', { className: 'paper-card closing-card' }, [element('div', { className: 'paper-kicker', text: room.teamName }), element('h2', { className: 'takeaway', text: persona.name }), element('p', { className: 'panel-copy', text: persona.strength }), element('p', { className: 'panel-copy', text: persona.blind }), element('strong', { text: `${room.score.toLocaleString('zh-TW')} 分` }), yearCells]), element('div', { className: 'squad-member-review' }, people.map((member) => { const role = squad.duties.find((item) => item.id === member.duty); const individual = content.personas.find((item) => item.id === member.persona); return element('article', { className: 'squad-seat-card' }, [avatar(member.name, role?.image, role?.color, 'squad-avatar squad-review-avatar'), element('div', { className: 'squad-seat-copy' }, [element('strong', { text: member.name }), element('span', { text: role?.name }), element('b', { text: individual?.name ?? '平衡大師' })])]); }))]), button('複製小組結果', () => navigator.clipboard?.writeText(`${room.teamName}｜${room.seats.filter((item) => item.kind !== 'empty').length} 位組員｜${room.score.toLocaleString('zh-TW')} 分｜${persona.name}`).catch(() => {}), 'secondary'), button('再玩一次', callbacks.restart, 'primary'), button(label.leave, callbacks.leave, 'secondary')];
  setPanel(panel, label.teamReview, room.teamName, children, 'open');
  panel.classList.add('panel-squad-review');
}

export function renderSquadScreen({ panel, room, seat, client, callbacks, error = '', entryDefaults = {}, status, connectionText = '' }) {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  if (!room) return entryScreen(panel, callbacks.enter, error, entryDefaults);
  if (room.phase === 'lobby') renderLobby(panel, room, seat, client, callbacks);
  else if (room.phase === 'discuss') renderDiscuss(panel, room, seat, client, status);
  else if (room.phase === 'game') renderGame(panel, room, seat, client);
  else if (room.phase === 'reveal') renderReveal(panel, room, client);
  else if (room.phase === 'takeaway') renderTakeaway(panel, room, seat, client);
  else if (room.phase === 'quick') renderGame(panel, room, seat, client);
  else if (room.phase === 'review') renderReview(panel, room, callbacks);
  if (connectionText) panel.prepend(element('p', { className: 'squad-connection-status', text: connectionText, attrs: { role: 'status' } }));
}

export function renderModeChoice(panel, onSolo, onSquad) {
  setPanel(panel, '', label.modePrompt, [element('div', { className: 'squad-mode-layout' }, [button(label.solo, onSolo, 'primary'), element('div', { className: 'squad-mode-option' }, [button(label.squad, onSquad, 'primary'), element('p', { className: 'panel-copy', text: label.squadNote })])])], 'open');
}
