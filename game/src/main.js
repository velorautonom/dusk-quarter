// main.js — boot, fixed-step simulation, render loop, and the capture modes used for
// the entry's screenshots (?shot=start|play|end with a seed).
//
// The simulation runs at CONFIG.fixedStep (60 Hz) and never renders; the renderer only
// reads state. Bullet resolution lives here because it is the one place where the
// player's weapon, the bots' weapons, body zoning and the map's colliders all meet.

import * as THREE from 'three';
import { CONFIG, ATTACKERS, DEFENDERS, ZONE_HEAD, ZONE_BODY, ZONE_LEGS } from './config.js';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, SLOT_RIFLE, SLOT_SMG, SLOT_PISTOL, SLOT_GRENADE } from './weapon.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createBomb } from './bomb.js';
import { createBuyMenu } from './buymenu.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '11', 10) || 11;

function mulberry32(s) {
  let a = s;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

// --- renderer, scene, light ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 28, 82);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 170);
scene.add(camera);

const sun = new THREE.DirectionalLight(PALETTE.sun, 1.4);
sun.position.set(-40, 36, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -46;
sun.shadow.camera.right = 46;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0012;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.85));

// --- systems -------------------------------------------------------------------
const world = createWorld(scene);
const input = createInput(renderer.domElement);
const player = createPlayer(world);
const weapon = createWeapon(scene, camera, random);
const bots = createBots(scene, world, random);
const rounds = createRounds();
const bomb = createBomb(scene, world);
const audio = createAudio();

const ATTACKER_SPAWNS = [
  { x: -3, z: 23 }, { x: 0, z: 24 }, { x: 3, z: 23 }, { x: -7, z: 22 },
];
const DEFENDER_SPAWNS = [
  { x: -19, z: -23 }, { x: -16, z: -22 }, { x: -21, z: -22 }, { x: 19, z: -23 }, { x: 16, z: -22 },
];

// The player carries the attackers alongside CONFIG.bots.perTeam bots per side.
for (let i = 0; i < CONFIG.bots.perTeam; i++) {
  const a = ATTACKER_SPAWNS[i % ATTACKER_SPAWNS.length];
  bots.spawn(ATTACKERS, a.x, a.z, Math.PI);
  const d = DEFENDER_SPAWNS[i % DEFENDER_SPAWNS.length];
  bots.spawn(DEFENDERS, d.x, d.z, 0);
}

const playerEntity = {
  isPlayer: true,
  team: ATTACKERS,
  pos: player.state.pos,
  get alive() { return player.state.alive; },
  takeDamage(amount) { return player.applyDamage(amount); },
};
const combatants = [playerEntity, ...bots.bots];

const objective = {
  siteName: 'A',
  site: world.sites.A,
  bombPlanted: false,
  bombPos: { x: 0, z: 0 },
};

// --- bullet resolution -----------------------------------------------------------
// Bodies are zoned by hit height: above 1.45 m is a head (3x), below 0.72 m is legs.
// The world's colliders are tested first; the closest hit wins.
const shotOrigin = new THREE.Vector3();
const blastFrom = new THREE.Vector3();
const blastTo = new THREE.Vector3();

function raySphere(origin, dir, cx, cy, cz, radius, maxDist) {
  const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return (t >= 0 && t <= maxDist) ? t : -1;
}

function rayBodyBox(origin, dir, c, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const bx = c.pos.x, bz = c.pos.z, by = c.pos.y;
  const extents = [
    [bx - 0.30, bx + 0.30, origin.x, dir.x],
    [by + 0.02, by + 1.48, origin.y, dir.y],
    [bz - 0.22, bz + 0.22, origin.z, dir.z],
  ];
  for (const [lo, hi, o, d] of extents) {
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// distance along the ray to the entity's body, or -1
function rayVsEntity(origin, dir, entity, maxDist) {
  const headT = raySphere(origin, dir, entity.pos.x, entity.pos.y + 1.60, entity.pos.z, 0.21, maxDist);
  const bodyT = rayBodyBox(origin, dir, entity, headT >= 0 ? headT : maxDist);
  if (bodyT >= 0 && (headT < 0 || bodyT < headT)) return bodyT;
  return headT;
}

function zoneFromHeight(height) {
  if (height > 1.45) return ZONE_HEAD;
  if (height < 0.72) return ZONE_LEGS;
  return ZONE_BODY;
}

function damageFor(def, distance, zone) {
  const falloffT = Math.min(1, distance / def.range);
  const rangeMult = 1 + (def.falloff - 1) * falloffT;
  const zoneMult = zone === ZONE_HEAD ? def.headMult : zone === ZONE_LEGS ? def.legMult : 1;
  return def.damage * zoneMult * rangeMult;
}

// One bullet. shooter is a combatant; playerShots drive hitmarker/audio feedback.
function castBullet(shooter, origin, dir, def, playerShot) {
  const worldT = world.castRay(origin, dir, def.range);
  let bestT = worldT >= 0 ? worldT : def.range;
  let victim = null;

  for (const c of combatants) {
    if (c === shooter || !c.alive || c.team === shooter.team) continue;
    const t = rayVsEntity(origin, dir, c, bestT);
    if (t >= 0 && t < bestT) { bestT = t; victim = c; }
  }

  if (!victim) return false;

  const hitHeight = origin.y + dir.y * bestT - victim.pos.y;
  const zone = zoneFromHeight(hitHeight);
  const damage = damageFor(def, bestT, zone);
  const outcome = victim.isPlayer
    ? playerEntity.takeDamage(damage)
    : bots.applyDamage(victim, damage);

  if (playerShot) {
    hud.hitmark(outcome.died);
    if (zone === ZONE_HEAD) audio.headshot(); else audio.hit();
  }
  if (outcome.died) onKill(shooter, victim, zone);
  return true;
}

function nameOf(entity) {
  return entity.isPlayer ? 'YOU' : entity.team === ATTACKERS ? 'RAIDER' : 'WARDEN';
}

function onKill(shooter, victim, zone) {
  const def = CONFIG.weapons.rifle;
  rounds.awardKill(shooter.team, shooter.isPlayer ? def.killAward : Math.round(def.killAward * 0.5));
  hud.killFeed(`${nameOf(shooter)} ${zone === ZONE_HEAD ? '✚' : '·'} ${nameOf(victim)}`, shooter.team);
  checkRoundEnd();
}

// --- grenades ----------------------------------------------------------------------
function explodeAt(pos, def) {
  audio.explosion();
  const blast = new THREE.PointLight(0xffb060, 10, 16, 2);
  blast.position.set(pos.x, pos.y + 0.3, pos.z);
  scene.add(blast);
  setTimeout(() => scene.remove(blast), 110);

  blastFrom.set(pos.x, pos.y + 0.25, pos.z);
  for (const c of combatants) {
    if (!c.alive) continue;
    const d = Math.hypot(c.pos.x - pos.x, c.pos.y + 0.95 - pos.y, c.pos.z - pos.z);
    if (d > def.radius) continue;
    blastTo.set(c.pos.x, c.pos.y + 1.0, c.pos.z);
    if (!world.segmentClear(blastFrom, blastTo)) continue;   // a crate stops the blast
    const damage = def.damage * (1 - d / def.radius);
    const outcome = c.isPlayer ? playerEntity.takeDamage(damage) : bots.applyDamage(c, damage);
    if (outcome.died) onKill(playerEntity, c, ZONE_BODY);
  }
  checkRoundEnd();
}

// --- bot combat context ---------------------------------------------------------------
// bombPlanted/bombPos read live from the bomb state below: bots reroute to the
// planted bomb without main.js having to copy fields every frame.
const botCtx = {
  get site() { return objective.site; },
  get bombPlanted() { return bomb.state.planted; },
  get bombPos() { return bomb.state.pos; },
  botFire(bot, origin, dir, def) {
    audio.shot('rifle');
    castBullet(bot, origin, dir, def, false);
    bots.hearShot(bot.pos.x, bot.pos.z, bot.team);
  },
  plant(botEntity, dt) {
    const planted = bomb.plant(botEntity, dt);
    if (planted) audio.bombPlanted();
    return planted;
  },
  defuse(botEntity, dt) { return bomb.defuse(botEntity, dt); },
};

// --- buy menu -----------------------------------------------------------------------
const buyMenu = createBuyMenu((key, price) => {
  if (!rounds.buyOpen() || !rounds.spend(ATTACKERS, price)) return;
  if (key === 'rifle') weapon.give(SLOT_RIFLE);
  else if (key === 'smg') weapon.give(SLOT_SMG);
  else if (key === 'grenade') weapon.give(SLOT_GRENADE);
  else if (key === 'armor') player.state.armor = CONFIG.player.maxArmor;
  buyMenu.refresh(rounds.state.money[ATTACKERS]);
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') {
    if (buyMenu.isOpen()) buyMenu.close();
    else if (rounds.buyOpen()) buyMenu.open(rounds.state.money[ATTACKERS]);
  } else if (e.code === 'Escape' && buyMenu.isOpen()) {
    buyMenu.close();
  } else if (e.code === 'KeyR' && rounds.state.phase === 'matchEnd') {
    rounds.resetMatch();
    startRound();
  }
});

// --- round flow ----------------------------------------------------------------------
function startRound() {
  objective.siteName = random() < 0.5 ? 'A' : 'B';
  objective.site = world.sites[objective.siteName];
  objective.bombPlanted = false;

  player.respawn(ATTACKER_SPAWNS[1].x, ATTACKER_SPAWNS[1].z, Math.PI, ATTACKERS);
  weapon.resetLoadout();
  bots.resetRound(ATTACKER_SPAWNS.slice(1), DEFENDER_SPAWNS, objective.siteName);
  bomb.resetRound();
  game.channel = null;
  if (rounds.buyOpen()) buyMenu.open(rounds.state.money[ATTACKERS]);
  else buyMenu.close();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const attackersLeft = bots.aliveCount(ATTACKERS) + (player.state.alive ? 1 : 0);
  const defendersLeft = bots.aliveCount(DEFENDERS);

  if (defendersLeft === 0) {
    rounds.endRound(ATTACKERS, 'defenders eliminated', bomb.state.planted);
    audio.roundWin();
  } else if (attackersLeft === 0) {
    rounds.endRound(DEFENDERS, 'attackers eliminated', false);
    audio.roundLose();
  }
}

// Player-side plant/defuse channels, feeding the HUD's progress bar.
function updateObjectiveChannel(dt) {
  game.channel = null;
  if (!player.state.alive) return;

  if (!bomb.state.planted) {
    if (input.state.use && bomb.inSite(player.state.pos.x, player.state.pos.z)) {
      if (bomb.plant(player.state, dt)) audio.bombPlanted();
      if (!bomb.state.planted) game.channel = { fraction: bomb.state.plantProgress, label: 'PLANTING' };
    } else {
      bomb.cancelPlant(player.state);
    }
  } else if (player.state.team === DEFENDERS) {
    if (input.state.use) {
      if (bomb.defuse(player.state, dt)) {
        rounds.endRound(DEFENDERS, 'bomb defused', false);
        rounds.awardDefuse(DEFENDERS);
        audio.roundWin();
      }
      if (bomb.state.planted) game.channel = { fraction: bomb.state.defuseProgress, label: 'DEFUSING' };
    } else {
      bomb.cancelDefuse(player.state);
    }
  }
}

// --- the simulation tick ---------------------------------------------------------------
function simulate(dt) {
  const rs = rounds.state;
  rounds.tick(dt);

  // look responds even while frozen or dead, so the player is never locked out
  const { dx, dy } = input.consumeMouse();
  player.look(dx, dy, 0.0022);

  if (rs.phase === 'live') {
    player.tick(input, dt);

    if (input.state.switchWeapon) {
      const slots = { 1: SLOT_RIFLE, 2: SLOT_SMG, 3: SLOT_PISTOL, 4: SLOT_GRENADE };
      weapon.switchTo(slots[input.state.switchWeapon]);
      input.state.switchWeapon = 0;
    }
    if (input.state.reloadPressed) {
      weapon.startReload();
      input.state.reloadPressed = false;
      audio.reloadStart();
    }
    if (input.state.grenadePressed) {
      input.state.grenadePressed = false;
      if (weapon.throwGrenade(player.state)) audio.throwPin();
    }

    updateObjectiveChannel(dt);

    const wasMag = weapon.readout().mag;
    weapon.tick(dt, {
      shooter: {
        pos: player.state.pos,
        yaw: player.state.yaw,
        pitch: player.state.pitch,
        eyeHeight: player.state.height,
        speed2D: player.state.speed2D,
        grounded: player.state.grounded,
        crouching: player.state.crouching,
        fireHeld: input.state.fire && player.state.alive && !buyMenu.isOpen(),
      },
      onShot: (origin, dir, def) => {
        const kind = weapon.state.held === SLOT_PISTOL ? 'pistol' : weapon.state.held === SLOT_SMG ? 'smg' : 'rifle';
        audio.shot(kind);
        castBullet(playerEntity, origin, dir, def, true);
      },
      onExplode: explodeAt,
    });
    if (weapon.readout().mag < wasMag) bots.hearShot(player.state.pos.x, player.state.pos.z, ATTACKERS);

    bots.tick(dt, combatants, botCtx);

    objective.bombPlanted = bomb.state.planted;
    objective.bombPos.x = bomb.state.pos.x;
    objective.bombPos.z = bomb.state.pos.z;

    if (bomb.tick(dt, (fuse) => audio.bombBeep(fuse < 8))) {
      rounds.endRound(ATTACKERS, 'bomb detonated', true);
      audio.roundWin();
    } else if (rs.phase === 'live' && rs.timer <= 0 && !bomb.state.planted) {
      rounds.endRound(DEFENDERS, 'time expired', false);
      audio.roundLose();
    }
  } else {
    // freeze / roundEnd: bots and player idle in place (crouch still eases)
    player.tick({ state: { forward: 0, strafe: 0, jump: false, crouch: input.state.crouch } }, dt);
    if (rs.phase === 'freeze') bots.tick(dt, combatants, botCtx);
  }

  if (rs.phase === 'roundEnd' && rs.timer <= 0) startRound();
}

// --- render loop -------------------------------------------------------------------------
const hud = createHud();
const game = { world, player, weapon, bots, rounds, bomb, hud, audio, input, channel: null };

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  const dtReal = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  accumulator += dtReal;

  let steps = 0;
  while (accumulator >= CONFIG.fixedStep && steps < CONFIG.maxSubSteps) {
    simulate(CONFIG.fixedStep);
    accumulator -= CONFIG.fixedStep;
    steps++;
  }
  if (steps === CONFIG.maxSubSteps) accumulator = 0;   // long stall: drop the backlog

  player.applyToCamera(camera);
  weapon.animate(dtReal, player.state.speed2D);
  hud.tick(game, dtReal);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// --- start screen ---------------------------------------------------------------------------
const overlay = document.getElementById('overlay');
document.getElementById('play').addEventListener('click', () => {
  overlay.hidden = true;
  audio.resume();
  input.requestLock();
  rounds.resetMatch();
  startRound();
  requestAnimationFrame(frame);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- capture modes ---------------------------------------------------------------------------
// ?shot=start  title card over the live map
// ?shot=play   mid-round duel from the attacker ramp
// ?shot=end    a won round with the round banner up
// Each runs a deterministic number of sim ticks with the URL seed, renders twice so
// shadow maps and any first-frame effects settle, then sets window.__shotReady.
function runCapture(mode) {
  overlay.hidden = true;
  rounds.resetMatch();
  startRound();

  if (mode === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 71;
    player.respawn(-14, -2, Math.PI * 0.55, ATTACKERS);
    player.state.health = 76;
    player.state.armor = 100;
    weapon.give(SLOT_RIFLE);
    weapon.give(SLOT_GRENADE);
    for (let i = 0; i < 480; i++) simulate(CONFIG.fixedStep);
    rounds.state.timer = 68;
    hud.killFeed('RAIDER ✚ WARDEN', ATTACKERS);
    hud.killFeed('WARDEN · RAIDER', DEFENDERS);
  } else if (mode === 'end') {
    for (let i = 0; i < 240; i++) simulate(CONFIG.fixedStep);
    rounds.state.phase = 'roundEnd';
    rounds.state.timer = 3.2;
    rounds.state.result = { winner: ATTACKERS, reason: 'bomb detonated' };
    rounds.state.score[ATTACKERS] = 4;
    rounds.state.score[DEFENDERS] = 3;
    hud.killFeed('RAIDER ✚ WARDEN', ATTACKERS);
    player.respawn(-20, -14, Math.PI * 0.15, ATTACKERS);
  }

  player.applyToCamera(camera);
  weapon.animate(0.016, player.state.speed2D);
  hud.tick(game, 0.016);
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
}

if (shotMode) {
  runCapture(shotMode);
} else {
  rounds.resetMatch();
  startRound();
  requestAnimationFrame(frame);
}
