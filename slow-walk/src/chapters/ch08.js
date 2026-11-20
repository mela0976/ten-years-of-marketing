import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 8, year: 2025, vehicle: '自動駕駛巴士',
  palette: { primary: '#316e82', warm: '#d9b76b', sky: '#738c99', far: '#526c7c', middle: '#344d62', ground: '#273442', fog: '#9caeb0', ink: '#203341' },
  ambience: { type: 'tunnel-bus', rootHz: 38, filterHz: 220, scale: [294, 349, 392, 440, 523], particle: 'dashboard', particleCount: 18, stepSurface: 'rubber' },
  scenery: {
    sky: [prop('mountain-opening', 'mountain', 0, 280, 3600, 380, '#748e97')],
    far: [
      prop('tunnel-entry', 'arch', 0, 120, 3600, 570, '#344555'),
      prop('tunnel-interior', 'rect', 460, 150, 3000, 360, '#28394a'),
      ...[700, 1480, 2250, 3020].map((x, i) => prop(`tunnel-light-${i}`, 'rect', x, 488, 260, 16, '#a7c4bc', { opacity: 0.8 })),
    ],
    middle: [
      prop('bus-frame', 'rect', 1910, 158, 900, 325, '#537889', { parts: [prop('bus-window', 'rect', 92, 58, 724, 208, '#5c8d98', { opacity: 0.7 }), prop('cab-glow', 'rect', 98, 60, 164, 180, '#8fc6ba', { opacity: 0.7 }), prop('empty-driver-seat', 'rect', 670, 45, 80, 175, '#293947')] }),
      prop('road-glow', 'rect', 0, 150, 3600, 72, '#3d5362'),
    ],
    stage: [
      prop('stop-bell', 'ellipse', 2650, 295, 150, 150, '#d6bf76', { parts: [prop('bell-center', 'ellipse', 45, 45, 60, 60, '#476473')] }),
      prop('dashboard-panel', 'rect', 2160, 205, 390, 72, '#29434c', { parts: [prop('report-indicator', 'rect', 32, 24, 154, 18, '#93c9ad'), prop('fresh-indicator', 'rect', 212, 24, 120, 18, '#d9c77c')] }),
      ...[900, 1490, 3210].map((x, i) => prop(`tunnel-column-${i}`, 'rect', x, 150, 38, 365, '#526471')),
    ],
    foreground: [prop('tunnel-rim', 'arch', 2750, 140, 1000, 630, '#202c38', { opacity: 0.85 })],
  },
  kindness: [{ x: 1080, kind: 'seatbelt', label: '替空座位扣上安全帶' }, { x: 2130, kind: 'button', label: '把鬆脫的按鈕裝回控制台' }],
});
