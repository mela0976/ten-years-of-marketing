import test from 'node:test';
import assert from 'node:assert/strict';
import content from './content.js';
import gamify from './gamify-content.js';
import squad from './squad-content.js';
import { advisorRound, applyAction, aggregateAnswers, captainMajority, createRoom, roomPersona, tick } from './squad-logic.js';
import { isFreshRoomState } from './squad-client.js';
import { personaId } from './logic.js';

const seatedRoom = (chapter = 0, noTimer = true) => {
  const room = createRoom({ seed: 12, noTimer, hostName: '主持', now: 0 });
  room.phase = 'game'; room.chapter = chapter; room.captainSeat = 0;
  room.seats = room.seats.map((seat, index) => ({ ...seat, kind: 'human', connected: true, name: `人${index}` }));
  return room;
};

test('小組房間預設組名沿用 gamify.teams 的字串項目', () => {
  assert.equal(createRoom().teamName, gamify.teams[0]);
  assert.equal(createRoom({ teamName: gamify.teams[2] }).teamName, gamify.teams[2]);
});

test('pick 多數、隊長破同票、隊長未投時取最小索引、無答案逾時', () => {
  let room = seatedRoom();
  assert.deepEqual(aggregateAnswers(room, { 0: 1, 1: 1, 2: 2 }).answer, 1);
  assert.deepEqual(captainMajority({ 0: 2, 1: 1 }, 0), { value: 2, timeout: false });
  assert.deepEqual(captainMajority({ 1: 2, 2: 1 }, 0), { value: 1, timeout: false });
  assert.equal(aggregateAnswers(room, {}).timeout, true);
});

test('multi 僅收過半選項；剛好一半依隊長選擇', () => {
  const room = seatedRoom(6);
  const result = aggregateAnswers(room, { 0: [0, 1], 1: [0, 2], 2: [1, 2], 3: [0, 1, 2] });
  assert.deepEqual(result.answer, [0, 1, 2]);
  assert.deepEqual(aggregateAnswers(room, { 0: [0], 1: [1], 2: [2], 3: [] }).answer, []);
});

test('slider 與 stop 使用偶數樣本時較小的中間值', () => {
  const slider = seatedRoom(1);
  assert.equal(aggregateAnswers(slider, { 0: 2, 1: 4, 2: 6, 3: 8 }).answer, 4);
  slider.chapter = 7;
  assert.deepEqual(aggregateAnswers(slider, { 0: 2, 1: 4, 2: 6, 3: 8 }).answer, { tick: 4 });
  assert.deepEqual(aggregateAnswers(slider, { 0: 2, 1: 4, 2: 6 }).answer, { tick: 4 });
});

test('swipe 每張卡分別多數決，同票看隊長', () => {
  const room = seatedRoom(5);
  const result = aggregateAnswers(room, { 0: ['left', 'left'], 1: ['right', 'left'], 2: ['right', 'right'], 3: ['left', 'right'] });
  assert.deepEqual(result.answer, ['left', 'left', 'right', 'right']);
});

test('改票只保留最後一票；討論結束後不接受票；非主持人不能開始', () => {
  let room = createRoom({ hostName: '主持', now: 0 });
  room = applyAction(room, { type: 'join', seat: 1, name: '組員' }, 0);
  const original = room;
  room = applyAction(room, { type: 'start', seat: 1 }, 1);
  assert.equal(room, original);
  room = applyAction(room, { type: 'start', seat: 0 }, 1);
  room = applyAction(room, { type: 'vote', seat: 0, reply: 0 }, 2);
  room = applyAction(room, { type: 'vote', seat: 0, reply: 3 }, 3);
  assert.equal(room.votes[0], 3);
  room.phase = 'reveal';
  const after = applyAction(room, { type: 'vote', seat: 0, reply: 2 }, 4);
  assert.equal(after, room);
  assert.equal(applyAction(room, { type: 'answer', seat: 0, answer: 1 }, 5), room);
});

test('揭曉固定停留 12 秒；任一座位按看一句帶走即可全組前進', () => {
  const makeReveal = () => {
    let room = seatedRoom(0, true);
    room.phase = 'game';
    room.deadline = null;
    for (let seat = 0; seat < 4; seat += 1) room = applyAction(room, { type: 'answer', seat, answer: content.chapters[0].game.answer }, seat);
    return tick(room, 100);
  };
  const reveal = makeReveal();
  assert.equal(reveal.phase, 'reveal');
  assert.equal(reveal.deadline, 12_100);
  assert.equal(tick(reveal, 12_099), reveal);
  const advanced = applyAction(reveal, { type: 'ready', seat: 2 }, 200);
  assert.equal(advanced.phase, 'takeaway');

  const timedReveal = makeReveal();
  const timedOut = tick(timedReveal, timedReveal.deadline);
  assert.equal(timedOut.phase, 'takeaway');
});

test('每次有效 reducer 更新都增加快照版本，客戶端忽略過期廣播', () => {
  let room = createRoom({ hostName: '主持', now: 0 });
  const initialRevision = room.revision;
  room = applyAction(room, { type: 'start', seat: 0 }, 1);
  assert.equal(room.revision, initialRevision + 1);
  const afterStart = room.revision;
  room = applyAction(room, { type: 'say', seat: 0, text: '版本更新' }, 2);
  assert.equal(room.revision, afterStart + 1);
  const stale = { ...room, revision: initialRevision };
  assert.ok(room.revision > stale.revision);
  assert.equal(isFreshRoomState(room, stale), false);
  assert.equal(isFreshRoomState(stale, room), true);
});

test('say 動作把玩家訊息放進共享討論狀態', () => {
  let room = applyAction(createRoom({ hostName: '主持' }), { type: 'start', seat: 0 }, 1);
  room = applyAction(room, { type: 'say', seat: 0, text: '先看新客比例' }, 2);
  assert.deepEqual(room.chat.at(-1), { from: 0, text: '先看新客比例', at: 2, kind: 'say' });
});

test('disconnect 20 秒改由 AI 接手，rejoin 交還同一席位且分數不變', () => {
  let room = createRoom({ hostName: '主持', noTimer: false, now: 0 });
  room = applyAction(room, { type: 'start', seat: 0 }, 0);
  room = applyAction(room, { type: 'disconnect', seat: 0 }, 10);
  room = tick(room, 20_009);
  assert.equal(room.seats[0].kind, 'human');
  room = tick(room, 20_010);
  assert.equal(room.seats[0].kind, 'ai');
  assert.equal(room.seats[0].aiBackup, true);
  const score = room.score;
  room = applyAction(room, { type: 'rejoin', seat: 0 }, 20_011);
  assert.equal(room.seats[0].kind, 'human');
  assert.equal(room.score, score);
});

test('顧問照三輪劇本回話：立場、拉鋸中兩個回覆的代價、收尾追問；達上限後拒絕', () => {
  let room = createRoom({ hostName: '主持', now: 0 });
  room = applyAction(room, { type: 'start', seat: 0 }, 0);
  const advisorTexts = () => room.chat.filter((entry) => entry.kind === 'advisor').map((entry) => `${entry.from}:${entry.text}`);
  room = applyAction(room, { type: 'askAdvisor', seat: 0 }, 1);
  assert.deepEqual(advisorTexts(), [`algo:${squad.advisorLines[0].algo}`, `human:${squad.advisorLines[0].human}`]);
  // Two votes on reply 0 and one on reply 2: the leading reply and the best-supported reply from the other side get priced.
  room = applyAction(room, { type: 'vote', seat: 0, reply: 0 }, 2);
  room.votes = { 0: 0, 1: 0, 2: 2 };
  room = applyAction(room, { type: 'askAdvisor', seat: 0 }, 3);
  const second = advisorTexts().slice(2);
  assert.equal(second.length, 2);
  assert.ok(second[0].startsWith('human:') && second[0].includes(squad.advisorScripts[0].cost[0]));
  assert.ok(second[1].startsWith('algo:') && second[1].includes(squad.advisorScripts[0].cost[2]));
  room = applyAction(room, { type: 'askAdvisor', seat: 0 }, 4);
  assert.deepEqual(advisorTexts().slice(4), [`algo:${squad.advisorScripts[0].close.algo}`, `human:${squad.advisorScripts[0].close.human}`]);
  assert.equal(applyAction(room, { type: 'askAdvisor', seat: 0 }, 10), room);
});

test('十套顧問劇本齊全：每年四句代價與兩句收尾，沒有票時也說得出兩個方向', () => {
  assert.equal(squad.advisorScripts.length, 10);
  for (const [chapter, script] of squad.advisorScripts.entries()) {
    assert.equal(script.cost.length, 4);
    assert.ok(script.close.algo && script.close.human && squad.advisorLines[chapter].algo && squad.advisorLines[chapter].human);
    const lines = advisorRound({ chapter, advisorAsks: 2, votes: {} });
    assert.deepEqual(lines.map((line) => line.from).sort(), ['algo', 'human']);
  }
});

test('表態、線索與默契加給只在成立條件出現一次且分數不扣減', () => {
  let room = createRoom({ seed: 1, hostName: '主持', noTimer: true });
  room = applyAction(room, { type: 'start', seat: 0 }, 0);
  room = applyAction(room, { type: 'showClue', seat: 0 }, 1);
  for (let t = 2_000; t <= 20_000 && room.phase !== 'game'; t += 2_000) {
    room = tick(room, t);
    if (room.phase === 'discuss' && room.cluesShown.length === 4 && Object.keys(room.votes).length === 3) {
      room = applyAction(room, { type: 'vote', seat: 0, reply: 0 }, t);
      room = tick(room, t);
    }
  }
  assert.ok(room.score >= 0);
  assert.equal(room.phase, 'game');
  assert.ok(room.lastBonuses.includes('allVoted'));
  assert.ok(room.lastBonuses.includes('showedClues'));
});

test('同一輸入的小組人格沿用 personaId 規則', () => {
  const room = { results: [{ scored: true, correct: true, lean: 'perf' }, { scored: true, correct: true, lean: 'brand' }, { scored: true, correct: false, lean: 'perf' }] };
  assert.equal(roomPersona(room), personaId(2, 2));
});

test('500 個種子在可注入時間下不拋錯且分數不減少', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    let room = createRoom({ seed, hostName: '主持', noTimer: false, now: 0 });
    room = applyAction(room, { type: 'start', seat: 0 }, 0);
    let now = 0;
    let priorScore = room.score;
    for (let step = 0; step < 500 && room.phase !== 'review'; step += 1) {
      now += 30_000;
      if (room.phase === 'takeaway') room = applyAction(room, { type: 'ready', seat: 0 }, now);
      else if (room.phase === 'quick') room = applyAction(room, { type: 'quickAnswer', seat: 0, answer: 0 }, now);
      else if (room.phase === 'game') room = applyAction(room, { type: 'answer', seat: 0, answer: { index: content.chapters[room.chapter].game?.answer ?? content.chapters[room.chapter].game?.agentPick ?? 0 }, remainingSeconds: 0 }, now);
      if (room.score < priorScore) assert.fail(`seed ${seed}: score decreased at ${room.phase}`);
      priorScore = room.score;
      room = tick(room, now);
      if (room.score < priorScore) assert.fail(`seed ${seed}: tick reduced score at ${room.phase}`);
      priorScore = room.score;
      if (room.phase === 'discuss') room = applyAction(room, { type: 'vote', seat: 0, reply: seed % 4 }, now);
      if (room.phase === 'reveal') room = tick(room, now + 1);
      if (room.score < priorScore) assert.fail(`seed ${seed}: score decreased after transition`);
      priorScore = room.score;
    }
    assert.equal(room.phase, 'review', `seed ${seed} stuck at ${room.phase}`);
  }
});

test('真人完全不動作時，計時仍讓一人加三位 AI 前進到 review', () => {
  let room = applyAction(createRoom({ seed: 91, hostName: '未操作' }), { type: 'start', seat: 0 }, 0);
  let now = 0;
  let score = room.score;
  for (let step = 0; step < 80 && room.phase !== 'review'; step += 1) {
    now += 60_000;
    room = tick(room, now);
    assert.ok(room.score >= score);
    score = room.score;
  }
  assert.equal(room.phase, 'review');
});
