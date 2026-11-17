import gamify from './gamify-content.js';
import content from './content.js';
import roleConfig from './role-content.js';
import squad from './squad-content.js';
import { chapterTier, personaId, scoreMiniGame, scoreMultiGame, scoreQuick, scoreReply, swipeScoreIsCorrect } from './logic.js';

const clone = (value) => structuredClone(value);
const emptySeat = (duty) => ({ id: `seat-${duty.id}`, name: '', kind: 'empty', duty: duty.id, connected: false, host: false });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = (seed, a = 0, b = 0) => {
  let value = (Number(seed) ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
};
const unit = (seed, a, b) => hash(seed, a, b) / 0x100000000;
const safeText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const allSeats = (room) => room.seats.map((_, i) => i);
const activeSeats = (room) => room.seats.map((seat, i) => seat.kind !== 'empty' ? i : -1).filter((i) => i >= 0);
const isHuman = (room, i) => room.seats[i]?.kind === 'human';
const gameFor = (room) => content.chapters[room.chapter]?.game;
const deadlineFor = (room, now, seconds) => room.noTimer ? null : now + seconds * 1000;
const isExpired = (room, now) => room.deadline !== null && now >= room.deadline;
const REVEAL_DURATION_MS = 12_000;
const finalizeVote = (room, timedOut) => {
  const votes = Object.entries(room.votes).map(([seat, reply]) => [Number(seat), reply]);
  const counts = [0, 1, 2, 3].map((index) => votes.filter(([, reply]) => reply === index).length);
  const max = Math.max(...counts);
  const tied = counts.flatMap((count, index) => count === max ? [index] : []);
  const captainVote = room.votes[room.captainSeat];
  room.teamReply = votes.length === 0 ? 0 : tied.includes(captainVote) ? captainVote : tied[0];
  room.teamCorrect = false;
  const tier = chapterTier(room.chapter) ?? 3;
  const extras = [];
  const real = activeSeats(room);
  const allVoted = real.every((seat) => Object.hasOwn(room.votes, seat));
  if (allVoted && !timedOut) { room.lastAward += squad.bonus.allVoted * tier; extras.push('allVoted'); }
  if (room.cluesShown.length >= 4) { room.lastAward += squad.bonus.showedClues * tier; extras.push('showedClues'); }
  room.lastAward += scoreReply();
  room.lastBonuses = extras;
  room.score += room.lastAward;
};
const chooseDuty = (seats, index) => squad.duties.find((duty) => !seats.some((seat) => seat.duty === duty.id))?.id ?? squad.duties[index % 4].id;
const addMessage = (room, from, text, now, kind = 'say') => {
  const message = safeText(text, squad.timing.chatMaxLength);
  if (message) room.chat.push({ from, text: message, at: now, kind });
  if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
};
const nextPhase = (room, phase, now, seconds = squad.timing.discussSeconds) => {
  room.phase = phase;
  room.deadline = deadlineFor(room, now, seconds);
  room.ready = [];
};
const fillBots = (room) => {
  let bot = 0;
  room.seats = room.seats.map((seat, index) => {
    if (seat.kind !== 'empty') return seat;
    return { ...seat, name: squad.botNames[bot++ % squad.botNames.length], kind: 'ai', connected: true, duty: chooseDuty(room.seats.filter((_, i) => i !== index), index), host: false };
  });
};
const captainFor = (room) => {
  for (let offset = 0; offset < 4; offset += 1) {
    const index = (room.chapter + offset) % 4;
    if (room.seats[index]?.kind !== 'empty') return index;
  }
  return 0;
};
const enterDiscuss = (room, now) => {
  room.captainSeat = captainFor(room);
  room.votes = {};
  room.teamReply = null;
  room.answers = {};
  room.teamAnswer = null;
  room.teamCorrect = false;
  room.ready = [];
  room.cluesShown = [];
  // Each year is its own conversation; last year's clues would read as this year's evidence.
  room.chat = [];
  room.advisorAsks = 0;
  room.advisorPending = false;
  room.lastAward = 0;
  room.lastBonuses = [];
  room.botSchedule = {};
  nextPhase(room, 'discuss', now);
  for (const i of activeSeats(room)) if (room.seats[i].kind === 'ai') room.botSchedule[i] = { clue: now + squad.botClueDelayMs, vote: now + squad.botVoteDelayMs[0] + Math.floor(unit(room.seed, room.chapter, i) * (squad.botVoteDelayMs[1] - squad.botVoteDelayMs[0])), answer: null };
};
const chooseMode = (items, captainChoice, fallback = 0) => {
  const counts = new Map();
  for (const item of items) if (item !== undefined && item !== null) counts.set(item, (counts.get(item) ?? 0) + 1);
  if (!counts.size) return { value: fallback, timeout: true };
  const max = Math.max(...counts.values());
  const tied = [...counts].filter(([, count]) => count === max).map(([value]) => value).sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
  return { value: tied.includes(captainChoice) ? captainChoice : tied[0], timeout: false };
};

export function createRoom({ code = 'LOCAL', seed = 1, teamName = gamify.teams[0] ?? '小組', noTimer = false, now = 0, hostName = '', hostDuty = 'data' } = {}) {
  const seats = squad.duties.map(emptySeat);
  const hostIndex = Math.max(0, squad.duties.findIndex((duty) => duty.id === hostDuty));
  seats[hostIndex] = { ...seats[hostIndex], id: `seat-${hostIndex}`, name: safeText(hostName, squad.timing.nameMaxLength), kind: 'human', connected: true, host: true };
  return { code, seed: Number(seed) >>> 0, revision: 0, teamName: safeText(teamName, 24) || '小組', noTimer: Boolean(noTimer), phase: 'lobby', chapter: 0, quickIndex: 0, seats, captainSeat: hostIndex, deadline: null, chat: [], cluesShown: [], votes: {}, teamReply: null, answers: {}, teamAnswer: null, teamCorrect: false, ready: [], advisorAsks: 0, advisorPending: false, results: [], score: 0, lastAward: 0, lastBonuses: [], teamPerf: 0, memberSummaries: [], botSchedule: {}, disconnectedAt: {} };
}

export function captainMajority(values, captainSeat, fallback = 0) {
  const entries = Object.entries(values ?? {}).map(([seat, value]) => [Number(seat), value]).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return { value: fallback, timeout: true };
  const counts = new Map();
  for (const [, value] of entries) counts.set(value, (counts.get(value) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const tied = [...counts].filter(([, count]) => count === max).map(([value]) => value).sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
  const value = values[captainSeat];
  return { value: tied.includes(value) ? value : tied[0], timeout: false };
}

export function aggregateAnswers(room, answers = room.answers) {
  const game = gameFor(room);
  const pairs = Object.entries(answers ?? {}).map(([seat, entry]) => [Number(seat), entry && typeof entry === 'object' && Object.hasOwn(entry, 'answer') ? entry.answer : entry]).filter(([, answer]) => answer !== undefined && answer !== null);
  if (!pairs.length) return { answer: null, timeout: true, correctCount: 0, answerCount: 0, sync: false };
  const captainSeat = room.captainSeat;
  let answer;
  let correctCount = 0;
  if (game?.type === 'slider' || game?.type === 'stop') {
    const valueOf = (entry) => game.type === 'stop' ? (Number(entry?.tick ?? entry) > 0 ? Number(entry?.tick ?? entry) : (game.ticks ?? 0) + 1) : Number(entry?.value ?? entry);
    const sorted = pairs.map(([, value]) => valueOf(value)).sort((a, b) => a - b);
    answer = sorted[Math.floor((sorted.length - 1) / 2)];
    correctCount = pairs.filter(([, value]) => game.type === 'slider' ? Math.abs(valueOf(value) - game.answer) <= (game.tolerance ?? 0) : valueOf(value) <= (game.goodUntilTick ?? 0)).length;
    if (game.type === 'stop') answer = { tick: answer };
  } else if (game?.type === 'multi') {
    const counts = new Map();
    for (const [, raw] of pairs) for (const option of (Array.isArray(raw) ? raw : raw?.selection ?? [])) counts.set(option, (counts.get(option) ?? 0) + 1);
    const captainSelection = pairs.find(([seat]) => seat === captainSeat)?.[1];
    const captainValues = Array.isArray(captainSelection) ? captainSelection : captainSelection?.selection ?? [];
    answer = [...counts].filter(([option, count]) => count > pairs.length / 2 || (count === pairs.length / 2 && captainValues.includes(option))).map(([option]) => option).sort((a, b) => a - b);
    const expected = game.answers ?? game.correct ?? [];
    correctCount = answer.filter((value) => expected.includes(value)).length;
  } else if (game?.type === 'swipe') {
    const cards = game.cards ?? [];
    answer = cards.map((_, cardIndex) => {
      const votes = Object.fromEntries(pairs.map(([seat, value]) => [seat, Array.isArray(value) ? value[cardIndex] : value?.[cardIndex]]));
      return captainMajority(votes, captainSeat, 'right').value;
    });
    const expected = game.answers ?? game.answersByCard ?? cards.map((card) => card.correct ?? card.answer);
    correctCount = answer.filter((value, index) => value === expected[index]).length;
  } else {
    const votes = Object.fromEntries(pairs.map(([seat, value]) => [seat, Number(value?.index ?? value?.pick ?? value?.answer ?? value)]));
    answer = captainMajority(votes, captainSeat, 0).value;
    correctCount = answer === (game?.answer ?? game?.correct ?? game?.agentPick) ? 1 : 0;
  }
  const captainAnswer = answers[captainSeat];
  const normalized = (value) => JSON.stringify(value);
  const captainValue = captainAnswer && typeof captainAnswer === 'object' && Object.hasOwn(captainAnswer, 'answer') ? captainAnswer.answer : captainAnswer;
  const sync = pairs.length === activeSeats(room).length && pairs.every(([, value]) => normalized(value) === normalized(captainValue));
  return { answer, timeout: false, correctCount, answerCount: pairs.length, sync, pairs };
}

function finishGame(room, now, timedOut) {
  const aggregate = aggregateAnswers(room);
  room.teamAnswer = aggregate.answer;
  const game = gameFor(room);
  if (game?.type === 'swipe') room.teamCorrect = swipeScoreIsCorrect(aggregate.correctCount);
  else if (game?.type === 'multi') room.teamCorrect = JSON.stringify([...(room.teamAnswer ?? [])].sort()) === JSON.stringify([...(game.answers ?? game.correct ?? [])].sort());
  else if (game?.type === 'slider') room.teamCorrect = Math.abs(Number(aggregate.answer) - game.answer) <= game.tolerance;
  else if (game?.type === 'stop') room.teamCorrect = Number(aggregate.answer?.tick) > 0 && Number(aggregate.answer?.tick) <= game.goodUntilTick;
  else room.teamCorrect = aggregate.answer === (game?.answer ?? game?.correct ?? game?.agentPick);
  const chapter = room.chapter;
  const lastSubmission = Object.values(room.answers).sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0)).at(-1);
  const remaining = room.noTimer ? 0 : Number(lastSubmission?.remainingSeconds) || 0;
  const totalSeconds = (game?.seconds ?? 0) + squad.timing.gameExtraSeconds;
  let points;
  if (game?.type === 'multi' || game?.type === 'swipe') points = scoreMultiGame(chapter, { correctCount: aggregate.correctCount, answerCount: game?.type === 'swipe' ? (game.cards?.length ?? 0) : (game.answers ?? game.correct ?? []).length, fullCorrect: room.teamCorrect, remainingSeconds: remaining, totalSeconds, timed: !room.noTimer, timeout: timedOut && aggregate.timeout });
  else points = scoreMiniGame(chapter, { correct: room.teamCorrect, remainingSeconds: remaining, totalSeconds, timed: !room.noTimer, timeout: timedOut && aggregate.timeout });
  const tier = chapterTier(chapter) ?? 3;
  if (!aggregate.timeout && aggregate.sync && room.teamCorrect) { points += squad.bonus.sync * tier; room.lastBonuses.push('sync'); }
  room.lastAward += points;
  room.score += points;
  room.results.push({ chapter, lean: content.chapters[chapter].chat.replies[room.teamReply]?.lean ?? 'perf', scored: Boolean(game?.scored), correct: room.teamCorrect, teamReply: room.teamReply, votes: clone(room.votes), answers: clone(room.answers), teamAnswer: clone(room.teamAnswer), teamCorrect: room.teamCorrect, award: room.lastAward, bonuses: [...room.lastBonuses] });
  room.phase = 'reveal';
  room.deadline = now + REVEAL_DURATION_MS;
  room.ready = [];
}

function addReview(room) {
  const perf = room.results.reduce((sum, result) => sum + (result.lean === 'perf' ? 1 : 0), 0);
  const scored = room.results.filter((result) => result.scored).length;
  const correct = room.results.filter((result) => result.scored && result.correct).length;
  room.teamPerf = perf;
  room.teamPersona = personaId(correct, perf);
  room.memberSummaries = room.seats.map((seat, index) => {
    const votes = room.results.map((result) => result.votes[index]).filter(Number.isInteger);
    const memberPerf = room.results.filter((result) => Number.isInteger(result.chapter) && Number.isInteger(result.votes[index]) && content.chapters[result.chapter]?.chat.replies[result.votes[index]]?.lean === 'perf').length;
    const memberCorrect = room.results.reduce((sum, result) => sum + (result.scored && result.answers[index]?.correct ? 1 : 0), 0);
    return { seat: index, name: seat.name, duty: seat.duty, kind: seat.kind, persona: personaId(memberCorrect, memberPerf) };
  });
}

function nextFromTakeaway(room, now) {
  if (room.chapter === 8) {
    room.chapter = 9;
    room.quickIndex = 0;
    room.answers = {};
    nextPhase(room, 'quick', now, gamify.scoring.quickSeconds);
    room.botSchedule = Object.fromEntries(activeSeats(room).filter((index) => room.seats[index].kind === 'ai').map((index) => [index, { clue: null, vote: null, answer: now + squad.botAnswerDelayMs[0] + Math.floor(unit(room.seed, room.quickIndex, index + 80) * 4000) }]));
    return;
  }
  room.chapter += 1;
  if (room.chapter === 9) { enterDiscuss(room, now); return; }
  if (room.chapter >= 10) { addReview(room); nextPhase(room, 'review', now, 0); return; }
  enterDiscuss(room, now);
}

function finishDiscuss(room, now, timedOut = false) {
  finalizeVote(room, timedOut);
  if (room.chapter === 9) {
    const reply = content.chapters[room.chapter].chat.replies[room.teamReply];
    room.results.push({ chapter: room.chapter, lean: reply.lean, scored: false, correct: false, teamReply: room.teamReply, votes: clone(room.votes), answers: {}, teamAnswer: null, teamCorrect: false, award: room.lastAward, bonuses: [...room.lastBonuses] });
    addReview(room); nextPhase(room, 'review', now, 0);
  }
  else {
    nextPhase(room, 'game', now, (gameFor(room)?.seconds ?? 15) + squad.timing.gameExtraSeconds);
    for (const [index, schedule] of Object.entries(room.botSchedule)) schedule.answer = now + squad.botAnswerDelayMs[0] + Math.floor(unit(room.seed, room.chapter, Number(index) + 40) * (squad.botAnswerDelayMs[1] - squad.botAnswerDelayMs[0]));
  }
}

function finishQuick(room, now) {
  const questions = gamify.quick.questions;
  const question = questions[room.quickIndex];
  const values = Object.fromEntries(Object.entries(room.answers).map(([seat, answer]) => [seat, answer.index]));
  const result = captainMajority(values, room.captainSeat, 0);
  const correct = result.value === question.answer;
  const points = scoreQuick(correct);
  room.score += points;
  room.lastAward = points;
  const memberAnswers = Object.fromEntries(Object.entries(room.answers).map(([seat, answer]) => [seat, { index: answer.index, correct: answer.index === question.answer }]));
  room.results.push({ quick: room.quickIndex, scored: true, votes: clone(values), answers: memberAnswers, teamAnswer: result.value, correct, award: points });
  room.quickIndex += 1;
  room.answers = {};
  if (room.quickIndex >= questions.length) { room.chapter = 9; enterDiscuss(room, now); }
  else {
    nextPhase(room, 'quick', now, gamify.scoring.quickSeconds);
    for (const [index, schedule] of Object.entries(room.botSchedule)) schedule.answer = now + squad.botAnswerDelayMs[0] + Math.floor(unit(room.seed, room.quickIndex, Number(index) + 90) * 4000);
  }
}

function applyMutable(room, action, now) {
  if (!action || typeof action.type !== 'string') return false;
  const seatIndex = Number(action.seat);
  const seat = room.seats[seatIndex];
  switch (action.type) {
    case 'join': {
      if (room.phase !== 'lobby') return false;
      const target = Number.isInteger(seatIndex) && room.seats[seatIndex]?.kind === 'empty' ? seatIndex : room.seats.findIndex((item) => item.kind === 'empty');
      if (target < 0) return false;
      const duty = room.seats[target].duty;
      room.seats[target] = { ...room.seats[target], id: safeText(action.id, 48) || `seat-${target}`, name: safeText(action.name, squad.timing.nameMaxLength) || '組員', kind: 'human', connected: true, host: !room.seats.some((item) => item.host), duty };
      return true;
    }
    case 'leave':
      if (!seat || seat.kind !== 'human') return false;
      room.seats[seatIndex] = { ...emptySeat(squad.duties[seatIndex]), id: `seat-${seatIndex}` };
      return true;
    case 'setTeam': if (!seat?.host || room.phase !== 'lobby') return false; room.teamName = safeText(action.teamName, 24) || room.teamName; return true;
    case 'setNoTimer': if (!seat?.host || room.phase !== 'lobby') return false; room.noTimer = Boolean(action.noTimer); return true;
    case 'start': if (!seat?.host || room.phase !== 'lobby') return false; fillBots(room); enterDiscuss(room, now); return true;
    case 'say': if (!seat || room.phase !== 'discuss') return false; addMessage(room, seatIndex, action.text, now); return true;
    case 'showClue': if (!seat || !['discuss'].includes(room.phase) || room.cluesShown.includes(seatIndex)) return false; room.cluesShown.push(seatIndex); addMessage(room, seatIndex, squad.clues[room.chapter]?.[seat.duty], now, 'clue'); return true;
    case 'vote': if (!seat || !['discuss'].includes(room.phase) || !Number.isInteger(action.reply) || action.reply < 0 || action.reply > 3) return false; room.votes[seatIndex] = action.reply; return true;
    case 'askAdvisor': if (!seat || room.phase !== 'discuss' || room.advisorAsks >= squad.timing.advisorAsksPerChapter) return false; room.advisorAsks += 1; for (const line of advisorRound(room)) addMessage(room, line.from, line.text, now, 'advisor'); return true;
    case 'answer': {
      if (!seat || room.phase !== 'game' || Object.hasOwn(room.answers, seatIndex)) return false;
      const game = gameFor(room);
      const answer = normalizeGameAnswer(game, action.answer);
      if (answer === null) return false;
      const total = Number(game?.seconds ?? 15) + squad.timing.gameExtraSeconds;
      const remainingSeconds = room.noTimer || room.deadline === null ? 0 : clamp((room.deadline - now) / 1000, 0, total);
      room.answers[seatIndex] = { answer, remainingSeconds, correct: isGameAnswerCorrect(game, answer), submittedAt: now };
      return true;
    }
    case 'quickAnswer': if (!seat || room.phase !== 'quick' || Object.hasOwn(room.answers, seatIndex) || !Number.isInteger(action.answer)) return false; room.answers[seatIndex] = { index: action.answer }; return true;
    case 'ready':
      if (!seat || !['takeaway', 'reveal', 'quick'].includes(room.phase)) return false;
      if (room.phase === 'reveal') { nextPhase(room, 'takeaway', now); room.ready = activeSeats(room).filter((index) => room.seats[index].kind === 'ai'); return true; }
      if (room.phase === 'takeaway' && seat.host && room.ready.includes(seatIndex)) { nextFromTakeaway(room, now); return true; }
      if (!room.ready.includes(seatIndex)) room.ready.push(seatIndex);
      return true;
    case 'restart':
      if (!seat?.host || room.phase !== 'review') return false;
      {
        const replay = createRoom({ code: room.code, seed: room.seed, teamName: room.teamName, noTimer: room.noTimer, hostName: room.seats[seatIndex].name, hostDuty: room.seats[seatIndex].duty });
        replay.seats = room.seats.map((member) => ({ ...member, connected: member.kind === 'ai' || member.connected }));
        replay.captainSeat = captainFor(replay);
        Object.assign(room, replay);
      }
      return true;
    case 'rejoin': if (!seat || (seat.kind !== 'human' && !seat.aiBackup)) return false; seat.connected = true; delete room.disconnectedAt[seatIndex]; if (seat.aiBackup) { seat.kind = 'human'; delete seat.aiBackup; delete room.botSchedule[seatIndex]; } return true;
    case 'disconnect': if (!seat || seat.kind !== 'human') return false; seat.connected = false; room.disconnectedAt[seatIndex] = now; return true;
    default: return false;
  }
}

// The two advisors are scripted NPCs. Each year has three rounds, one per allowed question:
// their opening stances, then the price of the two replies the team is split between, then a closing question.
export function advisorRound(room) {
  const script = squad.advisorScripts[room.chapter];
  const open = squad.advisorLines[room.chapter];
  if (room.advisorAsks <= 1 || !script) return [{ from: 'algo', text: open.algo }, { from: 'human', text: open.human }];
  if (room.advisorAsks >= 3) return [{ from: 'algo', text: script.close.algo }, { from: 'human', text: script.close.human }];
  const replies = content.chapters[room.chapter].chat.replies;
  const counts = [0, 1, 2, 3].map((index) => Object.values(room.votes).filter((vote) => vote === index).length);
  const ranked = [0, 1, 2, 3].sort((a, b) => counts[b] - counts[a] || a - b);
  const leading = counts[ranked[0]] > 0 ? ranked[0] : 0;
  // The performance-leaning replies (0, 1) are priced by the human-minded advisor and the brand-leaning ones (2, 3)
  // by the efficiency-minded one, so the second reply always comes from the other side of the argument.
  const otherSide = leading <= 1 ? [2, 3] : [0, 1];
  const rival = otherSide.sort((a, b) => counts[b] - counts[a] || (leading <= 1 ? b - a : a - b))[0];
  const line = (index) => ({ from: index <= 1 ? 'human' : 'algo', text: squad.advisorCostLine.replace('{reply}', replies[index].text).replace('{cost}', script.cost[index]) });
  return [line(leading), line(rival)];
}

export function applyAction(roomInput, action, now = 0) {
  if (!roomInput || !Number.isFinite(now)) return roomInput;
  const room = clone(roomInput);
  if (!applyMutable(room, action, now)) return roomInput;
  room.revision = (roomInput.revision ?? 0) + 1;
  return JSON.stringify(room) === JSON.stringify(roomInput) ? roomInput : room;
}

export function tick(roomInput, now = 0) {
  if (!roomInput || !Number.isFinite(now)) return roomInput;
  const room = clone(roomInput);
  if (room.phase === 'lobby' || room.phase === 'review') return roomInput;
  if (room.phase === 'reveal') {
    if (!isExpired(room, now)) return roomInput;
    nextPhase(room, 'takeaway', now);
    room.ready = activeSeats(room).filter((index) => room.seats[index].kind === 'ai');
    room.revision = (roomInput.revision ?? 0) + 1;
    return room;
  }
  for (const [rawSeat, disconnectedAt] of Object.entries(room.disconnectedAt)) {
    const index = Number(rawSeat);
    const seat = room.seats[index];
    if (seat?.kind === 'human' && now - disconnectedAt >= 20_000) { seat.aiBackup = true; seat.kind = 'ai'; seat.connected = false; room.botSchedule[index] = { clue: now, vote: now + squad.botVoteDelayMs[0], answer: now + squad.botAnswerDelayMs[0] }; }
  }
  if (room.phase === 'discuss' || room.phase === 'game' || room.phase === 'quick') {
    for (const [rawSeat, schedule] of Object.entries(room.botSchedule)) {
      const index = Number(rawSeat);
      if (room.seats[index]?.kind !== 'ai') continue;
      if (room.phase === 'discuss' && schedule.clue <= now && !room.cluesShown.includes(index)) {
        room.cluesShown.push(index); addMessage(room, index, squad.clues[room.chapter]?.[room.seats[index].duty], now, 'clue'); schedule.clue = Infinity;
      }
      if (room.phase === 'discuss' && schedule.vote <= now && !Object.hasOwn(room.votes, index)) {
        const base = squad.botLeanByDuty[room.seats[index].duty] ?? 0;
        const delta = Math.floor(unit(room.seed, room.chapter, index + 10) * 3) - 1;
        const reply = clamp(base + delta, 0, 3);
        room.votes[index] = reply;
        addMessage(room, index, squad.botVoteLine.replace('{reply}', content.chapters[room.chapter]?.chat.replies[reply]?.text ?? String(reply + 1)), now);
        schedule.vote = Infinity;
      }
      if (room.phase === 'quick' && schedule.answer !== null && schedule.answer <= now && !Object.hasOwn(room.answers, index)) {
        const question = gamify.quick.questions[room.quickIndex];
        const correct = unit(room.seed, room.quickIndex, index + 100) < squad.botCorrectRate;
        room.answers[index] = { index: correct ? question.answer : (question.answer + 1) % question.options.length };
        schedule.answer = null;
      }
      if (room.phase === 'game' && schedule.answer !== null && schedule.answer <= now && !Object.hasOwn(room.answers, index)) {
        const game = gameFor(room);
        const correct = unit(room.seed, room.chapter, index + 20) < squad.botCorrectRate;
        const answer = botAnswer(game, correct, room.seed, room.chapter, index);
        room.answers[index] = { answer, remainingSeconds: Math.max(0, ((room.deadline ?? now) - schedule.answer) / 1000), correct, submittedAt: schedule.answer };
        schedule.answer = null;
      }
    }
  }
  for (const [rawSeat, at] of Object.entries(room.disconnectedAt)) {
    const index = Number(rawSeat);
    if (room.seats[index]?.aiBackup && room.phase === 'discuss' && !Object.hasOwn(room.votes, index) && now >= at + 20_000) room.votes[index] = clamp((squad.botLeanByDuty[room.seats[index].duty] ?? 0) + Math.floor(unit(room.seed, room.chapter, index + 9) * 3) - 1, 0, 3);
  }
  const participants = activeSeats(room);
  if (room.phase === 'discuss' && (participants.every((i) => Object.hasOwn(room.votes, i)) || isExpired(room, now))) finishDiscuss(room, now, isExpired(room, now));
  else if (room.phase === 'game' && (participants.every((i) => Object.hasOwn(room.answers, i)) || isExpired(room, now))) finishGame(room, now, isExpired(room, now));
  else if (room.phase === 'takeaway' && (participants.every((i) => room.ready.includes(i)) || (room.ready.some((i) => room.seats[i]?.host) && room.ready.filter((i) => isHuman(room, i)).length >= 2) || isExpired(room, now))) nextFromTakeaway(room, now);
  else if (room.phase === 'quick' && (participants.every((i) => Object.hasOwn(room.answers, i)) || isExpired(room, now))) finishQuick(room, now);
  if (JSON.stringify(room) === JSON.stringify(roomInput)) return roomInput;
  room.revision = (roomInput.revision ?? 0) + 1;
  return room;
}

function botAnswer(game, correct, seed, chapter, seat) {
  if (!game) return null;
  const randomIndex = (count, salt = 0) => Math.floor(unit(seed, chapter, seat + salt) * Math.max(1, count));
  if (game.type === 'multi') { const expected = game.answers ?? game.correct ?? []; const wrong = Array.from({ length: game.options?.length ?? 4 }, (_, index) => index).find((value) => !expected.includes(value)); return correct ? [...expected] : [wrong ?? randomIndex(game.options?.length ?? 4)]; }
  if (game.type === 'swipe') return (game.answers ?? game.answersByCard ?? game.cards?.map((card) => card.correct ?? card.answer) ?? []).map((expected) => correct ? expected : (expected === 'left' ? 'right' : 'left'));
  if (game.type === 'slider') {
    if (correct) return game.answer;
    const step = game.step ?? 1;
    const above = game.answer + (game.tolerance ?? 0) + step;
    const below = game.answer - (game.tolerance ?? 0) - step;
    return above <= game.max ? above : below >= game.min ? below : game.min;
  }
  if (game.type === 'stop') return correct ? game.goodUntilTick : (game.goodUntilTick ?? 1) + 1;
  const answer = game.answer ?? game.correct ?? game.agentPick ?? 0;
  return correct ? answer : (answer + 1) % (game.options?.length ?? 4);
}

function normalizeGameAnswer(game, raw) {
  if (!game) return null;
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw.index ?? raw.pick ?? raw.value ?? raw.tick ?? raw.selection ?? raw.answer) : raw;
  if (game.type === 'pick' || game.type === 'agent') return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < game.options.length ? Number(value) : null;
  if (game.type === 'slider') return Number.isFinite(Number(value)) && Number(value) >= game.min && Number(value) <= game.max ? Number(value) : null;
  if (game.type === 'stop') return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= game.ticks + 1 ? Number(value) : null;
  if (game.type === 'multi') {
    const values = Array.isArray(value) ? value : value?.selection;
    if (!Array.isArray(values) || values.some((index) => !Number.isInteger(index) || index < 0 || index >= game.options.length)) return null;
    return [...new Set(values)].sort((a, b) => a - b);
  }
  if (game.type === 'swipe') {
    if (!Array.isArray(value) || value.length !== game.cards.length || value.some((side) => !['left', 'right'].includes(side))) return null;
    return value.slice();
  }
  return null;
}

function isGameAnswerCorrect(game, answer) {
  if (game.type === 'pick') return answer === game.answer;
  if (game.type === 'agent') return answer === game.agentPick;
  if (game.type === 'slider') return Math.abs(answer - game.answer) <= game.tolerance;
  if (game.type === 'stop') return answer <= game.goodUntilTick;
  if (game.type === 'multi') return JSON.stringify(answer) === JSON.stringify([...(game.answers ?? [])].sort((a, b) => a - b));
  if (game.type === 'swipe') return (game.answers ?? game.answersByCard ?? []).filter((value, index) => value === answer[index]).length >= 3;
  return false;
}

export function roomPersona(room) {
  const scored = room.results.filter((result) => result.scored);
  return personaId(scored.filter((result) => result.correct).length, room.results.filter((result) => result.lean === 'perf').length);
}
