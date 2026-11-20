import sprites from './sprites.js';

const PARALLAX = [
  { name: 'sky', depth: 0, scroll: 0 },
  { name: 'far', depth: 1, scroll: 0.16 },
  { name: 'middle', depth: 2, scroll: 0.42 },
  { name: 'stage', depth: 3, scroll: 1 },
  { name: 'characters', depth: 4, scroll: 1 },
  { name: 'foreground', depth: 5, scroll: 1.22 },
];

export const ROAD_Y = 154;
// 原圖由左上角量像素。走道取捷運金色門檻、巴士青色地板中央；接廊取同張圖的直立車框與走道。
const CABINS = {
  3: { width: 1024, height: 343, floorRow: 237, left: 73, right: 951,
    jamb: [208, 39, 222, 265] },
  8: { width: 1024, height: 383, floorRow: 320, left: 226, right: 798,
    jamb: [492, 48, 509, 348], aisle: [708, 309, 768, 332], arches: [[63, 226], [802, 957]] },
};

// 車門取門檻中央；座墊與踏板取上緣接觸點。分子是原圖像素，分母是原圖寬高。
const DEPARTURES = {
  1: { mode: 'board', sprite: 'bus', door: [116 / 885, 304 / 351], doorTop: 86 / 351 },
  2: { mode: 'ride', sprite: 'bike', seat: [177 / 520, 60 / 365], grip: [300 / 520, 28 / 365],
    footrests: [[262 / 520, 308 / 365], [239 / 520, 205 / 365]], cycling: true },
  3: { mode: 'carry', sprite: 'car-cutaway' },
  4: { mode: 'walk' },
  5: { mode: 'board', sprite: 'train', door: [272 / 546, 254 / 336], doorTop: 85 / 336 },
  6: { mode: 'lanterns', sprite: ['lantern-a', 'lantern-b'] },
  7: { mode: 'board', sprite: 'truck', door: [329 / 457, 177 / 286], doorTop: 26 / 286 },
  8: { mode: 'carry', sprite: 'bus-cutaway' },
  9: { mode: 'ride', sprite: 'motorbike', seat: [144 / 393, 115 / 290], grip: [232 / 393, 66 / 290],
    footrests: [[181 / 393, 225 / 290], [191 / 393, 220 / 290]] },
};

// 兩支腿從髖到鞋底長 99；等比縮小自行車，讓最低踏板仍在鞋底的行程內。
const BICYCLE_SCALE = 0.84;

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
    const scale = item.id === 'bike' ? BICYCLE_SCALE : 1;
    (scenery[item.layer] ??= []).push(prop(item.id, 'rect', item.x, item.y, item.width * scale, item.height * scale, colors[item.layer] ?? palette.primary, item.flip ? { flip: true } : {}));
  }
  return scenery;
}

export function makeChapter({ id, year, palette, vehicle, ambience, scenery: blockScenery, kindness }) {
  const length = 3600;
  const scenery = spriteScenery(id, palette) ?? blockScenery;
  const cabin = sprites[id] && CABINS[id];
  const car = cabin && scenery.stage.find((item) => item.id === DEPARTURES[id].sprite);
  const floorY = car ? car.y + car.height * (1 - cabin.floorRow / cabin.height) : ROAD_Y;
  const floor = prop('road-base', 'rect', 0, 0, length, ROAD_Y, palette.ground);
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
    cabin,
    floorY,
    // 路上小問停在對話與原小互動之間，十章共用同一個位置。
    stops: { start: 640, chat: 1520, quiz: 2180, interaction: 2800, takeaway: 2800, departure: 3520 },
    vehicle,
    departure: sprites[id] ? DEPARTURES[id] ?? null : (id < 10 ? { mode: 'walk' } : null),
    hideBystander: sprites[id] ? !sprites[id].bystander : false,
    ambience,
    kindness,
  };
}
