import { bindStyles } from '@/utils/cssm'
import styles from './MarkupPanel.module.scss'
const cx = bindStyles(styles)
import { useMemo, useCallback, memo } from 'react';

import { useMainStore, useSlidesStore, selectCurrentSlide, selectHandleElement } from '@/store';
import type { ImageType, SlideType, TextType } from '@/types/slides';
import MoveablePanel from '@/components/MoveablePanel';
import Select from '@/components/Select';
import { useI18nContext } from '@/i18n/useI18nContext';
const MarkupPanel = memo(() => {
  const {
    LL
  } = useI18nContext();
  const slidesStore = useSlidesStore();
  const mainStore = useMainStore();
  const currentSlide = useSlidesStore(selectCurrentSlide);;
  const handleElement = useMainStore(selectHandleElement);
  const handleElementId = useMainStore(s => s.handleElementId);;
  const slideTypeOptions = [{
    label: LL.editor.markup.unmarked(),
    value: '' as const
  }, {
    label: LL.editor.markup.slideTypes.cover(),
    value: 'cover' as const
  }, {
    label: LL.editor.markup.slideTypes.contents(),
    value: 'contents' as const
  }, {
    label: LL.editor.markup.slideTypes.transition(),
    value: 'transition' as const
  }, {
    label: LL.editor.markup.slideTypes.content(),
    value: 'content' as const
  }, {
    label: LL.editor.markup.slideTypes.end(),
    value: 'end' as const
  }];
  const textTypeOptions = [{
    label: LL.editor.markup.unmarked(),
    value: '' as const
  }, {
    label: LL.editor.markup.textTypes.title(),
    value: 'title' as const
  }, {
    label: LL.editor.markup.textTypes.subtitle(),
    value: 'subtitle' as const
  }, {
    label: LL.editor.markup.textTypes.content(),
    value: 'content' as const
  }, {
    label: LL.editor.markup.textTypes.item(),
    value: 'item' as const
  }, {
    label: LL.editor.markup.textTypes.itemTitle(),
    value: 'itemTitle' as const
  }, {
    label: LL.editor.markup.textTypes.notes(),
    value: 'notes' as const
  }, {
    label: LL.editor.markup.textTypes.header(),
    value: 'header' as const
  }, {
    label: LL.editor.markup.textTypes.footer(),
    value: 'footer' as const
  }, {
    label: LL.editor.markup.textTypes.partNumber(),
    value: 'partNumber' as const
  }, {
    label: LL.editor.markup.textTypes.itemNumber(),
    value: 'itemNumber' as const
  }];
  const imageTypeOptions = [{
    label: LL.editor.markup.unmarked(),
    value: '' as const
  }, {
    label: LL.editor.markup.imageTypes.pageFigure(),
    value: 'pageFigure' as const
  }, {
    label: LL.editor.markup.imageTypes.itemFigure(),
    value: 'itemFigure' as const
  }, {
    label: LL.editor.markup.imageTypes.background(),
    value: 'background' as const
  }];
  const slideType = currentSlide?.type || '';
  const textType = (() => {
    if (!handleElement) return '';
    if (handleElement.type === 'text') return handleElement.textType || '';
    if (handleElement.type === 'shape' && handleElement.text) return handleElement.text.type || '';
    return '';
  })();
  const imageType = (() => {
    if (!handleElement) return '';
    if (handleElement.type === 'image') return handleElement.imageType || '';
    return '';
  })();
  const updateSlide = useCallback((type: SlideType | '') => {
    if (type) slidesStore.updateSlide({
      type
    });else {
      slidesStore.removeSlideProps({
        id: currentSlide.id,
        propName: 'type'
      });
    }
  }, [slidesStore, currentSlide?.id]);
  const updateElement = useCallback((type: TextType | ImageType | '') => {
    if (!handleElement) return;
    if (handleElement.type === 'image') {
      if (type) {
        slidesStore.updateElement({
          id: handleElementId,
          props: {
            imageType: type as ImageType
          }
        });
      } else {
        slidesStore.removeElementProps({
          id: handleElementId,
          propName: 'imageType'
        });
      }
    }
    if (handleElement.type === 'text') {
      if (type) {
        slidesStore.updateElement({
          id: handleElementId,
          props: {
            textType: type as TextType
          }
        });
      } else {
        slidesStore.removeElementProps({
          id: handleElementId,
          propName: 'textType'
        });
      }
    }
    if (handleElement.type === 'shape') {
      const text = handleElement.text;
      if (!text) return;
      if (type) {
        slidesStore.updateElement({
          id: handleElementId,
          props: {
            text: {
              ...text,
              type: type as TextType
            }
          }
        });
      } else {
        delete text.type;
        slidesStore.updateElement({
          id: handleElementId,
          props: {
            text
          }
        });
      }
    }
  }, [handleElement, handleElement?.type, slidesStore, handleElementId, handleElement?.type === 'shape' ? handleElement.text : undefined]);
  const close = useCallback(() => {
    mainStore.setMarkupPanelState(false);
  }, [mainStore]);
  return <><MoveablePanel className={cx("notes-panel")} width={300} height={130} title={LL.editor.markup.title()} left={-270} top={90} onClose={() => {
      close();
    }}><div className={cx("container")}><div className={cx("row")}><div style={{
            width: '40%'
          }}>{LL.editor.markup.slideTypeLabel()}</div><Select style={{
            width: '60%'
          }} value={slideType} onUpdateValue={value => updateSlide(value as SlideType | '')} options={slideTypeOptions} /></div>{handleElement && (handleElement.type === 'text' || handleElement.type === 'shape' && handleElement.text) ? <div className={cx("row")}><div style={{
            width: '40%'
          }}>{LL.editor.markup.textTypeLabel()}</div><Select style={{
            width: '60%'
          }} value={textType} onUpdateValue={value => updateElement(value as TextType | '')} options={textTypeOptions} /></div> : handleElement && handleElement.type === 'image' ? <div className={cx("row")}><div style={{
            width: '40%'
          }}>{LL.editor.markup.imageTypeLabel()}</div><Select style={{
            width: '60%'
          }} value={imageType} onUpdateValue={value => updateElement(value as ImageType | '')} options={imageTypeOptions} /></div> : <div className={cx("placeholder")}>{LL.editor.markup.placeholder()}</div>}</div></MoveablePanel></>;
});
export default MarkupPanel;
