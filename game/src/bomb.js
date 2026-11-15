// bomb.js — the plant/defuse objective.
//
// One bomb. Attackers channel a plant by holding E inside a site zone; the planted
// case blinks and beeps, faster as the fuse burns. Defenders channel a defuse the same
// way. Both channels break when the actor moves off or releases the key, and only one
// entity may channel the defuse at a time.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE } from './palette.js';

const R = CONFIG.rounds;

export function createBomb(scene, world) {
  const prop = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.22, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x22262a }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent }),
  );
  lamp.position.set(0.13, 0.14, 0);
  const glow = new THREE.PointLight(PALETTE.accent, 0, 5, 2);
  glow.position.y = 0.3;
  prop.add(caseMesh, lamp, glow);
  prop.visible = false;
  scene.add(prop);

  const state = {
    planted: false,
    siteName: null,
    pos: { x: 0, z: 0 },
    fuse: 0,
    beepClock: 0,
    plantProgress: 0,
    defuseProgress: 0,
    planter: null,
    defuser: null,
  };

  function inSite(x, z) {
    for (const name of ['A', 'B']) {
      const site = world.sites[name];
      if (Math.hypot(x - site.x, z - site.z) < site.radius) return name;
    }
    return null;
  }

  // Attacker channel. Returns true on the tick the plant completes.
  function plant(entity, dt) {
    if (state.planted) return false;
    const site = inSite(entity.pos.x, entity.pos.z);
    if (!site) { state.plantProgress = 0; return false; }
    state.plantProgress += dt / R.plantTime;
    if (state.plantProgress < 1) return false;

    state.plantProgress = 0;
    state.planted = true;
    state.siteName = site;
    state.pos.x = entity.pos.x;
    state.pos.z = entity.pos.z;
    state.fuse = R.bombTime;
    state.beepClock = 0;
    state.planter = entity;
    prop.position.set(state.pos.x, 0.11, state.pos.z);
    prop.visible = true;
    return true;
  }

  function cancelPlant(entity) {
    if (state.planter === entity) state.plantProgress = 0;
  }

  // Defender channel. Returns true on the tick the defuse completes.
  function defuse(entity, dt) {
    if (!state.planted) return false;
    if (Math.hypot(entity.pos.x - state.pos.x, entity.pos.z - state.pos.z) > 1.6) {
      cancelDefuse(entity);
      return false;
    }
    if (state.defuser && state.defuser !== entity) return false;
    state.defuser = entity;
    state.defuseProgress += dt / R.defuseTime;
    if (state.defuseProgress < 1) return false;

    state.defuseProgress = 0;
    state.defuser = null;
    state.planted = false;
    prop.visible = false;
    glow.intensity = 0;
    return true;
  }

  function cancelDefuse(entity) {
    if (state.defuser === entity) { state.defuseProgress = 0; state.defuser = null; }
  }

  // Fuse. Returns true on the tick it detonates. `onBeep(fuseLeft)` fires per beep.
  function tick(dt, onBeep) {
    if (!state.planted) return false;
    state.fuse -= dt;

    const frac = Math.max(0, state.fuse / R.bombTime);
    state.beepClock -= dt;
    if (state.beepClock <= 0) {
      state.beepClock = 0.14 + frac * 0.85;
      onBeep(state.fuse);
      glow.intensity = 3.5;
      lamp.material.color.setHex(0xff5040);
    }
    glow.intensity = Math.max(0, glow.intensity - 14 * dt);
    if (glow.intensity < 0.2) lamp.material.color.setHex(PALETTE.accent);

    if (state.fuse > 0) return false;
    state.planted = false;
    prop.visible = false;
    glow.intensity = 0;
    return true;
  }

  function resetRound() {
    state.planted = false;
    state.siteName = null;
    state.fuse = 0;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.planter = null;
    state.defuser = null;
    prop.visible = false;
    glow.intensity = 0;
  }

  return { state, inSite, plant, cancelPlant, defuse, cancelDefuse, tick, resetRound };
}
