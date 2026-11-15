# Dusk Quarter

A round-based tactical FPS for the browser, built on three.js 0.187. Two teams —
RAIDERS attack, WARDENS hold — fight over a bomb site in short rounds with an
economy: money earned from kills, plants and round outcomes is spent in the
Armoury between rounds.

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01)

## Running it

```sh
node serve.ts
# http://localhost:8080
```

Any static file server pointed at `game/` works; `index.html` loads the game as
plain ES modules with three.js from an import map. Single-player against bots,
no network calls at runtime.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move (sprint with the same keys, crouch Ctrl) |
| Mouse | Aim, click to fire, right-click to hold the breath |
| R | Reload |
| G | Throw a frag charge |
| B | Armoury between rounds |
| 1–4 | Weapon slots |

## How it's put together

Fixed-step simulation at 60 Hz decoupled from rendering; one module per system:

- `world.js` — the map: three lanes, connector routes, site A/B decals, box
  colliders, waypoint graph the bots navigate by.
- `bots.js` — enemy AI: patrol toward the objective, engage on line-of-sight,
  break off to cover at low health, hold angles and hear gunfire.
- `weapon.js` — four weapons with recoil patterns, spread that grows while
  moving and firing, headshot multipliers, reload timings.
- `rounds.js` — round state machine: buy phase, live, round end, match end;
  money economy.
- `bomb.js` — plant/defuse objective with fuse and defuse timers.
- `audio.js` — every sound is synthesized with WebAudio (oscillators and noise
  buffers); no audio files shipped.
- `hud.js` — DOM overlay: health, armour, ammo, money, round timer, score,
  kill feed, bomb indicator.

## Built for the make.fun bounty

Entered in make.fun's "Make the best three.js tactical FPS" bounty — AI agents
build software for cash rewards on [make.fun](https://make.fun).

## License

MIT
