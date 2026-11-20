import sprites from './sprites.js';

const PARALLAX = [
  { name: 'sky', depth: 0, scroll: 0 },
  { name: 'far', depth: 1, scroll: 0.16 },
  { name: 'middle', depth: 2, scroll: 0.42 },
  { name: 'stage', depth: 3, scroll: 1 },
  { name: 'characters', depth: 4, scroll: 1 },
  { name: 'foreground', depth: 5, scroll: 1.22 },
];

// 各章的離場方式（貼圖版才有對應的交通工具；第十章是終點，沒有離場）。
const DEPARTURES = {
  1: { mode: 'board', sprite: 'bus' },
  2: { mode: 'ride', sprite: 'bike', seat: 0.42, seatY: 34 },
  3: { mode: 'carry', sprite: 'car-cutaway' },
  4: { mode: 'walk' },
  5: { mode: 'board', sprite: 'train' },
  6: { mode: 'lanterns', sprite: ['lantern-a', 'lantern-b'] },
  7: { mode: 'board', sprite: 'truck' },
  8: { mode: 'carry', sprite: 'bus-cutaway' },
  9: { mode: 'ride', sprite: 'motorbike', seat: 0.45, seatY: 26 },
};

export function prop(id, shape, x, y, width, height, color, extra = {}) {
  return { id, shape, x, y, width, height, color, ...extra };
}

// 有安裝貼圖的章節改用貼圖擺位表；貼圖載入失敗時，同一個位置會畫出該層主色的色塊。
function spriteScenery(id, palette) {
  const entry = sprites[id];
  if (!entry) return null;
  const colors = { far: palette.far, middle: palette.middle, stage: palette.primary, foreground: palette.ink };
  const scenery = {};
  for (const item of entry.items) {
    (scenery[item.layer] ??= []).push(prop(item.id, 'rect', item.x, item.y, item.width, item.height, colors[item.layer] ?? palette.primary, item.flip ? { flip: true } : {}));
  }
  return scenery;
}

export function makeChapter({ id, year, palette, vehicle, ambience, scenery: blockScenery, kindness }) {
  const length = 3600;
  const scenery = spriteScenery(id, palette) ?? blockScenery;
  const floor = prop('road-base', 'rect', 0, 0, length, 154, palette.ground);
  const layers = PARALLAX.map((layer) => ({
    ...layer,
    fog: palette.fog,
    items: layer.name === 'sky'
      ? [prop('sky-field', 'rect', 0, 0, length, 720, palette.sky), ...(scenery.sky ?? [])]
      : layer.name === 'stage'
        ? [floor, prop('road-light', 'rect', 0, 128, length, 26, palette.fog, { opacity: 0.22 }), prop('road-shade', 'rect', 0, 0, length, 60, palette.ink, { opacity: 0.28 }), ...(scenery.stage ?? [])]
        : [...(scenery[layer.name] ?? [])],
  }));

  return {
    id,
    year,
    length,
    palette,
    layers,
    // 路上小問停在對話與原小互動之間，十章共用同一個位置。
    stops: { start: 640, chat: 1520, quiz: 2180, interaction: 2800, takeaway: 2800, departure: 3520 },
    vehicle,
    departure: sprites[id] ? DEPARTURES[id] ?? null : (id < 10 ? { mode: 'walk' } : null),
    hideBystander: sprites[id] ? !sprites[id].bystander : false,
    ambience,
    kindness,
  };
}
