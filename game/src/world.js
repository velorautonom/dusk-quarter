// world.js — Dusk Quarter, the game's original map, plus the collision and LOS service.
//
// Layout: a central lane ("The Cut") between two side lanes, Attackers spawn south,
// Defenders north. Sites A (west, rust/orange) and B (east, teal) sit in the north
// corners, each with a marked plant zone, crate cover and approach sightlines that
// reward holding an angle. Everything is axis-aligned boxes — cheap to render, cheap
// to collide, and it reads at a glance.
//
// The module owns three things: scene geometry, the AABB collider list, and the
// ray/LOS queries that weapons and bot vision both use. One source of truth for the
// map: bots navigate over the same grid the player collides against.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

// A box collider: axis-aligned, { minX, minY, minZ, maxX, maxY, maxZ }.
export function makeBox(cx, cy, cz, sx, sy, sz) {
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minY: cy,           maxY: cy + sy,   // cy is the base height
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
  };
}

export function createWorld(scene) {
  const colliders = [];   // every solid AABB, used for movement, bullets and vision
  const shootables = [];  // meshes bullets can hit (world geometry)

  // Scratch vectors for the ray queries below — declared before the waypoint build,
  // which is the first caller, and reused so per-tick vision checks allocate nothing.
  const rayInv = new THREE.Vector3();
  const segDir = new THREE.Vector3();

  const materials = {
    floor: new THREE.MeshLambertMaterial({ color: PALETTE.floor }),
    wall: new THREE.MeshLambertMaterial({ color: PALETTE.wall }),
    wallDark: new THREE.MeshLambertMaterial({ color: PALETTE.wallDark }),
    wallTop: new THREE.MeshLambertMaterial({ color: PALETTE.wallTop }),
    crate: new THREE.MeshLambertMaterial({ color: PALETTE.crate }),
    crateTop: new THREE.MeshLambertMaterial({ color: PALETTE.crateTop }),
    prop: new THREE.MeshLambertMaterial({ color: PALETTE.prop }),
    spawn: new THREE.MeshLambertMaterial({ color: PALETTE.spawn }),
    siteA: new THREE.MeshBasicMaterial({ color: PALETTE.siteA, transparent: true, opacity: 0.45 }),
    siteB: new THREE.MeshBasicMaterial({ color: PALETTE.siteB, transparent: true, opacity: 0.45 }),
  };

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // Add a solid box: mesh (with shadows) + collider. `mat` picks the material.
  function solid(cx, baseY, cz, sx, sy, sz, mat, collider = true) {
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(cx, baseY + sy / 2, cz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = sy > 0.5;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collider) colliders.push(makeBox(cx, baseY, cz, sx, sy, sz));
    shootables.push(mesh);
    return mesh;
  }

  // Map extent. The outer walls bound everything; inner geometry carves the lanes.
  const HALF = 30;          // half-width of the play area
  const WALL_H = 3.6;

  // Ground plane (no collider — the sim keeps entities above y=0 itself).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 4, HALF * 2 + 4), materials.floor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // Thin painted line where floor meets wall, for depth cueing.
  function floorStripe(cx, cz, sx, sz, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.02, cz);
    scene.add(m);
  }

  // Perimeter walls.
  solid(0, 0, -HALF - 1, HALF * 2 + 4, WALL_H, 2, materials.wall);
  solid(0, 0, HALF + 1, HALF * 2 + 4, WALL_H, 2, materials.wall);
  solid(-HALF - 1, 0, 0, 2, WALL_H, HALF * 2 + 4, materials.wall);
  solid(HALF + 1, 0, 0, 2, WALL_H, HALF * 2 + 4, materials.wall);

  // --- Central lane "The Cut": two long walls with gaps (chokepoints). ------
  solid(-6, 0, -8, 10, WALL_H, 1.2, materials.wall);   // west of mid gap
  solid(6, 0, -8, 10, WALL_H, 1.2, materials.wall);
  solid(-6, 0, 8, 10, WALL_H, 1.2, materials.wall);
  solid(6, 0, 8, 10, WALL_H, 1.2, materials.wall);
  floorStripe(0, 0, 24, 3.2, materials.wallDark);       // mid seam paint

  // --- Site A (west-north, rust) --------------------------------------------
  const siteA = { x: -20, z: -18, radius: 3.6 };
  solid(-25, 0, -14, 8, WALL_H, 1.2, materials.wall);  // A outer wall
  solid(-14, 0, -22, 1.2, WALL_H, 12, materials.wall); // A inner wall
  solid(-20, 0, -18, 2.4, 1.2, 2.4, materials.crate);  // plant cover crates
  solid(-23, 0, -21, 1.8, 1.8, 1.8, materials.crate);
  solid(-18, 0, -15, 1.8, 2.4, 1.8, materials.crateTop);
  floorStripe(siteA.x, siteA.z, siteA.radius * 2, siteA.radius * 2, materials.siteA);
  const zoneA = new THREE.Mesh(new THREE.PlaneGeometry(siteA.radius * 2, siteA.radius * 2), materials.siteA);
  zoneA.rotation.x = -Math.PI / 2;
  zoneA.position.set(siteA.x, 0.04, siteA.z);
  scene.add(zoneA);

  // --- Site B (east-north, teal) ---------------------------------------------
  const siteB = { x: 20, z: -18, radius: 3.6 };
  solid(25, 0, -14, 8, WALL_H, 1.2, materials.wall);
  solid(14, 0, -22, 1.2, WALL_H, 12, materials.wall);
  solid(20, 0, -18, 2.4, 1.2, 2.4, materials.crate);
  solid(23, 0, -21, 1.8, 1.8, 1.8, materials.crate);
  solid(18, 0, -15, 1.8, 2.4, 1.8, materials.crateTop);
  floorStripe(siteB.x, siteB.z, siteB.radius * 2, siteB.radius * 2, materials.siteB);
  const zoneB = new THREE.Mesh(new THREE.PlaneGeometry(siteB.radius * 2, siteB.radius * 2), materials.siteB);
  zoneB.rotation.x = -Math.PI / 2;
  zoneB.position.set(siteB.x, 0.04, siteB.z);
  scene.add(zoneB);

  // --- Lane connectors: A-long (west edge), B-long (east edge), mid doors. ---
  solid(-27, 0, 2, 1.2, WALL_H, 16, materials.wall);   // A-long inner wall
  solid(27, 0, 2, 1.2, WALL_H, 16, materials.wall);    // B-long inner wall
  solid(-10, 0, -20, 8, 2.8, 1.2, materials.wallDark); // A ramp lip (low wall, can be peeked over)
  solid(10, 0, -20, 8, 2.8, 1.2, materials.wallDark);  // B ramp lip

  // --- Scattered cover: crates and props that break long sightlines. --------
  // [x, z, width, height, depth] — height 2.4 reads as a tall crate, 1.2 as a low one.
  const cover = [
    // mid lane: staggered so the Cut is never a straight sightline
    [-3, -2, 1.8, 1.8, 1.8], [3, 2, 1.8, 1.8, 1.8], [0, 12, 2.4, 1.2, 1.2],
    // A approach
    [-16, -4, 1.8, 1.8, 1.8], [-22, 6, 1.8, 2.4, 1.8], [-25, -6, 1.2, 1.2, 1.2],
    // B approach
    [16, -4, 1.8, 1.8, 1.8], [22, 6, 1.8, 2.4, 1.8], [25, -6, 1.2, 1.2, 1.2],
    // attacker spawn dressing
    [-8, 22, 2.4, 1.2, 2.4], [8, 22, 2.4, 1.2, 2.4], [0, 26, 1.8, 1.8, 1.8],
    [-24, 20, 1.8, 1.8, 1.8], [24, 20, 1.8, 1.8, 1.8],
    // deep corners, so a rot into a site has something to hold
    [-27, -26, 1.8, 1.8, 1.8], [27, -26, 1.8, 1.8, 1.8],
  ];
  for (const [x, z, w, h, d] of cover) {
    solid(x, 0, z, w, h, d, h > 2 ? materials.crateTop : materials.crate);
  }

  // Spawn zone paint (visual only, no colliders).
  floorStripe(0, 24, 18, 8, materials.spawn);
  floorStripe(-20, 20, 10, 6, materials.spawn);
  floorStripe(20, 20, 10, 6, materials.spawn);

  // --- Waypoint graph: hand-placed nodes covering every lane, linked when the
  // straight line between two nodes is clear at chest height. Bots walk these. --
  const nodeDefs = [
    // attackers spawn
    [0, 22], [-8, 22], [8, 22], [-16, 20], [16, 20],
    // mid lane
    [0, 14], [0, 6], [0, 0], [0, -6], [0, -14],
    // A-long
    [-24, 14], [-25, 4], [-24, -6], [-20, -12],
    // B-long
    [24, 14], [25, 4], [24, -6], [20, -12],
    // A site
    [-20, -18], [-16, -18], [-22, -16],
    // B site
    [20, -18], [16, -18], [22, -16],
    // connectors mid->sites
    [-8, -14], [8, -14], [-12, -20], [12, -20],
  ];
  const waypoints = nodeDefs.map(([x, z]) => ({ x, z, links: [] }));

  // Link nodes whose straight path is clear of colliders (chest height).
  const losFrom = new THREE.Vector3();
  const losTo = new THREE.Vector3();
  function walkable(a, b) {
    losFrom.set(a.x, 1.2, a.z);
    losTo.set(b.x, 1.2, b.z);
    return segmentClear(losFrom, losTo);
  }
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      if (walkable(waypoints[i], waypoints[j])) {
        waypoints[i].links.push(j);
        waypoints[j].links.push(i);
      }
    }
  }

  // --- Queries ---------------------------------------------------------------

  // Slab-method ray vs AABB; returns entry distance or -1.
  function rayHit(origin, dir, box, maxDist) {
    let tmin = 0, tmax = maxDist;
    rayInv.set(1 / dir.x, 1 / dir.y, 1 / dir.z);
    let t1 = (box.minX - origin.x) * rayInv.x, t2 = (box.maxX - origin.x) * rayInv.x;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    t1 = (box.minY - origin.y) * rayInv.y; t2 = (box.maxY - origin.y) * rayInv.y;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    t1 = (box.minZ - origin.z) * rayInv.z; t2 = (box.maxZ - origin.z) * rayInv.z;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    return tmax >= tmin ? tmin : -1;
  }

  // True when no collider blocks the segment (used by bot vision and waypoints).
  function segmentClear(from, to) {
    segDir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const dist = segDir.length();
    if (dist < 1e-6) return true;
    segDir.multiplyScalar(1 / dist);
    for (let i = 0; i < colliders.length; i++) {
      const t = rayHit(from, segDir, colliders[i], dist);
      if (t >= 0 && t < dist) return false;
    }
    return true;
  }

  // Cast a bullet: nearest world hit within maxDist, or -1.
  function castRay(origin, dir, maxDist) {
    let best = maxDist;
    for (let i = 0; i < colliders.length; i++) {
      const t = rayHit(origin, dir, colliders[i], best);
      if (t >= 0 && t < best) best = t;
    }
    // ground plane
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) best = t;
    }
    return best < maxDist ? best : -1;
  }

  // Sweep an AABB (a player or bot body) through colliders, axis by axis.
  // `pos` is mutated; returns the landed position. Used by player and bots alike.
  function moveWithCollisions(pos, vel, dt, radius, height) {
    // x axis
    pos.x += vel.x * dt;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (pos.y + height <= b.minY || pos.y >= b.maxY) continue;
      if (pos.z + radius <= b.minZ || pos.z - radius >= b.maxZ) continue;
      if (pos.x + radius > b.minX && pos.x - radius < b.maxX) {
        pos.x = vel.x > 0 ? b.minX - radius : b.maxX + radius;
      }
    }
    // z axis
    pos.z += vel.z * dt;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (pos.y + height <= b.minY || pos.y >= b.maxY) continue;
      if (pos.x + radius <= b.minX || pos.x - radius >= b.maxX) continue;
      if (pos.z + radius > b.minZ && pos.z - radius < b.maxZ) {
        pos.z = vel.z > 0 ? b.minZ - radius : b.maxZ + radius;
      }
    }
    // y axis (landing on top of boxes)
    let grounded = false;
    pos.y += vel.y * dt;
    if (pos.y <= 0) { pos.y = 0; grounded = true; }
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (pos.x + radius <= b.minX || pos.x - radius >= b.maxX) continue;
      if (pos.z + radius <= b.minZ || pos.z - radius >= b.maxZ) continue;
      if (pos.y < b.maxY && pos.y > b.maxY - 0.6 && vel.y <= 0) {
        pos.y = b.maxY; grounded = true;
      }
    }
    // clamp to map bounds
    pos.x = Math.max(-HALF + radius, Math.min(HALF - radius, pos.x));
    pos.z = Math.max(-HALF + radius, Math.min(HALF - radius, pos.z));
    return grounded;
  }

  // Nearest waypoint to a position (linear scan over ~28 nodes — negligible).
  function nearestWaypoint(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const dx = waypoints[i].x - x, dz = waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  return {
    colliders, shootables, waypoints,
    sites: { A: siteA, B: siteB },
    castRay, segmentClear, moveWithCollisions, nearestWaypoint,
    half: HALF, wallHeight: WALL_H,
  };
}
