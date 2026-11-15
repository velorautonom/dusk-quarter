// buymenu.js — the between-round armoury. DOM overlay, no game state: it lists the
// catalogue, marks what the player can afford, and reports purchases through onBuy.

import { CONFIG } from './config.js';

const CATALOGUE = [
  { key: 'rifle', label: CONFIG.weapons.rifle.name, price: CONFIG.weapons.rifle.price, note: 'full-auto · 30 rnd · accurate standing still' },
  { key: 'smg', label: CONFIG.weapons.smg.name, price: CONFIG.weapons.smg.price, note: 'cheap · forgiving fired on the move' },
  { key: 'grenade', label: CONFIG.weapons.grenade.name, price: CONFIG.weapons.grenade.price, note: 'bounces · 1.9 s fuse · big blast' },
  { key: 'armor', label: 'Plate Carrier', price: 650, note: '100 armour · halves incoming damage' },
];

export function createBuyMenu(onBuy) {
  const root = document.createElement('div');
  root.id = 'buymenu';
  root.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'Armoury';
  const wallet = document.createElement('p');
  wallet.className = 'wallet';
  const list = document.createElement('ul');

  for (const item of CATALOGUE) {
    const entry = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = item.key;
    button.innerHTML =
      `<span class="nm">${item.label}</span>` +
      `<span class="pr">$${item.price}</span>` +
      `<span class="nt">${item.note}</span>`;
    button.addEventListener('click', () => onBuy(item.key, item.price));
    entry.append(button);
    list.append(entry);
  }

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'B toggles · purchasable during the buy window only';
  root.append(title, wallet, list, hint);
  document.body.append(root);

  function refresh(money) {
    wallet.textContent = `$${money}`;
    for (const button of root.querySelectorAll('button')) {
      const price = Number(button.querySelector('.pr').textContent.slice(1));
      button.disabled = money < price;
    }
  }

  function open(money) {
    root.hidden = false;
    refresh(money);
  }

  return {
    open,
    close() { root.hidden = true; },
    isOpen() { return !root.hidden; },
    refresh,
  };
}
