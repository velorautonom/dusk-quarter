// config.js — every tunable number in one place. Weapons, economy, movement, bots, round flow.
// Nothing else in the game invents a constant: if a value matters to gameplay it lives here.

export const CONFIG = {
  // --- simulation -----------------------------------------------------------
  fixedStep: 1 / 60,          // seconds per simulation tick
  maxSubSteps: 5,             // cap on catch-up steps when a frame runs long

  // --- player movement ------------------------------------------------------
  player: {
    radius: 0.42,             // horizontal collision radius
    height: 1.75,             // standing eye height above feet
    crouchHeight: 1.15,       // crouched eye height
    standSpeed: 6.4,          // max run speed, m/s
    crouchSpeed: 2.9,         // max crouch-walk speed
    airControl: 0.28,         // fraction of ground acceleration while airborne
    accel: 52,                // ground acceleration, m/s^2
    friction: 9.5,            // ground friction deceleration, m/s^2
    gravity: 22,
    jumpSpeed: 7.4,
    maxHealth: 100,
    maxArmor: 100,
  },

  // --- weapons --------------------------------------------------------------
  // damage: [body, head] multipliers apply to base; legs take 0.75x.
  // spread: base cone (radians) added to aim; moveSpread grows with speed.
  weapons: {
    rifle: {
      name: 'LCR-7 Carbine',
      price: 2700,
      damage: 32,
      headMult: 3.0,
      legMult: 0.75,
      magSize: 30,
      reserve: 90,
      fireInterval: 0.098,      // seconds between shots
      reloadTime: 2.2,
      baseSpread: 0.0022,
      moveSpread: 0.052,        // added at full run speed
      recoilPerShot: 0.014,     // vertical kick per shot, radians
      recoilH: 0.006,           // horizontal jitter
      recoilRecover: 7.0,       // recoil decay per second
      range: 90,
      falloff: 0.82,            // damage multiplier at max range
      killAward: 300,
    },
    smg: {
      name: 'Viper-9 SMG',
      price: 1250,
      damage: 24,
      headMult: 2.6,
      legMult: 0.75,
      magSize: 25,
      reserve: 100,
      fireInterval: 0.072,
      reloadTime: 1.9,
      baseSpread: 0.0048,
      moveSpread: 0.030,        // cheap to spray on the move — SMG's identity
      recoilPerShot: 0.010,
      recoilH: 0.008,
      recoilRecover: 8.0,
      range: 60,
      falloff: 0.68,
      killAward: 600,
    },
    pistol: {
      name: 'MK-11 Sidearm',
      price: 0,
      damage: 30,
      headMult: 3.2,
      legMult: 0.7,
      magSize: 12,
      reserve: 48,
      fireInterval: 0.17,
      reloadTime: 1.6,
      baseSpread: 0.0030,
      moveSpread: 0.040,
      recoilPerShot: 0.020,
      recoilH: 0.004,
      recoilRecover: 9.0,
      range: 70,
      falloff: 0.75,
      killAward: 300,
    },
    grenade: {
      name: 'Frag Charge',
      price: 300,
      damage: 88,               // at epicentre, linear falloff to the edge
      radius: 6.5,
      fuse: 1.9,                // seconds from throw to detonation
      throwSpeed: 16,
      maxCarry: 2,
    },
  },

  // starting pistol + knife-equivalent economy
  economy: {
    startMoney: 800,
    maxMoney: 9000,
    winRound: 3250,
    lossRound: 1900,            // flat loss bonus, no streak ladder — simpler, still CS-shaped
    plantBonus: 800,            // to the planter's team on round win via bomb
    defuseBonus: 300,           // personal award to the defuser
  },

  // --- rounds ---------------------------------------------------------------
  rounds: {
    freezeTime: 3.0,            // buy + freeze at round start
    buyTime: 8.0,               // buy menu stays open after unfreeze
    roundTime: 105,             // live phase length
    bombTime: 40,               // fuse after plant
    plantTime: 3.2,             // hold E in site to plant
    defuseTime: 6.0,            // hold E on bomb to defuse
    winScore: 5,                // first to N rounds wins the match
  },

  // --- bots -----------------------------------------------------------------
  bots: {
    perTeam: 4,                 // 4 bots + the player's side handled by team rosters
    reactionMin: 0.16,          // seconds before a newly-seen enemy may fire
    reactionMax: 0.42,
    visionRange: 55,
    visionCos: Math.cos(0.62),  // ~71 degree half-angle cone
    hearingRange: 26,           // gunfire wakes bots through walls
    aimError: 0.055,            // radians of aim wobble at rest
    aimErrorMoving: 0.11,
    fireDelay: 0.12,
    turnSpeed: 7.0,             // rad/s toward target
    strafeSpeed: 3.4,
    coverHealth: 35,            // at or below this HP, seek cover
    waypointReach: 0.9,
  },

  // --- world ----------------------------------------------------------------
  world: {
    wallHeight: 3.6,
    crateSizes: [1.2, 1.8, 2.4],
  },
};

// Team identifiers — original names, CS-shaped roles.
export const ATTACKERS = 'attackers';
export const DEFENDERS = 'defenders';

// Hit zones used by both weapon code and bot damage.
export const ZONE_HEAD = 'head';
export const ZONE_BODY = 'body';
export const ZONE_LEGS = 'legs';
