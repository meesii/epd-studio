import type { DeviceProfile } from './types'

// 型号来自 EPD_driver.h、UC81xx.c 和 SSD16xx.c；刷新秒数仅用于界面估算。
export const screenModels: DeviceProfile[] = [
    { id: 1, name: '4.2″ · UC8176 · 黑白', width: 400, height: 300, colors: 'bw', refreshSeconds: 8 },
    { id: 2, name: '4.2″ · SSD1619 · 黑白红', width: 400, height: 300, colors: 'bwr', refreshSeconds: 18 },
    { id: 3, name: '4.2″ · UC8176 · 黑白红', width: 400, height: 300, colors: 'bwr', refreshSeconds: 18 },
    { id: 4, name: '4.2″ · SSD1619 · 黑白', width: 400, height: 300, colors: 'bw', refreshSeconds: 8 },
    { id: 5, name: '4.2″ · JD79668 · 黑白红黄', width: 400, height: 300, colors: 'bwry', refreshSeconds: 25 },
    { id: 6, name: '7.5″ · UC8179 · 黑白', width: 800, height: 480, colors: 'bw', refreshSeconds: 12 },
    { id: 7, name: '7.5″ · UC8179 · 黑白红', width: 800, height: 480, colors: 'bwr', refreshSeconds: 25 },
    { id: 8, name: '7.5″ · UC8159 · 黑白', width: 640, height: 384, colors: 'bw', refreshSeconds: 12 },
    { id: 9, name: '7.5″ · UC8159 · 黑白红', width: 640, height: 384, colors: 'bwr', refreshSeconds: 25 },
    { id: 10, name: '7.5″ HD · SSD1677 · 黑白', width: 880, height: 528, colors: 'bw', refreshSeconds: 15 },
    { id: 11, name: '7.5″ HD · SSD1677 · 黑白红', width: 880, height: 528, colors: 'bwr', refreshSeconds: 30 },
    { id: 12, name: '7.5″ · JD79668 · 黑白红黄', width: 800, height: 480, colors: 'bwry', refreshSeconds: 30 },
]
