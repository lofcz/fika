import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo, useState, useEffect } from 'react'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementSelect, useHandleElementShallow } from '../../common/handleElement'
import type { ChartOptions, ChartType, PPTChartElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { CHART_PRESET_THEMES, DEFAULT_CHART_LINE_COLOR } from '@/configs/chart'
import { useI18nContext } from '@/i18n/useI18nContext'
import { resolveChartLabelColor } from '@/utils/textContrast'
import ElementOutline from '../../common/ElementOutline'
import PanelSection from '../../common/PanelSection'
import ThemeColorsSetting from './ThemeColorsSetting'
import ColorButton from '@/components/ColorButton'
import ColorListButton from '@/components/ColorListButton'
import ColorPicker from '@/components/ColorPicker/index'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import FormatChip from '@/components/FormatChip'
import Popover from '@/components/Popover'
import { Icon } from '@/components/Icon'
import type { IconName } from '@/components/Icon'

const chartList: ChartType[] = ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar']

const chartIcon: Record<ChartType, IconName> = {
  bar: 'chart-column',
  column: 'chart-bar',
  line: 'chart-line',
  area: 'chart-area',
  scatter: 'chart-scatter',
  pie: 'chart-pie',
  ring: 'chart-pie',
  radar: 'radar',
}

const ChartStylePanel = memo(function ChartStylePanel() {
  const { LL } = useI18nContext()
  const handleElementId = useHandleElementId()
  const theme = useSlidesStore(s => s.theme)
  const slideBackground = useSlidesStore(s => selectCurrentSlide(s)?.background)
  const chartType = useHandleElementSelect(el => el?.type === 'chart' ? el.chartType : null)
  const chartStyle = useHandleElementShallow(el => {
    if (!el || el.type !== 'chart') return null
    return {
      fill: el.fill || '#00000000',
      themeColors: el.themeColors,
      lineColor: el.lineColor || DEFAULT_CHART_LINE_COLOR,
      lineSmooth: el.options?.lineSmooth,
      stack: el.options?.stack,
      textColor: el.textColor,
    }
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const [themesVisible, setThemesVisible] = useState(false)
  const [themeColorsSettingVisible, setThemeColorsSettingVisible] = useState(false)
  const [fill, setFill] = useState('#00000000')
  const [themeColors, setThemeColors] = useState<string[]>([])
  const [lineColor, setLineColor] = useState('')
  const [lineSmooth, setLineSmooth] = useState(false)
  const [stack, setStack] = useState(false)

  const chartTypeLabels = useMemo(() => {
    const types = LL.configs.chart.types
    return {
      bar: types.bar(),
      column: types.column(),
      line: types.line(),
      area: types.area(),
      scatter: types.scatter(),
      pie: types.pie(),
      ring: types.ring(),
      radar: types.radar(),
    } satisfies Record<ChartType, string>
  }, [LL])

  const supportsStack = chartType !== null && ['bar', 'column', 'area', 'line'].includes(chartType)
  const supportsSmooth = chartType === 'line'
  const hasGrid = chartType !== 'pie' && chartType !== 'ring'
  const textColorLabel = hasGrid
    ? LL.editor.stylePanel.chart.axisAndText()
    : LL.editor.stylePanel.chart.labels()

  const textColor = (() => {
    const el = getHandleElement()
    if (!el || el.type !== 'chart') return '#000000'
    return resolveChartLabelColor(el, {
      background: slideBackground,
      fallbackSurface: theme.backgroundColor,
      fontColor: theme.fontColor,
    })
  })()

  useEffect(() => {
    if (!chartStyle) return
    setFill(chartStyle.fill)
    setLineSmooth(!!chartStyle.lineSmooth)
    setStack(!!chartStyle.stack)
    setThemeColors(chartStyle.themeColors)
    setLineColor(chartStyle.lineColor)
  }, [chartStyle])

  const sameColors = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  const updateElement = (props: Partial<PPTChartElement>) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props })
    addHistorySnapshot()
  }

  const updateOptions = (optionProps: ChartOptions) => {
    const el = getHandleElement()
    if (!el || el.type !== 'chart') return
    updateElement({ options: { ...el.options, ...optionProps } })
  }

  const changeChartType = (type: ChartType) => {
    if (!chartType || chartType === type) return
    updateElement({ chartType: type })
  }

  const applyThemeColors = (colors: string[]) => {
    updateElement({ themeColors: colors })
    setThemesVisible(false)
    setThemeColorsSettingVisible(false)
  }

  const openCustomColors = () => {
    setThemesVisible(false)
    setThemeColorsSettingVisible(true)
  }

  const openDataEditor = () => emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR)

  return (
    <div className={cx('chart-style-panel')}>
      <PanelSection>
        <Button className="full-width-btn" onClick={() => openDataEditor()}>
          <Icon icon="pencil" /> {LL.canvas.floatingToolbar.chart.editData()}
        </Button>
      </PanelSection>

      <PanelSection label={LL.editor.panel.type()}>
        <div className={cx('type-grid')}>
          {chartList.map(item => (
            <FormatChip
              key={item}
              compact
              active={chartType === item}
              data-tooltip={chartTypeLabels[item]}
              onClick={() => changeChartType(item)}
            >
              <Icon icon={chartIcon[item]} />
            </FormatChip>
          ))}
        </div>
        {supportsStack || supportsSmooth ? (
          <div className="chip-row">
            {supportsStack ? (
              <FormatChip active={stack} onClick={() => updateOptions({ stack: !stack })}>
                {LL.editor.stylePanel.chart.stackedStyle()}
              </FormatChip>
            ) : null}
            {supportsSmooth ? (
              <FormatChip active={lineSmooth} onClick={() => updateOptions({ lineSmooth: !lineSmooth })}>
                {LL.editor.stylePanel.chart.useSmoothCurve()}
              </FormatChip>
            ) : null}
          </div>
        ) : null}
      </PanelSection>

      <PanelSection label={LL.editor.panel.color()}>
        <div className="field">
          <span className="field-label">{LL.editor.stylePanel.chart.themeColors()}</span>
          <Popover
            trigger="click"
            value={themesVisible}
            onUpdateValue={setThemesVisible}
            content={(
              <div className={cx('themes')}>
                <div className={cx('themes-label')}>{LL.editor.stylePanel.chart.presetChartThemes()}</div>
                <div className={cx('preset-themes')}>
                  {CHART_PRESET_THEMES.map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      className={cx('preset-theme', { on: sameColors(item, themeColors) })}
                      onClick={() => applyThemeColors(item)}
                    >
                      {item.map(color => (
                        <span key={color} className={cx('preset-theme-color')} style={{ backgroundColor: color }} />
                      ))}
                    </button>
                  ))}
                </div>
                <div className={cx('themes-label')}>{LL.editor.stylePanel.chart.slideTheme()}</div>
                <button
                  type="button"
                  className={cx('preset-theme slide-theme', { on: sameColors(theme.themeColors, themeColors) })}
                  onClick={() => applyThemeColors(theme.themeColors)}
                >
                  {theme.themeColors.map(color => (
                    <span key={color} className={cx('preset-theme-color')} style={{ backgroundColor: color }} />
                  ))}
                </button>
                <Button className="full-width-btn" onClick={openCustomColors}>
                  {LL.editor.stylePanel.chart.customColors()}
                </Button>
              </div>
            )}
          >
            <ColorListButton colors={themeColors} />
          </Popover>
        </div>
        <div className="field">
          <span className="field-label">{LL.editor.stylePanel.chart.backgroundFill()}</span>
          <Popover
            trigger="click"
            content={<ColorPicker modelValue={fill} onUpdateModelValue={value => updateElement({ fill: value })} />}
          >
            <ColorButton color={fill} />
          </Popover>
        </div>
        <div className="field">
          <span className="field-label">{textColorLabel}</span>
          <Popover
            trigger="click"
            content={<ColorPicker modelValue={textColor} onUpdateModelValue={value => updateElement({ textColor: value })} />}
          >
            <ColorButton color={textColor} />
          </Popover>
        </div>
        {hasGrid ? (
          <div className="field">
            <span className="field-label">{LL.editor.stylePanel.chart.gridColor()}</span>
            <Popover
              trigger="click"
              content={<ColorPicker modelValue={lineColor} onUpdateModelValue={value => updateElement({ lineColor: value })} />}
            >
              <ColorButton color={lineColor} />
            </Popover>
          </div>
        ) : null}
      </PanelSection>

      <ElementOutline />

      <Modal
        visible={themeColorsSettingVisible}
        width={310}
        onUpdateVisible={setThemeColorsSettingVisible}
        onClosed={() => setThemeColorsSettingVisible(false)}
      >
        <ThemeColorsSetting colors={themeColors} onUpdate={colors => applyThemeColors(colors)} />
      </Modal>
    </div>
  )
})

export default ChartStylePanel
