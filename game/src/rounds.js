// rounds.js — match flow and money.
//
// freeze -> live -> roundEnd -> freeze … until a team reaches CONFIG.rounds.winScore.
// Clock expiry favours the defenders (site-held), elimination and the bomb decide the
// rest. Payouts are flat: win, loss, plant bonus to the winning attackers, defuse award.

import { CONFIG, ATTACKERS, DEFENDERS } from './config.js';

const R = CONFIG.rounds;
const E = CONFIG.economy;

export function createRounds() {
  const state = {
    phase: 'freeze',      // freeze | live | roundEnd | matchEnd
    timer: R.freezeTime,
    roundNumber: 1,
    score: { [ATTACKERS]: 0, [DEFENDERS]: 0 },
    money: { [ATTACKERS]: E.startMoney, [DEFENDERS]: E.startMoney },
    result: null,         // { winner, reason } during roundEnd
    matchWinner: null,
  };

  function startFreeze() {
    state.phase = 'freeze';
    state.timer = R.freezeTime;
    state.result = null;
  }

  function endRound(winner, reason, bombWasPlanted) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.timer = 4.0;
    state.score[winner] += 1;
    state.result = { winner, reason };

    for (const team of [ATTACKERS, DEFENDERS]) {
      let pay = team === winner ? E.winRound : E.lossRound;
      if (team === winner && bombWasPlanted) pay += E.plantBonus;
      state.money[team] = Math.min(E.maxMoney, state.money[team] + pay);
    }
    if (state.score[winner] >= R.winScore) {
      state.phase = 'matchEnd';
      state.matchWinner = winner;
    }
  }

  function awardKill(team, amount) {
    state.money[team] = Math.min(E.maxMoney, state.money[team] + amount);
  }

  function awardDefuse(team) {
    state.money[team] = Math.min(E.maxMoney, state.money[team] + E.defuseBonus);
  }

  function spend(team, amount) {
    if (state.money[team] < amount) return false;
    state.money[team] -= amount;
    return true;
  }

  // The armoury is open through freeze and the first buyTime slice of live.
  function buyOpen() {
    return state.phase === 'freeze'
      || (state.phase === 'live' && state.timer > R.roundTime - R.buyTime);
  }

  function tick(dt) {
    if (state.phase === 'freeze') {
      state.timer -= dt;
      if (state.timer <= 0) { state.phase = 'live'; state.timer = R.roundTime; }
    } else if (state.phase === 'live') {
      state.timer -= dt;
    } else if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.roundNumber += 1;
        startFreeze();
      }
    }
  }

  function resetMatch() {
    state.score[ATTACKERS] = 0;
    state.score[DEFENDERS] = 0;
    state.roundNumber = 1;
    state.money[ATTACKERS] = E.startMoney;
    state.money[DEFENDERS] = E.startMoney;
    state.matchWinner = null;
    startFreeze();
  }

  return { state, endRound, tick, resetMatch, awardKill, awardDefuse, spend, buyOpen };
}
