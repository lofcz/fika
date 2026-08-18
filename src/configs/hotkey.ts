import { getLL } from '@/i18n/getLL';
export const enum KEYS {
  C = 'C',
  X = 'X',
  Z = 'Z',
  Y = 'Y',
  A = 'A',
  G = 'G',
  L = 'L',
  F = 'F',
  D = 'D',
  B = 'B',
  P = 'P',
  O = 'O',
  R = 'R',
  T = 'T',
  MINUS = '-',
  EQUAL = '=',
  DIGIT_0 = '0',
  DELETE = 'DELETE',
  UP = 'ARROWUP',
  DOWN = 'ARROWDOWN',
  LEFT = 'ARROWLEFT',
  RIGHT = 'ARROWRIGHT',
  ENTER = 'ENTER',
  SPACE = ' ',
  TAB = 'TAB',
  BACKSPACE = 'BACKSPACE',
  ESC = 'ESCAPE',
  PAGEUP = 'PAGEUP',
  PAGEDOWN = 'PAGEDOWN',
  F5 = 'F5',
}
interface HotkeyItem {
  type: string;
  children: {
    label: string;
    value?: string;
  }[];
}
function buildHotkeyDoc(): HotkeyItem[] {
  const {
    hotkey: h
  } = getLL().configs;
  const v = h.values;
  return [{
    type: h.categories.general(),
    children: [{
      label: h.labels.cut(),
      value: 'Ctrl + X'
    }, {
      label: h.labels.copy(),
      value: 'Ctrl + C'
    }, {
      label: h.labels.paste(),
      value: 'Ctrl + V'
    }, {
      label: h.labels.pastePlainText(),
      value: 'Ctrl + Shift + V'
    }, {
      label: h.labels.quickDuplicatePaste(),
      value: 'Ctrl + D'
    }, {
      label: h.labels.selectAll(),
      value: 'Ctrl + A'
    }, {
      label: h.labels.undo(),
      value: 'Ctrl + Z'
    }, {
      label: h.labels.redo(),
      value: 'Ctrl + Y'
    }, {
      label: h.labels.delete(),
      value: 'Delete / Backspace'
    }, {
      label: h.labels.multiSelect(),
      value: v.holdCtrlOrShift()
    }, {
      label: h.labels.openFindReplace(),
      value: 'Ctrl + F'
    }, {
      label: h.labels.print(),
      value: 'Ctrl + P'
    }, {
      label: h.labels.closeDialog(),
      value: 'ESC'
    }]
  }, {
    type: h.categories.slideshow(),
    children: [{
      label: h.labels.slideshowFromStart(),
      value: 'F5'
    }, {
      label: h.labels.slideshowFromCurrent(),
      value: 'Shift + F5'
    }, {
      label: h.labels.previousSlide(),
      value: '↑ / ← / PgUp'
    }, {
      label: h.labels.nextSlideArrows(),
      value: '↓ / → / PgDown'
    }, {
      label: h.labels.nextSlideEnter(),
      value: 'Enter / Space'
    }, {
      label: h.labels.exitSlideshow(),
      value: 'ESC'
    }, {
      label: h.labels.laserPointer(),
      value: v.laserPointerKeys()
    }]
  }, {
    type: h.categories.slideEdit(),
    children: [{
      label: h.labels.newSlide(),
      value: 'Enter'
    }, {
      label: h.labels.panCanvas(),
      value: v.spaceDrag()
    }, {
      label: h.labels.zoomCanvas(),
      value: v.ctrlMouseWheel()
    }, {
      label: h.labels.zoomInCanvas(),
      value: 'Ctrl + ='
    }, {
      label: h.labels.zoomOutCanvas(),
      value: 'Ctrl + -'
    }, {
      label: h.labels.fitCanvasToScreen(),
      value: 'Ctrl + 0'
    }, {
      label: h.labels.prevSlideNoSelection(),
      value: '↑'
    }, {
      label: h.labels.nextSlideNoSelection(),
      value: '↓'
    }, {
      label: h.labels.prevSlide(),
      value: v.mouseWheelUpPgUp()
    }, {
      label: h.labels.nextSlide(),
      value: v.mouseWheelDownPgDown()
    }, {
      label: h.labels.quickCreateText(),
      value: v.doubleClickBlankOrT()
    }, {
      label: h.labels.quickCreateRect(),
      value: 'R'
    }, {
      label: h.labels.quickCreateCircle(),
      value: 'O'
    }, {
      label: h.labels.quickCreateLine(),
      value: 'L'
    }, {
      label: h.labels.exitDrawMode(),
      value: v.rightClick()
    }]
  }, {
    type: h.categories.elementOps(),
    children: [{
      label: h.labels.move(),
      value: '↑ / ← / ↓ / →'
    }, {
      label: h.labels.lock(),
      value: 'Ctrl + L'
    }, {
      label: h.labels.group(),
      value: 'Ctrl + G'
    }, {
      label: h.labels.ungroup(),
      value: 'Ctrl + Shift + G'
    }, {
      label: h.labels.bringToFront(),
      value: 'Alt + F'
    }, {
      label: h.labels.sendToBack(),
      value: 'Alt + B'
    }, {
      label: h.labels.lockAspectRatio(),
      value: v.holdCtrlOrShift()
    }, {
      label: h.labels.quickCopy(),
      value: v.holdCtrlDrag()
    }, {
      label: h.labels.createHVLine(),
      value: v.holdCtrlOrShift()
    }, {
      label: h.labels.cycleFocusElement(),
      value: 'Tab'
    }, {
      label: h.labels.cycleLayersAtPoint(),
      value: v.altClick()
    }, {
      label: h.labels.confirmImageCrop(),
      value: 'Enter'
    }, {
      label: h.labels.finishCustomShape(),
      value: 'Enter'
    }]
  }, {
    type: h.categories.tableEdit(),
    children: [{
      label: h.labels.focusNextCell(),
      value: 'Tab'
    }, {
      label: h.labels.moveFocusCell(),
      value: '↑ / ← / ↓ / →'
    }, {
      label: h.labels.insertRowAbove(),
      value: 'Ctrl + ↑'
    }, {
      label: h.labels.insertRowBelow(),
      value: 'Ctrl + ↓'
    }, {
      label: h.labels.insertColLeft(),
      value: 'Ctrl + ←'
    }, {
      label: h.labels.insertColRight(),
      value: 'Ctrl + →'
    }]
  }, {
    type: h.categories.chartDataEdit(),
    children: [{
      label: h.labels.focusNextRow(),
      value: 'Enter'
    }]
  }, {
    type: h.categories.textEdit(),
    children: [{
      label: h.labels.bold(),
      value: 'Ctrl + B'
    }, {
      label: h.labels.italic(),
      value: 'Ctrl + I'
    }, {
      label: h.labels.underline(),
      value: 'Ctrl + U'
    }, {
      label: h.labels.inlineCode(),
      value: 'Ctrl + E'
    }, {
      label: h.labels.superscript(),
      value: 'Ctrl + ;'
    }, {
      label: h.labels.subscript(),
      value: `Ctrl + '`
    }, {
      label: h.labels.selectParagraph(),
      value: 'ESC'
    }]
  }, {
    type: h.categories.otherShortcuts(),
    children: [{
      label: h.labels.addImageClipboard()
    }, {
      label: h.labels.addImageDrag()
    }, {
      label: h.labels.addImageSvgPaste()
    }, {
      label: h.labels.addMediaLocal()
    }, {
      label: h.labels.addTextClipboard()
    }, {
      label: h.labels.addTextDrag()
    }, {
      label: h.labels.textMarkdown()
    }]
  }];
}

/** Hotkey documentation with labels in the active locale. */
export function getHotkeyDoc(): HotkeyItem[] {
  return buildHotkeyDoc();
}
