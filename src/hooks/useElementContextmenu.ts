import type { PPTElement } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import useLockElement from '@/hooks/useLockElement';
import useDeleteElement from '@/hooks/useDeleteElement';
import useCombineElement from '@/hooks/useCombineElement';
import useOrderElement from '@/hooks/useOrderElement';
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas';
import useCopyAndPasteElement from '@/hooks/useCopyAndPasteElement';
import useSelectElement from '@/hooks/useSelectElement';
import { ElementOrderCommands, ElementAlignCommands } from '@/types/edit';
import { useI18nContext } from '@/i18n/useI18nContext';
export default (openLinkDialog: () => void) => {
  const {
    LL
  } = useI18nContext();
  const {
    orderElement
  } = useOrderElement();
  const {
    alignElementToCanvas
  } = useAlignElementToCanvas();
  const {
    combineElements,
    uncombineElements
  } = useCombineElement();
  const {
    deleteElement
  } = useDeleteElement();
  const {
    lockElement,
    unlockElement
  } = useLockElement();
  const {
    copyElement,
    pasteElement,
    cutElement
  } = useCopyAndPasteElement();
  const {
    selectAllElements
  } = useSelectElement();
  const contextmenus = (element: PPTElement, isMultiSelect: boolean): ContextmenuItem[] => {
    const canvasMenu = LL.canvas.contextMenu;
    const alignMenu = LL.editor.multiPosition;
    if (element.lock) {
      return [{
        text: canvasMenu.unlock(),
        handler: () => unlockElement(element)
      }];
    }
    return [{
      text: canvasMenu.cut(),
      subText: 'Ctrl + X',
      handler: cutElement
    }, {
      text: canvasMenu.copy(),
      subText: 'Ctrl + C',
      handler: copyElement
    }, {
      text: canvasMenu.paste(),
      subText: 'Ctrl + V',
      handler: pasteElement
    }, {
      divider: true
    }, {
      text: alignMenu.alignHorizontalCenter(),
      handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL),
      children: [{
        text: canvasMenu.alignCenter(),
        handler: () => alignElementToCanvas(ElementAlignCommands.CENTER)
      }, {
        text: alignMenu.alignHorizontalCenter(),
        handler: () => alignElementToCanvas(ElementAlignCommands.HORIZONTAL)
      }, {
        text: alignMenu.alignLeft(),
        handler: () => alignElementToCanvas(ElementAlignCommands.LEFT)
      }, {
        text: alignMenu.alignRight(),
        handler: () => alignElementToCanvas(ElementAlignCommands.RIGHT)
      }]
    }, {
      text: alignMenu.alignVerticalCenter(),
      handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL),
      children: [{
        text: canvasMenu.alignCenter(),
        handler: () => alignElementToCanvas(ElementAlignCommands.CENTER)
      }, {
        text: alignMenu.alignVerticalCenter(),
        handler: () => alignElementToCanvas(ElementAlignCommands.VERTICAL)
      }, {
        text: alignMenu.alignTop(),
        handler: () => alignElementToCanvas(ElementAlignCommands.TOP)
      }, {
        text: alignMenu.alignBottom(),
        handler: () => alignElementToCanvas(ElementAlignCommands.BOTTOM)
      }]
    }, {
      divider: true
    }, {
      text: canvasMenu.bringToFront(),
      handler: () => orderElement(element, ElementOrderCommands.TOP),
      children: [{
        text: canvasMenu.bringToFront(),
        handler: () => orderElement(element, ElementOrderCommands.TOP)
      }, {
        text: canvasMenu.bringForward(),
        handler: () => orderElement(element, ElementOrderCommands.UP)
      }]
    }, {
      text: canvasMenu.sendToBack(),
      handler: () => orderElement(element, ElementOrderCommands.BOTTOM),
      children: [{
        text: canvasMenu.sendToBack(),
        handler: () => orderElement(element, ElementOrderCommands.BOTTOM)
      }, {
        text: canvasMenu.sendBackward(),
        handler: () => orderElement(element, ElementOrderCommands.DOWN)
      }]
    }, {
      divider: true
    }, {
      text: canvasMenu.setLink(),
      handler: openLinkDialog
    }, {
      text: element.groupId ? alignMenu.ungroup() : alignMenu.group(),
      subText: 'Ctrl + G',
      handler: element.groupId ? uncombineElements : combineElements,
      hide: !isMultiSelect
    }, {
      text: canvasMenu.selectAll(),
      subText: 'Ctrl + A',
      handler: selectAllElements
    }, {
      text: canvasMenu.lock(),
      subText: 'Ctrl + L',
      handler: lockElement
    }, {
      text: LL.common.delete(),
      subText: 'Delete',
      handler: deleteElement
    }];
  };
  return {
    contextmenus
  };
};
