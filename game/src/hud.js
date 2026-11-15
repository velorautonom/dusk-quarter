// hud.js — the DOM overlay. Reads state that other modules own; computes only the
// crosshair gap (from the weapon's live spread) and nothing else.

import { CSS } from './palette.js';
import { ATTACKERS, DEFENDERS } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="crosshair"><i></i><i></i><i></i><i></i></div>
    <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
    <div id="topbar">
      <span class="team att" id="score-att">0</span>
      <span id="timer">1:45</span>
      <span class="team def" id="score-def">0</span>
    </div>
    <div id="phase"></div>
    <div id="killfeed"></div>
    <div id="bombline" hidden><span class="dot"></span><span id="bombline-text"></span></div>
    <div id="channel" hidden><div id="channel-fill"></div><span id="channel-label"></span></div>
    <div id="bottombar">
      <div id="vitals">
        <div id="healthbar"><div id="health-fill"></div></div>
        <div id="vitals-text"><span id="health-num">100</span><span id="armor-num"></span></div>
      </div>
      <div id="money">$800</div>
      <div id="ammo"><span id="ammo-mag">12</span><span id="ammo-reserve">/ 48</span><span id="ammo-name"></span></div>
    </div>
  `;

  const byId = (id) => document.getElementById(id);
  const crossArms = byId('crosshair').querySelectorAll('i');
  const hitmarker = byId('hitmarker');
  const timerEl = byId('timer');
  const phaseEl = byId('phase');
  const feedEl = byId('killfeed');
  const healthFill = byId('health-fill');
  const healthNum = byId('health-num');
  const armorNum = byId('armor-num');
  const moneyEl = byId('money');
  const ammoMag = byId('ammo-mag');
  const ammoReserve = byId('ammo-reserve');
  const ammoName = byId('ammo-name');
  const ammoBox = byId('ammo');
  const scoreAtt = byId('score-att');
  const scoreDef = byId('score-def');
  const bombLine = byId('bombline');
  const bombText = byId('bombline-text');
  const channel = byId('channel');
  const channelFill = byId('channel-fill');
  const channelLabel = byId('channel-label');

  let hitTimer = 0;
  let gap = 6;   // smoothed crosshair gap, px

  function clock(t) {
    const s = Math.max(0, Math.ceil(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function tick(game, dt) {
    const rs = game.rounds.state;
    const p = game.player.state;

    const showFuse = game.bomb.state.planted && rs.phase === 'live';
    timerEl.textContent = clock(showFuse ? game.bomb.state.fuse : rs.timer);
    timerEl.classList.toggle('hot', rs.phase === 'live' && rs.timer < 15);
    scoreAtt.textContent = rs.score[ATTACKERS];
    scoreDef.textContent = rs.score[DEFENDERS];

    healthNum.textContent = Math.max(0, Math.ceil(p.health));
    healthFill.style.width = `${p.health}%`;
    healthFill.style.background = p.health < 30 ? CSS.danger : CSS.accent;
    armorNum.textContent = p.armor > 0 ? `+${Math.round(p.armor)}` : '';

    moneyEl.textContent = `$${rs.money[p.team]}`;

    const w = game.weapon.readout();
    ammoMag.textContent = w.grenade ? `${w.mag}×` : w.mag;
    ammoReserve.textContent = w.grenade ? '' : `/ ${w.reserve}`;
    ammoName.textContent = w.name;
    ammoBox.classList.toggle('empty', !w.grenade && w.mag === 0);

    // crosshair gap follows spread, eased so it does not jitter per frame
    const target = 6 + game.weapon.state.spread * 950;
    gap += (target - gap) * Math.min(1, dt * 14);
    crossArms[0].style.transform = `translateY(${-gap}px)`;
    crossArms[1].style.transform = `translateY(${gap}px)`;
    crossArms[2].style.transform = `translateX(${-gap}px)`;
    crossArms[3].style.transform = `translateX(${gap}px)`;

    if (rs.phase === 'matchEnd') {
      phaseEl.textContent = rs.matchWinner === p.team ? 'MATCH WON' : 'MATCH LOST';
      phaseEl.className = 'big';
    } else if (rs.phase === 'roundEnd') {
      const won = rs.result.winner === p.team;
      phaseEl.textContent = `${won ? 'ROUND WON' : 'ROUND LOST'} · ${rs.result.reason}`;
      phaseEl.className = 'big';
    } else if (rs.phase === 'freeze') {
      phaseEl.textContent = `ROUND ${rs.roundNumber} · buy ${clock(rs.timer)}`;
      phaseEl.className = '';
    } else {
      phaseEl.textContent = '';
    }

    if (game.bomb.state.planted) {
      bombLine.hidden = false;
      bombText.textContent = `bomb armed · site ${game.bomb.state.siteName} · ${Math.ceil(game.bomb.state.fuse)}s`;
    } else {
      bombLine.hidden = true;
    }

    if (game.channel) {
      channel.hidden = false;
      channelFill.style.width = `${game.channel.fraction * 100}%`;
      channelLabel.textContent = game.channel.label;
    } else {
      channel.hidden = true;
    }

    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) hitmarker.classList.remove('on');
    }
  }

  function killFeed(text, team) {
    const line = document.createElement('div');
    line.className = 'feedline';
    line.style.borderLeftColor = team === ATTACKERS ? CSS.attacker : CSS.defender;
    line.textContent = text;
    feedEl.prepend(line);
    while (feedEl.children.length > 5) feedEl.lastChild.remove();
    setTimeout(() => line.remove(), 5200);
  }

  function hitmark(kill) {
    hitmarker.classList.add('on');
    hitmarker.classList.toggle('kill', !!kill);
    hitTimer = kill ? 0.22 : 0.1;
  }

  return { tick, killFeed, hitmark };
}
