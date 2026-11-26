// Pattern 4: ナウルくん (Custom Silhouette Preset — Key 4)
// Imported from nauru.overflow.json with Nauru-inspired neon lime & deep Pacific blue theme!

import { WORLD_W } from '../engine/prng.js';
import { addPolylineWalls, generateBottomSievePins } from './helpers.js';

const START_CENTER_X = 657.8620689655172;
const START_WIDTH = 280;
const HOPPER_LEFT_X = START_CENTER_X - START_WIDTH * 0.5;
const HOPPER_RIGHT_X = START_CENTER_X + START_WIDTH * 0.5;

const LEFT_WALL_POINTS = [
  [HOPPER_LEFT_X, 128],
  [517.8620689655172, 215],
  [505.75212348959207, 329.8353244320611],
  [497.3216345343643, 388.84739413319875],
  [495.2141248521522, 460.50491538147946],
  [454.11656048306793, 510.0329667701288],
  [391.94299883910384, 586.9594308529105],
  [280.2416089840173, 696.55319418603],
  [217.0142362206497, 741.866170096692],
  [155.8946826701301, 786.1252223725452],
  [114.79711830104576, 824.0615207356793],
  [87.39859197952971, 883.0735904368169],
  [72.64557397766563, 967.3765069539454],
  [67.25, 1051.572580645161],
  [96.5, 1177.7419354838707],
  [152, 1277.6612903225805],
  [283.40281722903796, 1353.062469611186],
  [296.04832554868995, 1404.6982557128626],
  [274.125, 1478.7701612903227],
  [246, 1590],
];

const RIGHT_WALL_POINTS = [
  [HOPPER_RIGHT_X, 128],
  [797.8620689655172, 215],
  [813.4577104550382, 383.5784794378455],
  [831.3722180934101, 480.52693191956007],
  [870.3623853368772, 495.27994934484445],
  [936.7509663452655, 573.2601119492539],
  [975.7409084755428, 631.2184831287638],
  [995.7630383527217, 709.1986457331732],
  [987.25, 778.6290322580646],
  [897.7607991017984, 909.4182483310261],
  [866.147365972453, 983.1833917357435],
  [838.7487270943421, 1106.476530250815],
  [852, 1230.8064516129032],
  [813.4577104550382, 1274.0284959285584],
  [702.8100754410577, 1329.8791886733366],
  [700.875, 1387.6814516129032],
  [704.625, 1423.6895161290324],
  [738.375, 1478.7701612903227],
  [834, 1590],
];

const NAURU_PINS = [
  { x: 562, y: 1162, r: 10, kind: 'normal' },
  { x: 685, y: 928, r: 10, kind: 'normal' },
  { x: 555, y: 627, r: 10, kind: 'normal' },
  { x: 305, y: 1160, r: 10, kind: 'normal' },
  { x: 443, y: 1001, r: 10, kind: 'normal' },
  { x: 345, y: 904, r: 10, kind: 'normal' },
  { x: 578, y: 434, r: 10, kind: 'normal' },
  { x: 363, y: 1371, r: 10, kind: 'normal' },
  { x: 827, y: 802, r: 10, kind: 'normal' },
  { x: 210, y: 1127, r: 10, kind: 'normal' },
  { x: 689, y: 540, r: 10, kind: 'normal' },
  { x: 715, y: 1152, r: 10, kind: 'normal' },
  { x: 220, y: 971, r: 10, kind: 'normal' },
  { x: 480, y: 683, r: 10, kind: 'normal' },
  { x: 320, y: 1273, r: 10, kind: 'normal' },
  { x: 558, y: 1330, r: 10, kind: 'normal' },
  { x: 684, y: 384, r: 10, kind: 'normal' },
  { x: 427, y: 1302, r: 10, kind: 'normal' },
  { x: 497, y: 784, r: 10, kind: 'normal' },
  { x: 575, y: 723, r: 10, kind: 'normal' },
  { x: 619, y: 1084, r: 10, kind: 'normal' },
  { x: 801, y: 630, r: 10, kind: 'normal' },
  { x: 255, y: 1048, r: 10, kind: 'normal' },
  { x: 355, y: 784, r: 10, kind: 'normal' },
  { x: 424, y: 1154, r: 10, kind: 'normal' },
  { x: 577, y: 521, r: 10, kind: 'normal' },
  { x: 520, y: 970, r: 10, kind: 'normal' },
  { x: 617, y: 861, r: 10, kind: 'normal' },
  { x: 180, y: 873, r: 10, kind: 'normal' },
  { x: 867, y: 706, r: 10, kind: 'normal' },
  { x: 732, y: 732, r: 10, kind: 'normal' },
  { x: 676, y: 1022, r: 10, kind: 'normal' },
  { x: 823, y: 895, r: 10, kind: 'normal' },
  { x: 637, y: 1271, r: 10, kind: 'normal' },
  { x: 371, y: 1080, r: 10, kind: 'normal' },
  { x: 421, y: 852, r: 10, kind: 'normal' },
  { x: 730, y: 461, r: 10, kind: 'normal' },
  { x: 477, y: 1390, r: 10, kind: 'normal' },
  { x: 503, y: 1088, r: 10, kind: 'normal' },
  { x: 681, y: 626, r: 10, kind: 'normal' },
  { x: 289, y: 836, r: 10, kind: 'normal' },
  { x: 712, y: 838, r: 10, kind: 'normal' },
  { x: 387, y: 701, r: 10, kind: 'normal' },
  { x: 627, y: 1386, r: 10, kind: 'normal' },
  { x: 494, y: 1247, r: 10, kind: 'normal' },
  { x: 527, y: 880, r: 10, kind: 'normal' },
  { x: 153, y: 1065, r: 10, kind: 'normal' },
  { x: 783, y: 535, r: 10, kind: 'normal' },
];

export const nauruPattern = {
  id: 'nauru',
  shortcut: '4',
  name: 'ナウルくん',
  subtitle: 'ナウルくんシルエット特製カスタム盤面',
  theme: {
    bgTop: '#041226',
    bgBottom: '#0a1f36',
    bgAura: 'rgba(132, 204, 22, 0.18)',
    grid: 'rgba(163, 230, 53, 0.06)',
    wall: '#a3e635',
    wallGlow: '#65a30d',
    pin: '#fef9c3',
    pinHit: '#facc15',
    bumper: '#ff2e63',
    spinner: '#38bdf8',
    catcher: '#facc15',
    catcherHit: '#a3e635',
    danger: '#ff2e63',
    accent: '#a3e635',
    ballHueStart: 78,
    ballHueStep: 11,
    scale: 'pentatonic',
  },
  physics: {
    gravity: 2720,
    ballRadius: 21,
    ballRestitution: 0.44,
    pinRestitution: 0.56,
    wallRestitution: 0.44,
    bumperRestitution: 0.94,
    catcherRestitution: 0.36,
    friction: 0.015,
    airDrag: 0.0004,
    maxSpeed: 2450,
    substeps: 6,
    jamJitter: 30,
  },
  spawn: {
    xMin: HOPPER_LEFT_X + 28,
    xMax: HOPPER_RIGHT_X - 28,
    yMin: 164,
    yMax: 220,
    overflowLineY: 128,
    hopperLeftX: HOPPER_LEFT_X,
    hopperRightX: HOPPER_RIGHT_X,
    hopperTopY: 128,
    overflowHoldSeconds: 2.0,
    initialBalls: 1,
    catchBonus: 1,
  },
  catcher: {
    y: 1756,
    width: 320,
    height: 86,
    wallThickness: 12,
    minX: 190,
    maxX: WORLD_W - 190,
    speed: 455,
    motion: 'pingpong',
  },

  buildLayout() {
    const walls = [];
    addPolylineWalls(walls, LEFT_WALL_POINTS, 12, 0.44);
    addPolylineWalls(walls, RIGHT_WALL_POINTS, 12, 0.44);

    const pins = [
      ...NAURU_PINS.map((p) => ({ ...p })),
      ...generateBottomSievePins({
        leftExitX: 246,
        rightExitX: WORLD_W - 246,
        exitY: 1590,
        slots: 8,
        rowGap: 76,
        pinRadius: 10,
      }),
    ];

    return { walls, pins, spinners: [] };
  },
};
