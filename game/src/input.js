// input.js — pointer lock, keyboard state and mouse deltas.
// One job: turn browser events into a flat, polled state the simulation reads each tick.

export function createInput(canvas) {
  const held = new Set();
  const state = {
    forward: 0,
    strafe: 0,
    jump: false,
    crouch: false,
    fire: false,
    use: false,
    reloadPressed: false,   // edge: cleared by the consumer
    switchWeapon: 0,        // edge: 1..4, cleared by the consumer
    grenadePressed: false,  // edge: G key
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
  };

  const CODE_TO_ACTION = {
    KeyW: 'fwd', ArrowUp: 'fwd',
    KeyS: 'back', ArrowDown: 'back',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    Space: 'jump',
    ControlLeft: 'crouch', ControlRight: 'crouch', KeyC: 'crouch',
    KeyE: 'use',
  };
  const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

  function applyHeld() {
    state.forward = (held.has('fwd') ? 1 : 0) - (held.has('back') ? 1 : 0);
    state.strafe = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    state.jump = held.has('jump');
    state.crouch = held.has('crouch');
    state.use = held.has('use');
  }

  document.addEventListener('keydown', (e) => {
    const action = CODE_TO_ACTION[e.code];
    if (e.code === 'KeyG' && !e.repeat) state.grenadePressed = true;
    if (e.code === 'KeyR' && !e.repeat) state.reloadPressed = true;
    if (e.code === 'Digit1' && !e.repeat) state.switchWeapon = 1;
    if (e.code === 'Digit2' && !e.repeat) state.switchWeapon = 2;
    if (e.code === 'Digit3' && !e.repeat) state.switchWeapon = 3;
    if (e.code === 'Digit4' && !e.repeat) state.switchWeapon = 4;
    if (action) {
      if (!e.repeat) held.add(action);
      applyHeld();
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
    }
  });

  document.addEventListener('keyup', (e) => {
    const action = CODE_TO_ACTION[e.code];
    if (action) { held.delete(action); applyHeld(); }
  });

  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.mouseDX += e.movementX;
    state.mouseDY += e.movementY;
  });

  document.addEventListener('mousedown', (e) => {
    if (state.locked && e.button === 0) state.fire = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.fire = false;
  });

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      held.clear();
      state.fire = false;
      applyHeld();
    }
  });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    // The sim reads the deltas once per tick, then they zero.
    consumeMouse() {
      const dx = state.mouseDX;
      const dy = state.mouseDY;
      state.mouseDX = 0;
      state.mouseDY = 0;
      return { dx, dy };
    },
  };
}
