import { bindStyles } from '@/utils/cssm'
import styles from './MultiPositionPanel.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import { ElementAlignCommands } from '@/types/edit'
import useCombineElement, { getCanCombine } from '@/hooks/useCombineElement'
import { useMainStore } from '@/store'
import useAlignActiveElement from '@/hooks/useAlignActiveElement'
import useAlignElementToCanvas from '@/hooks/useAlignElementToCanvas'
import useUniformDisplayElement from '@/hooks/useUniformDisplayElement'
import Button from '@/components/Button'
import ButtonGroup from '@/components/ButtonGroup'
import PanelSection from './common/PanelSection'
import { Icon } from '@/components/Icon'
import { useI18nContext } from '@/i18n/useI18nContext'

const MultiPositionPanel = memo(function MultiPositionPanel() {
  const { LL } = useI18nContext()
  useMainStore(s => s.activeElementIdList)
  const { combineElements, uncombineElements } = useCombineElement()
  const canCombine = getCanCombine()
  const { alignActiveElement } = useAlignActiveElement()
  const { alignElementToCanvas } = useAlignElementToCanvas()
  const { displayItemCount, uniformHorizontalDisplay, uniformVerticalDisplay } = useUniformDisplayElement()

  const alignElement = (command: ElementAlignCommands) => {
    if (canCombine) alignActiveElement(command)
    else alignElementToCanvas(command)
  }

  return (
    <div className={cx('multi-position-panel')}>
      <PanelSection label={LL.editor.positionPanel.align()}>
        <ButtonGroup className={cx('row')}>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignLeft()} onClick={() => alignElement(ElementAlignCommands.LEFT)}>
            <Icon icon="align-start-vertical" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignHorizontalCenter()} onClick={() => alignElement(ElementAlignCommands.HORIZONTAL)}>
            <Icon icon="align-center-vertical" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignRight()} onClick={() => alignElement(ElementAlignCommands.RIGHT)}>
            <Icon icon="align-end-vertical" />
          </Button>
        </ButtonGroup>
        <ButtonGroup className={cx('row')}>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignTop()} onClick={() => alignElement(ElementAlignCommands.TOP)}>
            <Icon icon="align-start-horizontal" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignVerticalCenter()} onClick={() => alignElement(ElementAlignCommands.VERTICAL)}>
            <Icon icon="align-center-horizontal" />
          </Button>
          <Button style={{ flex: 1 }} data-tooltip={LL.editor.multiPosition.alignBottom()} onClick={() => alignElement(ElementAlignCommands.BOTTOM)}>
            <Icon icon="align-end-horizontal" />
          </Button>
        </ButtonGroup>
        {displayItemCount > 2 ? (
          <ButtonGroup className={cx('row')}>
            <Button style={{ flex: 1 }} onClick={() => uniformHorizontalDisplay()}>{LL.editor.multiPosition.uniformHorizontal()}</Button>
            <Button style={{ flex: 1 }} onClick={() => uniformVerticalDisplay()}>{LL.editor.multiPosition.uniformVertical()}</Button>
          </ButtonGroup>
        ) : null}
      </PanelSection>

      <PanelSection>
        <ButtonGroup className={cx('row')}>
          <Button disabled={!canCombine} onClick={() => combineElements()} style={{ flex: 1 }}>
            <Icon icon="group" style={{ marginRight: 3 }} />
            {LL.editor.multiPosition.group()}
          </Button>
          <Button disabled={canCombine} onClick={() => uncombineElements()} style={{ flex: 1 }}>
            <Icon icon="ungroup" style={{ marginRight: 3 }} />
            {LL.editor.multiPosition.ungroup()}
          </Button>
        </ButtonGroup>
      </PanelSection>
    </div>
  )
})

export default MultiPositionPanel
