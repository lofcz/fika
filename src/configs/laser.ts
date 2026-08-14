export type ScreenTool = 'pen' | 'laser';
export type LaserColorId = 'red' | 'green' | 'blue' | 'purple';
export type LaserColor = {
  id: LaserColorId;
  hex: string;
  rgb: [number, number, number];
};
export const LASER_COLORS: Record<LaserColorId, LaserColor> = {
  red: {
    id: 'red',
    hex: '#ff3b30',
    rgb: [255, 59, 48]
  },
  green: {
    id: 'green',
    hex: '#34c759',
    rgb: [52, 199, 89]
  },
  blue: {
    id: 'blue',
    hex: '#007aff',
    rgb: [0, 122, 255]
  },
  purple: {
    id: 'purple',
    hex: '#af52de',
    rgb: [175, 82, 222]
  }
};
export const LASER_COLOR_IDS: LaserColorId[] = ['red', 'green', 'blue', 'purple'];
export const isLaserColorId = (value: unknown): value is LaserColorId => value === 'red' || value === 'green' || value === 'blue' || value === 'purple';
