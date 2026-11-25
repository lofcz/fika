import { bindStyles } from '@/utils/cssm'
import styles from './ElementFilter.module.scss'
const cx = bindStyles(styles)
import { useMemo, memo } from 'react'

import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementId, useHandleElementShallow } from './handleElement'
import type { ImageElementFilterKeys, ImageElementFilters, PPTImageElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import Switch from '@/components/Switch'
import Slider from '@/components/Slider'

interface FilterOption {
  label: string
  key: ImageElementFilterKeys
  default: number
  value: number
  unit: string
  max: number
  step: number
}

const ElementFilter = memo(() => {
  const { LL } = useI18nContext()
  const filterDefs: FilterOption[] = [
    { label: LL.editor.elementFilter.blur(), key: 'blur', default: 0, value: 0, unit: 'px', max: 10, step: 1 },
    { label: LL.editor.elementFilter.brightness(), key: 'brightness', default: 100, value: 100, unit: '%', max: 200, step: 5 },
    { label: LL.editor.elementFilter.contrast(), key: 'contrast', default: 100, value: 100, unit: '%', max: 200, step: 5 },
    { label: LL.editor.elementFilter.grayscale(), key: 'grayscale', default: 0, value: 0, unit: '%', max: 100, step: 5 },
    { label: LL.editor.elementFilter.saturate(), key: 'saturate', default: 100, value: 100, unit: '%', max: 200, step: 5 },
    { label: LL.editor.elementFilter.hueRotate(), key: 'hue-rotate', default: 0, value: 0, unit: 'deg', max: 360, step: 10 },
    { label: LL.editor.elementFilter.sepia(), key: 'sepia', default: 0, value: 0, unit: '%', max: 100, step: 5 },
    { label: LL.editor.elementFilter.invert(), key: 'invert', default: 0, value: 0, unit: '%', max: 100, step: 5 },
    { label: LL.editor.elementFilter.opacity(), key: 'opacity', default: 100, value: 100, unit: '%', max: 100, step: 5 },
  ]

  const presetFilters = [
    { label: LL.editor.elementFilter.presetBlackWhite(), values: { grayscale: '100%' } as ImageElementFilters },
    { label: LL.editor.elementFilter.presetVintage(), values: { sepia: '50%', contrast: '110%', brightness: '90%' } },
    { label: LL.editor.elementFilter.presetSharpen(), values: { contrast: '150%' } },
    { label: LL.editor.elementFilter.presetSoft(), values: { brightness: '110%', contrast: '90%' } },
    { label: LL.editor.elementFilter.presetWarm(), values: { sepia: '30%', saturate: '135%' } },
    { label: LL.editor.elementFilter.presetBright(), values: { brightness: '110%', contrast: '110%' } },
    { label: LL.editor.elementFilter.presetVivid(), values: { saturate: '200%' } },
    { label: LL.editor.elementFilter.presetBlur(), values: { blur: '2px' } },
    { label: LL.editor.elementFilter.presetInvert(), values: { invert: '100%' } },
  ]

  const handleElementId = useHandleElementId()
  const imageFilter = useHandleElementShallow(el => {
    if (!el || el.type !== 'image') return null
    return { src: el.src, filters: el.filters }
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const hasFilters = Boolean(imageFilter?.filters)
  const filterOptions = useMemo((): FilterOption[] => {
    const filters = imageFilter?.filters
    if (!filters) return filterDefs
    return filterDefs.map(item => {
      const raw = filters[item.key]
      const parsed = raw ? parseInt(raw, 10) : Number.NaN
      return Number.isFinite(parsed) ? { ...item, value: parsed } : item
    })
  }, [imageFilter?.filters, filterDefs])

  const filters2Style = (filters: ImageElementFilters) => {
    let filter = ''
    const keys = Object.keys(filters) as ImageElementFilterKeys[]
    for (const key of keys) {
      filter += `${key}(${filters[key]}) `
    }
    return filter
  }

  const updateFilter = (filter: FilterOption, value: number) => {
    const _handleElement = getHandleElement() as PPTImageElement | null
    if (!_handleElement || _handleElement.type !== 'image') return
    const originFilters = _handleElement.filters || {}
    const filters = { ...originFilters, [filter.key]: `${value}${filter.unit}` }
    useSlidesStore.getState().updateElement({ id: handleElementId, props: { filters } })
    addHistorySnapshot()
  }

  const toggleFilters = (checked: boolean) => {
    const el = getHandleElement()
    if (!el) return
    if (checked) {
      useSlidesStore.getState().updateElement({ id: el.id, props: { filters: {} } })
    }
    else {
      useSlidesStore.getState().removeElementProps({ id: el.id, propName: 'filters' })
    }
    addHistorySnapshot()
  }

  const applyPresetFilters = (filters: ImageElementFilters) => {
    useSlidesStore.getState().updateElement({ id: handleElementId, props: { filters } })
    addHistorySnapshot()
  }

  return (
    <div className={cx('element-filter')}>
      <div className={cx('row')}>
        <div style={{ flex: '2' }}>{LL.editor.elementFilter.enableFilter()}</div>
        <div className={cx('switch-wrapper')} style={{ flex: '3' }}>
          <Switch value={hasFilters} onUpdateValue={value => toggleFilters(value)} />
        </div>
      </div>
      {hasFilters ? (
        <>
          <div className={cx('presets')}>
            {presetFilters.map((item, index) => (
              <div className={cx('preset-item')} key={index} onClick={() => applyPresetFilters(item.values)}>
                <img src={imageFilter?.src} alt="" style={{ filter: filters2Style(item.values) }} />
                <span className={cx('preset-label')}>{item.label}</span>
              </div>
            ))}
          </div>
          <div className={cx('filter')}>
            {filterOptions.map(filter => (
              <div className={cx('filter-item')} key={filter.key}>
                <div className={cx('name')}>{filter.label}</div>
                <Slider
                  key={handleElementId}
                  className={cx('filter-slider')}
                  max={filter.max}
                  min={0}
                  step={filter.step}
                  value={filter.value}
                  onUpdateValue={value => updateFilter(filter, value)}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
})

export default ElementFilter
