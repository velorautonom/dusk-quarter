// weapon.js — the player's arsenal and its fire loop.
//
// Holds ammo per weapon, the viewmodel, recoil that accumulates while the trigger is
// down and decays after, spread derived from movement and crouch, reload timing, and
// grenade projectiles. Hit resolution is *not* here: tick() hands each shot to the
// caller's fire callback, because bullets have to test bots and map geometry that this
// module knows nothing about.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export const SLOT_RIFLE = 1;
export const SLOT_SMG = 2;
export const SLOT_PISTOL = 3;
export const SLOT_GRENADE = 4;

const W = CONFIG.weapons;
const SLOT_KEY = { [SLOT_RIFLE]: 'rifle', [SLOT_SMG]: 'smg', [SLOT_PISTOL]: 'pistol' };

export function createWeapon(scene, camera, random) {
  // --- viewmodel -------------------------------------------------------------
  const view = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x272b2e });
  const wood = new THREE.MeshLambertMaterial({ color: 0x7d6042 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.085, 0.40), steel);
  receiver.position.z = -0.18;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.24), steel);
  barrel.position.set(0, 0.012, -0.47);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.09), wood);
  stock.position.set(0, -0.09, -0.03);
  stock.rotation.x = 0.28;
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.055), wood);
  magazine.position.set(0, -0.10, -0.22);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.06), steel);
  sight.position.set(0, 0.06, -0.22);
  view.add(receiver, barrel, stock, magazine, sight);
  view.position.set(0.15, -0.13, -0.26);
  camera.add(view);
  const viewRest = view.position.clone();

  const flash = new THREE.PointLight(0xffc070, 0, 6, 2);
  flash.position.set(0.15, -0.10, -0.62);
  camera.add(flash);

  // --- inventory -------------------------------------------------------------
  const owned = { rifle: false, smg: false, pistol: true };
  const grenades = { count: 0 };
  const ammo = {
    [SLOT_RIFLE]: { mag: 0, reserve: 0 },
    [SLOT_SMG]: { mag: 0, reserve: 0 },
    [SLOT_PISTOL]: { mag: W.pistol.magSize, reserve: W.pistol.reserve },
  };
  const state = {
    held: SLOT_PISTOL,
    cooldown: 0,
    reloadLeft: 0,
    recoilPitch: 0,     // accumulated muzzle climb, radians
    recoilYaw: 0,
    kick: 0,            // viewmodel punch, visual only
    spread: 0,          // last computed cone, the HUD reads this
    live: [],           // in-flight grenades
  };

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const grenadeGeo = new THREE.SphereGeometry(0.105, 8, 6);
  const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x3b4a33 });

  function defOf(slot) {
    const key = SLOT_KEY[slot];
    return key ? W[key] : W.grenade;
  }

  function give(slot) {
    if (slot === SLOT_GRENADE) {
      grenades.count = Math.min(W.grenade.maxCarry, grenades.count + 1);
      return;
    }
    const key = SLOT_KEY[slot];
    owned[key] = true;
    ammo[slot].mag = W[key].magSize;
    ammo[slot].reserve = W[key].reserve;
    state.held = slot;
    state.reloadLeft = 0;
    state.cooldown = 0.2;
  }

  function switchTo(slot) {
    if (slot === state.held) return;
    if (slot === SLOT_GRENADE) { if (grenades.count <= 0) return; }
    else if (!owned[SLOT_KEY[slot]]) return;
    state.held = slot;
    state.reloadLeft = 0;
    state.cooldown = 0.3;
  }

  function startReload() {
    if (state.held === SLOT_GRENADE || state.reloadLeft > 0) return;
    const def = defOf(state.held);
    const clip = ammo[state.held];
    if (clip.mag >= def.magSize || clip.reserve <= 0) return;
    state.reloadLeft = def.reloadTime;
  }

  function finishReload() {
    const def = defOf(state.held);
    const clip = ammo[state.held];
    const moved = Math.min(def.magSize - clip.mag, clip.reserve);
    clip.mag += moved;
    clip.reserve -= moved;
  }

  // Cone size: base + speed + recoil; crouching tightens it, being airborne wrecks it.
  function spreadFor(def, shooter) {
    const speedFrac = Math.min(1, shooter.speed2D / CONFIG.player.standSpeed);
    let s = def.baseSpread + speedFrac * def.moveSpread + state.recoilPitch * 0.85;
    if (!shooter.grounded) s += 0.075;
    if (shooter.crouching) s *= 0.62;
    return s;
  }

  function fireOne(def, shooter, onShot) {
    const spread = spreadFor(def, shooter);
    state.spread = spread;

    // Two independent offsets inside the cone, plus the accumulated recoil so a spray
    // walks up and to the side instead of staying on the first bullet's line.
    const yaw = shooter.yaw + (random() - 0.5) * 2 * spread + state.recoilYaw;
    const pitch = shooter.pitch + (random() - 0.5) * 2 * spread + state.recoilPitch;
    const cosPitch = Math.cos(pitch);
    dir.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
    origin.set(shooter.pos.x, shooter.pos.y + shooter.eyeHeight - 0.08, shooter.pos.z);

    state.recoilPitch += def.recoilPerShot * (0.85 + random() * 0.3);
    state.recoilYaw += (random() - 0.5) * def.recoilH * 2;
    state.kick = 1;
    flash.intensity = 2.6;
    onShot(origin, dir, def);
  }

  // Fixed tick. ctx: { shooter, onShot(origin, dir, def), onExplode(pos, def) }
  function tick(dt, ctx) {
    const shooter = ctx.shooter;
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.kick = Math.max(0, state.kick - 9 * dt);
    flash.intensity = Math.max(0, flash.intensity - 70 * dt);

    const def = defOf(state.held);
    const recover = def.recoilRecover ?? 7;
    state.recoilPitch = Math.max(0, state.recoilPitch - state.recoilPitch * recover * dt);
    state.recoilYaw *= Math.max(0, 1 - 7 * dt);

    if (state.reloadLeft > 0) {
      state.reloadLeft -= dt;
      if (state.reloadLeft <= 0) { state.reloadLeft = 0; finishReload(); }
    }

    if (shooter.fireHeld && state.held !== SLOT_GRENADE && state.cooldown <= 0 && state.reloadLeft <= 0) {
      const clip = ammo[state.held];
      if (clip.mag > 0) {
        clip.mag -= 1;
        state.cooldown = def.fireInterval;
        fireOne(def, shooter, ctx.onShot);
        if (clip.mag === 0 && clip.reserve > 0) startReload();
      } else {
        state.cooldown = 0.35;   // dry click, no auto-reload spam
      }
    }

    for (let i = state.live.length - 1; i >= 0; i--) {
      const g = state.live[i];
      g.fuse -= dt;
      g.vel.y -= CONFIG.player.gravity * dt;
      const p = g.mesh.position;
      p.x += g.vel.x * dt;
      p.y += g.vel.y * dt;
      p.z += g.vel.z * dt;
      if (p.y < 0.11) { p.y = 0.11; g.vel.y = Math.abs(g.vel.y) * 0.4; g.vel.x *= 0.68; g.vel.z *= 0.68; }
      if (Math.abs(p.x) > 28.5) { p.x = Math.sign(p.x) * 28.5; g.vel.x *= -0.45; }
      if (Math.abs(p.z) > 28.5) { p.z = Math.sign(p.z) * 28.5; g.vel.z *= -0.45; }
      if (g.fuse <= 0) {
        ctx.onExplode(p, W.grenade);
        scene.remove(g.mesh);
        state.live.splice(i, 1);
      }
    }
  }

  // Throw from the eye, aimed along the crosshair with a little upward bias so a flat
  // throw still arcs. Returns false when the player has none left.
  function throwGrenade(shooter) {
    if (grenades.count <= 0) return false;
    grenades.count -= 1;
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.set(shooter.pos.x, shooter.pos.y + shooter.eyeHeight - 0.2, shooter.pos.z);
    scene.add(mesh);
    const speed = W.grenade.throwSpeed;
    const cosPitch = Math.cos(shooter.pitch);
    state.live.push({
      mesh,
      fuse: W.grenade.fuse,
      vel: {
        x: -Math.sin(shooter.yaw) * cosPitch * speed,
        y: Math.sin(shooter.pitch) * speed + 2.6,
        z: -Math.cos(shooter.yaw) * cosPitch * speed,
      },
    });
    return true;
  }

  function readout() {
    if (state.held === SLOT_GRENADE) {
      return { mag: grenades.count, reserve: 0, name: W.grenade.name, grenade: true };
    }
    const clip = ammo[state.held];
    return { mag: clip.mag, reserve: clip.reserve, name: defOf(state.held).name, grenade: false };
  }

  // Render-rate cosmetics: weapon sway from movement, reload dip, recoil punch.
  function animate(dt, speed2D) {
    const sway = Math.sin(performance.now() * 0.006) * Math.min(0.02, speed2D * 0.004);
    view.position.set(viewRest.x + sway, viewRest.y + Math.abs(sway) * 0.5, viewRest.z + state.kick * 0.045);
    let reloadDip = 0;
    if (state.reloadLeft > 0) {
      const def = defOf(state.held);
      reloadDip = Math.sin((1 - state.reloadLeft / def.reloadTime) * Math.PI) * 0.35;
    }
    view.rotation.set(state.kick * 0.07 - reloadDip, 0, reloadDip * 0.5);
  }

  function resetLoadout() {
    owned.rifle = false;
    owned.smg = false;
    owned.pistol = true;
    grenades.count = 0;
    ammo[SLOT_RIFLE].mag = 0; ammo[SLOT_RIFLE].reserve = 0;
    ammo[SLOT_SMG].mag = 0; ammo[SLOT_SMG].reserve = 0;
    ammo[SLOT_PISTOL].mag = W.pistol.magSize; ammo[SLOT_PISTOL].reserve = W.pistol.reserve;
    state.held = SLOT_PISTOL;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    for (const g of state.live) scene.remove(g.mesh);
    state.live.length = 0;
  }

  return {
    state, owned, grenades,
    give, switchTo, startReload, throwGrenade, tick, animate, readout, resetLoadout,
    slots: { SLOT_RIFLE, SLOT_SMG, SLOT_PISTOL, SLOT_GRENADE },
  };
}
