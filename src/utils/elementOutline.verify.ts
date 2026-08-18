import {
  importOutlineFromPptx,
  outlineRadiusToPercent,
  outlineRadiusToPptxRectRadius,
  percentToOutlineRadius,
  resolveOutlineRadiusPx,
} from './elementOutline'

const box = { width: 200, height: 100 }

if (percentToOutlineRadius(20) !== 0.2) throw new Error('20% must store as pptxgenjs rectRadius 0.2')
if (percentToOutlineRadius(100) !== 1) throw new Error('100% is maximum rounding')

if (outlineRadiusToPptxRectRadius(0.2, box.width, box.height) !== 0.2) {
  throw new Error('fraction radius must export as rectRadius unchanged')
}
if (outlineRadiusToPptxRectRadius(13, box.width, box.height) !== 13 / 50) {
  throw new Error('legacy px must export as a 0–1 fraction of half the shorter side')
}

if (resolveOutlineRadiusPx(0.2, box.width, box.height) !== 10) {
  throw new Error('0.2 of max rounding on a 100-tall box is 10px')
}
if (resolveOutlineRadiusPx(13, box.width, box.height) !== 13) {
  throw new Error('legacy px must paint as px')
}

if (outlineRadiusToPercent(0.2, box.width, box.height) !== 20) {
  throw new Error('0.2 must display as 20%')
}

const imported = importOutlineFromPptx({
  shapType: 'roundRect',
  keypoints: { adj: 0.334 },
  width: 200,
  height: 100,
}, 1)
if (imported.radius !== 0.334) throw new Error('pptxtojson adj / 50000 must stay a 0–1 fraction')
