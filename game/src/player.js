// player.js — the human combatant: movement, collision, health, armour.
//
// The feel is deliberate: acceleration toward the wish direction, friction when keys
// release, weak air control. Standing still is accurate — weapon.js reads speed2D and
// scales spread with it, so stopping to shoot is always the better play.

import { CONFIG } from './config.js';

const P = CONFIG.player;

export function createPlayer(world) {
  const state = {
    pos: { x: 0, y: 0, z: 23 },   // feet
    vel: { x: 0, y: 0, z: 0 },
    yaw: Math.PI,                  // face north (-z), toward the sites
    pitch: 0,
    grounded: true,
    crouching: false,
    height: P.height,
    health: P.maxHealth,
    armor: 0,
    alive: true,
    team: 'attackers',
    speed2D: 0,
  };

  function respawn(x, z, yaw, team) {
    state.pos.x = x;
    state.pos.y = 0;
    state.pos.z = z;
    state.vel.x = 0; state.vel.y = 0; state.vel.z = 0;
    state.yaw = yaw;
    state.pitch = 0;
    state.grounded = true;
    state.crouching = false;
    state.height = P.height;
    state.health = P.maxHealth;
    state.alive = true;
    state.team = team;
    state.speed2D = 0;
  }

  function applyDamage(amount) {
    if (!state.alive) return { died: false };
    let toHealth = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, amount * 0.5);
      state.armor -= absorbed;
      toHealth -= absorbed;
    }
    state.health -= toHealth;
    if (state.health > 0) return { died: false };
    state.health = 0;
    state.alive = false;
    return { died: true };
  }

  // dt is always CONFIG.fixedStep; the input shape is input.state's.
  function tick(input, dt) {
    if (!state.alive) return;

    // crouch: eye height eases between the two poses
    const wantHeight = input.state.crouch ? P.crouchHeight : P.height;
    const rise = 5.5 * dt * P.height;
    state.height += Math.max(-rise, Math.min(rise, wantHeight - state.height));
    state.crouching = state.height < (P.height + P.crouchHeight) / 2;

    // wish direction in world space (yaw 0 faces -z)
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    let wishX = -sin * input.state.forward + cos * input.state.strafe;
    let wishZ = -cos * input.state.forward - sin * input.state.strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) { wishX /= wishLen; wishZ /= wishLen; }

    const maxSpeed = state.crouching ? P.crouchSpeed : P.standSpeed;
    const rate = Math.min(1, (state.grounded ? P.accel : P.accel * P.airControl) * dt / maxSpeed);
    state.vel.x += (wishX * maxSpeed - state.vel.x) * rate;
    state.vel.z += (wishZ * maxSpeed - state.vel.z) * rate;

    // friction only when the keys are up, so released movement stops crisply
    if (wishLen === 0 && state.grounded) {
      const drop = Math.max(0, 1 - P.friction * dt);
      state.vel.x *= drop;
      state.vel.z *= drop;
    }

    if (input.state.jump && state.grounded) {
      state.vel.y = P.jumpSpeed;
      state.grounded = false;
    }
    state.vel.y -= P.gravity * dt;

    state.grounded = world.moveWithCollisions(state.pos, state.vel, dt, P.radius, state.height);
    if (state.grounded && state.vel.y < 0) state.vel.y = 0;
    state.speed2D = Math.hypot(state.vel.x, state.vel.z);
  }

  function look(dx, dy, sensitivity) {
    state.yaw -= dx * sensitivity;
    state.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.01;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }

  function applyToCamera(camera) {
    camera.position.set(state.pos.x, state.pos.y + state.height - 0.12, state.pos.z);
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }

  return { state, respawn, tick, look, applyToCamera, applyDamage };
}
