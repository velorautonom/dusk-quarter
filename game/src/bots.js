// bots.js — the other nine combatants: four attackers (with the player) and five defenders.
//
// A bot is a body plus a small state machine driven over the map's waypoint graph:
//
//   push     walk the graph toward this round's objective (attackers: the chosen site,
//            defenders: a hold point on their site)
//   hold     stand at the objective, sweep the approach with its view
//   engage   an enemy is in the vision cone with clear line of sight: turn, strafe,
//            fire with distance- and movement-scaled inaccuracy
//   cover    below CONFIG.bots.coverHealth: break the sightline and sit behind geometry
//   work     plant or defuse, channelled, cancelled when interrupted
//
// Vision and hearing are both real: vision is a cone plus a raycast through the same
// collider list the player collides against, hearing is a radius event fired by every
// gunshot. Bots that hear a shot they cannot see walk to it.

import * as THREE from 'three';
import { CONFIG, ATTACKERS, DEFENDERS } from './config.js';
import { PALETTE } from './palette.js';

const B = CONFIG.bots;
const P = CONFIG.player;

export function createBots(scene, world, random) {
  const bots = [];

  // Shared geometry — one allocation for the whole roster.
  const geo = {
    head: new THREE.SphereGeometry(0.155, 10, 8),
    torso: new THREE.BoxGeometry(0.5, 0.6, 0.3),
    hips: new THREE.BoxGeometry(0.42, 0.26, 0.26),
    leg: new THREE.BoxGeometry(0.16, 0.68, 0.18),
    arm: new THREE.BoxGeometry(0.13, 0.52, 0.14),
  };
  const mat = {
    skin: new THREE.MeshLambertMaterial({ color: 0xc2ab8c }),
    boot: new THREE.MeshLambertMaterial({ color: 0x23282b }),
    [ATTACKERS]: new THREE.MeshLambertMaterial({ color: PALETTE.attacker }),
    [DEFENDERS]: new THREE.MeshLambertMaterial({ color: PALETTE.defender }),
  };

  function buildBody(team) {
    const group = new THREE.Group();
    const teamMat = mat[team];

    const head = new THREE.Mesh(geo.head, mat.skin);
    head.position.y = 1.60;
    const torso = new THREE.Mesh(geo.torso, teamMat);
    torso.position.y = 1.17;
    const hips = new THREE.Mesh(geo.hips, mat.boot);
    hips.position.y = 0.75;
    const legL = new THREE.Mesh(geo.leg, mat.boot);
    legL.position.set(-0.12, 0.34, 0);
    const legR = new THREE.Mesh(geo.leg, mat.boot);
    legR.position.set(0.12, 0.34, 0);
    const armL = new THREE.Mesh(geo.arm, teamMat);
    armL.position.set(-0.31, 1.18, 0);
    const armR = new THREE.Mesh(geo.arm, teamMat);
    armR.position.set(0.31, 1.18, 0);

    for (const part of [head, torso, hips, legL, legR, armL, armR]) {
      part.castShadow = true;
      group.add(part);
    }
    group.rotation.order = 'YXZ';
    scene.add(group);
    return { group, legL, legR, torso };
  }

  function spawn(team, x, z, facing) {
    const bot = {
      isPlayer: false,
      team,
      pos: { x, y: 0, z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: facing,
      eyeHeight: P.height,
      health: P.maxHealth,
      alive: true,
      speed2D: 0,
      grounded: true,
      crouching: false,

      body: buildBody(team),
      phase: random() * 6.28,       // leg-swing offset so the roster does not march in sync

      state: 'push',
      target: null,
      reaction: 0,
      fireCooldown: 0,
      aimError: 0,
      waypoint: 0,
      holdSite: team === DEFENDERS ? (bots.filter((b) => b.team === DEFENDERS).length % 2 ? 'B' : 'A') : null,
      strafeSign: random() < 0.5 ? -1 : 1,
      strafeClock: 0,
      lastSeen: { x, z },
      workProgress: 0,
    };
    bot.waypoint = world.nearestWaypoint(x, z);
    bots.push(bot);
    poseBody(bot, 0);
    return bot;
  }

  // Push simulation state into the meshes. Called after each tick, and once at spawn.
  function poseBody(bot, dt) {
    const g = bot.body.group;
    g.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    g.rotation.y = bot.yaw + Math.PI;

    if (!bot.alive) {
      g.rotation.z = Math.min(Math.PI * 0.5, g.rotation.z + dt * 3.4);
      g.position.y = Math.max(-0.55, bot.pos.y - 0.25);
      return;
    }

    bot.phase += dt * bot.speed2D * 2.4;
    const swing = Math.sin(bot.phase) * Math.min(0.5, bot.speed2D * 0.11);
    bot.body.legL.rotation.x = swing;
    bot.body.legR.rotation.x = -swing;
    // crouched bots fold down visually
    const crouchDrop = bot.crouching ? 0.42 : 0;
    g.position.y = bot.pos.y - crouchDrop;
  }

  // --- perception -----------------------------------------------------------
  const eye = new THREE.Vector3();
  const targetChest = new THREE.Vector3();

  function canSee(bot, other) {
    if (!other.alive) return false;
    const dx = other.pos.x - bot.pos.x;
    const dz = other.pos.z - bot.pos.z;
    const flat = Math.hypot(dx, dz);
    if (flat > B.visionRange || flat < 0.001) return false;

    const facingX = -Math.sin(bot.yaw);
    const facingZ = -Math.cos(bot.yaw);
    if ((dx / flat) * facingX + (dz / flat) * facingZ < B.visionCos) return false;

    eye.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
    targetChest.set(other.pos.x, other.pos.y + 1.15, other.pos.z);
    return world.segmentClear(eye, targetChest);
  }

  // Every gunshot is an audible event. Bots that hear one and cannot see the shooter
  // walk toward it instead of continuing their route.
  function hearShot(x, z, shooterTeam) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === shooterTeam || bot.state === 'engage') continue;
      if (Math.hypot(bot.pos.x - x, bot.pos.z - z) > B.hearingRange) continue;
      bot.lastSeen.x = x;
      bot.lastSeen.z = z;
      bot.waypoint = world.nearestWaypoint(x, z);
      if (bot.state === 'push' || bot.state === 'hold') bot.state = 'investigate';
    }
  }

  // --- navigation -----------------------------------------------------------
  // Walk node to node toward a goal. Returns true once the final node is reached.
  function walkTo(bot, gx, gz, dt, speedScale) {
    const node = world.waypoints[bot.waypoint];
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < B.waypointReach) {
      const goalNode = world.nearestWaypoint(gx, gz);
      if (bot.waypoint === goalNode) return true;
      let next = -1;
      let nextDist = Infinity;
      for (const link of node.links) {
        const wp = world.waypoints[link];
        const d = Math.hypot(wp.x - gx, wp.z - gz);
        if (d < nextDist) { nextDist = d; next = link; }
      }
      if (next >= 0) bot.waypoint = next;
      return false;
    }

    const speed = P.standSpeed * 0.7 * speedScale;
    bot.vel.x = (dx / dist) * speed;
    bot.vel.z = (dz / dist) * speed;
    bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), B.turnSpeed * 0.55 * dt);
    return false;
  }

  function turnToward(from, to, maxStep) {
    let diff = to - from;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return from + Math.max(-maxStep, Math.min(maxStep, diff));
  }

  // --- tick ------------------------------------------------------------------
  // ctx: { siteName, site, bombPlanted, bombPos, botFire(bot, origin, dir, def),
  //        plant(bot, dt) -> planted?, defuse(bot, dt) -> defused?, onKill(shooter, victim) }
  function tick(dt, combatants, ctx) {
    for (const bot of bots) {
      if (!bot.alive) { poseBody(bot, dt); continue; }

      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.reaction = Math.max(0, bot.reaction - dt);
      bot.strafeClock -= dt;
      if (bot.strafeClock <= 0) {
        bot.strafeSign = random() < 0.5 ? -1 : 1;
        bot.strafeClock = 0.55 + random() * 0.8;
      }

      // nearest visible enemy
      let seen = null;
      let seenDist = Infinity;
      for (const other of combatants) {
        if (other === bot || !other.alive || other.team === bot.team) continue;
        if (!canSee(bot, other)) continue;
        const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
        if (d < seenDist) { seenDist = d; seen = other; }
      }

      if (seen) {
        bot.lastSeen.x = seen.pos.x;
        bot.lastSeen.z = seen.pos.z;
        if (bot.target !== seen) {
          bot.target = seen;
          bot.reaction = B.reactionMin + random() * (B.reactionMax - B.reactionMin);
        }
      } else {
        bot.target = null;
      }

      // state selection
      if (bot.target && bot.health <= B.coverHealth) bot.state = 'cover';
      else if (bot.target) bot.state = 'engage';
      else if (bot.state === 'engage' || bot.state === 'cover') bot.state = 'investigate';

      switch (bot.state) {
        case 'engage': engage(bot, bot.target, seenDist, dt, ctx); break;
        case 'cover': seekCover(bot, dt); break;
        case 'investigate': investigate(bot, dt); break;
        default: objectiveWork(bot, dt, ctx); break;
      }

      // shared body integration: gravity, collision, ground snap
      bot.vel.y -= P.gravity * dt;
      bot.grounded = world.moveWithCollisions(bot.pos, bot.vel, dt, P.radius, bot.crouching ? P.crouchHeight : P.height);
      if (bot.grounded && bot.vel.y < 0) bot.vel.y = 0;
      bot.speed2D = Math.hypot(bot.vel.x, bot.vel.z);
      bot.crouching = bot.state === 'hold' || bot.state === 'work';

      poseBody(bot, dt);
    }
  }

  // Route to the objective, then hold it; plant or defuse when the objective calls for it.
  function objectiveWork(bot, dt, ctx) {
    const site = bot.team === ATTACKERS ? ctx.site : world.sites[bot.holdSite];
    const targetX = ctx.bombPlanted && bot.team === DEFENDERS ? ctx.bombPos.x : site.x;
    const targetZ = ctx.bombPlanted && bot.team === DEFENDERS ? ctx.bombPos.z : site.z;

    const arrived = walkTo(bot, targetX, targetZ, dt, bot.team === ATTACKERS ? 1 : 0.9);
    if (!arrived) { bot.state = 'push'; return; }

    bot.state = 'hold';
    bot.vel.x *= 0.2;
    bot.vel.z *= 0.2;

    if (bot.team === ATTACKERS && !ctx.bombPlanted) {
      if (ctx.plant(bot, dt)) bot.state = 'push';
    } else if (bot.team === DEFENDERS && ctx.bombPlanted) {
      ctx.defuse(bot, dt);
    } else {
      // idle sweep: look along the approach the other team would take
      const sweep = Math.sin(performance.now() * 0.0007 + bot.phase) * 0.5;
      bot.yaw = turnToward(bot.yaw, Math.atan2(-(targetX - bot.pos.x), -(targetZ - bot.pos.z)) + sweep, 1.6 * dt);
    }
  }

  function investigate(bot, dt) {
    const arrived = walkTo(bot, bot.lastSeen.x, bot.lastSeen.z, dt, 0.95);
    if (arrived) bot.state = 'push';
    else bot.state = 'investigate';
  }

  function engage(bot, target, dist, dt, ctx) {
    const dx = target.pos.x - bot.pos.x;
    const dz = target.pos.z - bot.pos.z;
    const wantYaw = Math.atan2(-dx, -dz);
    bot.yaw = turnToward(bot.yaw, wantYaw, B.turnSpeed * dt);

    // strafe across the target's view instead of standing still
    const inv = 1 / Math.max(dist, 0.001);
    const perpX = -dz * inv;
    const perpZ = dx * inv;
    let vx = perpX * bot.strafeSign * B.strafeSpeed;
    let vz = perpZ * bot.strafeSign * B.strafeSpeed;
    if (dist < 6) { vx -= dx * inv * 2.4; vz -= dz * inv * 2.4; }
    bot.vel.x = vx;
    bot.vel.z = vz;

    if (bot.reaction > 0 || bot.fireCooldown > 0) return;

    bot.fireCooldown = B.fireDelay + random() * 0.1;

    // inaccuracy grows with range and with the bot's own speed
    const baseError = B.aimError + (bot.speed2D > 1.2 ? B.aimErrorMoving : 0);
    const error = baseError * (0.45 + dist / 35);
    const shotYaw = wantYaw + (random() - 0.5) * 2 * error;
    const dropPitch = Math.atan2(target.pos.y + 1.1 - (bot.pos.y + 1.5), dist);
    const shotPitch = dropPitch + (random() - 0.5) * 2 * error * 0.6;

    const cosPitch = Math.cos(shotPitch);
    eye.set(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
    const dir = new THREE.Vector3(
      -Math.sin(shotYaw) * cosPitch,
      Math.sin(shotPitch),
      -Math.cos(shotYaw) * cosPitch,
    );
    ctx.botFire(bot, eye, dir, CONFIG.weapons.rifle);
  }

  function seekCover(bot, dt) {
    const dx = bot.pos.x - bot.lastSeen.x;
    const dz = bot.pos.z - bot.lastSeen.z;
    const d = Math.hypot(dx, dz) || 1;
    bot.vel.x = (dx / d) * 3.2;
    bot.vel.z = (dz / d) * 3.2;
    bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), B.turnSpeed * dt);
  }

  // --- damage ----------------------------------------------------------------
  // `zone` only matters to the caller's HUD/feed; damage arrives pre-multiplied.
  function applyDamage(bot, amount) {
    if (!bot.alive) return { died: false };
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.vel.x = 0;
      bot.vel.z = 0;
      bot.target = null;
      return { died: true };
    }
    if (bot.state === 'push' || bot.state === 'hold') bot.state = 'cover';
    return { died: false };
  }

  function aliveCount(team) {
    let n = 0;
    for (const bot of bots) if (bot.alive && bot.team === team) n++;
    return n;
  }

  function resetRound(attackerSpawns, defenderSpawns, siteName) {
    let a = 0;
    let d = 0;
    for (const bot of bots) {
      bot.health = P.maxHealth;
      bot.alive = true;
      bot.target = null;
      bot.state = 'push';
      bot.reaction = 0;
      bot.fireCooldown = 0;
      bot.workProgress = 0;
      bot.vel.x = 0; bot.vel.y = 0; bot.vel.z = 0;
      bot.body.group.rotation.z = 0;
      bot.body.group.position.y = 0;
      bot.holdSite = siteName;

      const spawn = bot.team === ATTACKERS
        ? attackerSpawns[a++ % attackerSpawns.length]
        : defenderSpawns[d++ % defenderSpawns.length];
      bot.pos.x = spawn.x + (random() - 0.5) * 1.6;
      bot.pos.z = spawn.z + (random() - 0.5) * 1.6;
      bot.pos.y = 0;
      bot.yaw = bot.team === ATTACKERS ? Math.PI : 0;
      bot.waypoint = world.nearestWaypoint(bot.pos.x, bot.pos.z);
      poseBody(bot, 0);
    }
  }

  return { bots, spawn, tick, hearShot, applyDamage, aliveCount, resetRound, canSee };
}
