import { Mesh, PlaneGeometry } from 'three';

// 把原車廂的一塊畫面接在車體上。共用材質，取樣範圍只寫在新平面的 UV。
function addCabinStrip(car, cabin, region, left, right) {
  const [u0, top, u1, bottom] = region;
  const { width, height } = car.geometry.parameters;
  const geometry = new PlaneGeometry(right - left, (bottom - top) * height / cabin.height);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) ? u1 : u0) / cabin.width, 1 - (uv.getY(i) ? top : bottom) / cabin.height);
  }
  const strip = new Mesh(geometry, car.material);
  strip.position.set((left + right - width) / 2, height * (0.5 - (top + bottom) / (2 * cabin.height)), 0);
  // 接廊須蓋過相鄰車廂端牆，但在影子和角色後面。
  strip.renderOrder = 399;
  car.add(strip);
  return strip;
}

export function joinCabins(cars, cabin) {
  cars.forEach((car, i) => {
    const { width } = car.geometry.parameters;
    const unit = width / cabin.width;
    for (const [left, right] of cabin.arches ?? []) {
      addCabinStrip(car, cabin, cabin.aisle, left * unit, right * unit);
    }
    const next = cars[i + 1];
    if (!next) return;
    const spacing = next.position.x - next.geometry.parameters.width / 2 - (car.position.x - width / 2);
    const left = cabin.right * unit;
    const right = spacing + cabin.left * next.geometry.parameters.width / cabin.width;
    const mid = (left + right) / 2;
    const half = (mid - left) / unit;
    const [postLeft, , postRight, bottom] = cabin.jamb;
    // 從兩側原畫的切線向內鏡射，接廊兩端的屋頂、窗框和地板便會逐像素對上。
    addCabinStrip(car, cabin, [cabin.right, 0, cabin.right - half, bottom], left, mid);
    addCabinStrip(car, cabin, [cabin.left + half, 0, cabin.left, bottom], mid, right);
    const post = (postRight - postLeft) * unit / 2;
    addCabinStrip(car, cabin, cabin.jamb, mid - post, mid + post).renderOrder = 400;
  });
}

// 車門、座墊與踏板共用同一換算；baseX、baseY 是車輛未離場時的中心點。
export function vehiclePoint(vehicle, [u, v]) {
  const { width, height } = vehicle.geometry.parameters;
  return {
    x: vehicle.userData.baseX + (u - 0.5) * width,
    y: vehicle.userData.baseY + (0.5 - v) * height,
  };
}
