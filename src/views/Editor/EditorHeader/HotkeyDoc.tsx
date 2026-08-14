import { bindStyles } from '@/utils/cssm'
import styles from './HotkeyDoc.module.scss'
const cx = bindStyles(styles)
import { Fragment, memo, useMemo, type CSSProperties } from 'react'

import { getHotkeyDoc } from '@/configs/hotkey'
import { useI18nContext } from '@/i18n/useI18nContext'

type KeyPart = { text: string; key: boolean }

const KEY_TOKEN = /^(Ctrl|Shift|Alt|Enter|Space|Delete|Backspace|Escape|ESC|Tab|PgUp|PgDown|F\d+)$/i

const looksLikeKey = (text: string) => {
  if (text.length <= 3) return true
  return KEY_TOKEN.test(text)
}

const parseKeys = (value: string): KeyPart[][] => {
  return value.split(' / ').map(alt => (
    alt.split(' + ').map(raw => {
      const text = raw.trim()
      return { text, key: looksLikeKey(text) }
    }).filter(part => part.text)
  ))
}

const HotkeyDoc = memo(({ className, style }: { className?: string; style?: CSSProperties }) => {
  const { locale } = useI18nContext()
  const hotkeyDoc = useMemo(() => {
    void locale
    return getHotkeyDoc()
  }, [locale])

  return (
    <div className={cx('hotkey-doc', className)} style={style}>
      {hotkeyDoc.map(group => (
        <section key={group.type} className={cx('group')}>
          <h3 className={cx('group-title')}>{group.type}</h3>
          <ul className={cx('list')}>
            {group.children.map(item => (
              <li
                key={item.label}
                className={cx('item', { note: !item.value })}
              >
                <div className={cx('label')}>{item.label}</div>
                {item.value ? (
                  <div className={cx('keys')}>
                    {parseKeys(item.value).map((chord, ci) => (
                      <Fragment key={`${item.label}-${ci}`}>
                        {ci > 0 ? <span className={cx('sep')}>/</span> : null}
                        <span className={cx('chord')}>
                          {chord.map((part, pi) => (
                            <Fragment key={pi}>
                              {pi > 0 ? <span className={cx('plus')}>+</span> : null}
                              {part.key ? <kbd>{part.text}</kbd> : <span className={cx('hint')}>{part.text}</span>}
                            </Fragment>
                          ))}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
})

export default HotkeyDoc
