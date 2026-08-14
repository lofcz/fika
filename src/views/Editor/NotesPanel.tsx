import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './NotesPanel.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect } from 'react'

import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { Note } from '@/types/slides'
import { formatLocaleDateTime } from '@/i18n/formatters'
import { useI18nContext } from '@/i18n/useI18nContext'
import MoveablePanel from '@/components/MoveablePanel'
import TextArea from '@/components/TextArea'
import Button from '@/components/Button'

const EMPTY_NOTES: Note[] = []

const NotesPanel = memo(() => {
  const { LL, locale } = useI18nContext()
  const formatNoteTime = useCallback((time: number) => formatLocaleDateTime(time, locale), [locale])
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const notes = useSlidesStore(s => s.slides[s.slideIndex]?.notes || EMPTY_NOTES)
  const handleElementId = useMainStore(s => s.handleElementId)
  const [content, setContent] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [activeNoteId, setActiveNoteId] = useState('')
  const [replyNoteId, setReplyNoteId] = useState('')
  const textAreaRef = useRef<{ focus: () => void } | null>(null)
  const notesRef = useRef<HTMLDivElement | null>(null)
  const panelTitle = LL.editor.notesPanel.slideNotesTitle({
    slideNumber: slideIndex + 1,
  })
  const notePlaceholder = handleElementId
    ? LL.editor.notesPanel.notePlaceholderElement()
    : LL.editor.notesPanel.notePlaceholderSlide()

  useEffect(() => {
    setActiveNoteId('')
    setReplyNoteId('')
  }, [slideIndex])

  const scrollToBottom = useCallback(() => {
    if (notesRef.current) {
      notesRef.current.scrollTop = notesRef.current.scrollHeight
    }
  }, [])

  const createNote = useCallback(() => {
    if (!content) {
      if (textAreaRef.current) textAreaRef.current.focus()
      return
    }
    const newNote: Note = {
      id: nanoid(),
      content: content,
      time: new Date().getTime(),
      user: LL.editor.notesPanel.testUser(),
    }
    if (handleElementId) newNote.elId = handleElementId
    const newNotes = [...notes, newNote]
    useSlidesStore.getState().updateSlide({ notes: newNotes })
    setContent('')
    Promise.resolve().then(scrollToBottom)
  }, [content, LL, handleElementId, notes, scrollToBottom])

  const deleteNote = useCallback((id: string) => {
    const newNotes = notes.filter(note => note.id !== id)
    useSlidesStore.getState().updateSlide({ notes: newNotes })
  }, [notes])

  const createNoteReply = useCallback(() => {
    if (!replyContent) return
    const currentNote = notes.find(note => note.id === replyNoteId)
    if (!currentNote) return
    const newReplies = [...(currentNote.replies || []), {
      id: nanoid(),
      content: replyContent,
      time: new Date().getTime(),
      user: LL.editor.notesPanel.testUser(),
    }]
    const newNote: Note = {
      ...currentNote,
      replies: newReplies,
    }
    const newNotes = notes.map(note => note.id === replyNoteId ? newNote : note)
    useSlidesStore.getState().updateSlide({ notes: newNotes })
    setReplyContent('')
    setReplyNoteId('')
    Promise.resolve().then(scrollToBottom)
  }, [replyContent, notes, replyNoteId, LL, scrollToBottom])

  const deleteReply = useCallback((noteId: string, replyId: string) => {
    const currentNote = notes.find(note => note.id === noteId)
    if (!currentNote || !currentNote.replies) return
    const newReplies = currentNote.replies.filter(reply => reply.id !== replyId)
    const newNote: Note = {
      ...currentNote,
      replies: newReplies,
    }
    const newNotes = notes.map(note => note.id === noteId ? newNote : note)
    useSlidesStore.getState().updateSlide({ notes: newNotes })
  }, [notes])

  const handleClickNote = useCallback((note: Note) => {
    setActiveNoteId(note.id)
    if (note.elId) {
      const currentSlide = selectCurrentSlide(useSlidesStore.getState())
      const elIds = currentSlide.elements.map(item => item.id)
      if (elIds.includes(note.elId)) {
        useMainStore.getState().setActiveElementIdList([note.elId])
      }
      else useMainStore.getState().setActiveElementIdList([])
    }
    else useMainStore.getState().setActiveElementIdList([])
  }, [])

  const clear = useCallback(() => {
    useSlidesStore.getState().updateSlide({ notes: [] })
  }, [])

  const close = useCallback(() => {
    useMainStore.getState().setNotesPanelState(false)
  }, [])

  return (
    <MoveablePanel
      className={cx('notes-panel')}
      width={300}
      height={560}
      title={panelTitle}
      left={-270}
      top={90}
      minWidth={300}
      minHeight={400}
      maxWidth={480}
      maxHeight={780}
      resizeable
      onClose={() => close()}
    >
      <div className={cx('container')}>
        <div className={cx('notes')} ref={notesRef}>
          {notes.map(note => (
            <div
              className={cx('note', { active: activeNoteId === note.id })}
              key={note.id}
              onClick={() => handleClickNote(note)}
            >
              <div className={cx('header', 'note-header')}>
                <div className={cx('user')}>
                  <div className={cx('avatar')}><Icon icon="user" /></div>
                  <div className={cx('user-info')}>
                    <div className={cx('username')}>{note.user}</div>
                    <div className={cx('time')}>{formatNoteTime(note.time)}</div>
                  </div>
                </div>
                <div className={cx('btns')}>
                  <div className={cx('btn', 'reply')} onClick={() => setReplyNoteId(note.id)}>{LL.editor.notesPanel.reply()}</div>
                  <div className={cx('btn', 'delete')} onClick={event => { event.stopPropagation(); deleteNote(note.id) }}>{LL.common.delete()}</div>
                </div>
              </div>
              <div className={cx('content')}>{note.content}</div>
              {note.replies?.length ? (
                <div className={cx('replies')}>
                  {note.replies.map(reply => (
                    <div className={cx('reply-item')} key={reply.id}>
                      <div className={cx('header', 'reply-header')}>
                        <div className={cx('user')}>
                          <div className={cx('avatar')}><Icon icon="user" /></div>
                          <div className={cx('user-info')}>
                            <div className={cx('username')}>{reply.user}</div>
                            <div className={cx('time')}>{formatNoteTime(reply.time)}</div>
                          </div>
                        </div>
                        <div className={cx('btns')}>
                          <div className={cx('btn', 'delete')} onClick={event => { event.stopPropagation(); deleteReply(note.id, reply.id) }}>{LL.common.delete()}</div>
                        </div>
                      </div>
                      <div className={cx('content')}>{reply.content}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {replyNoteId === note.id ? (
                <div className={cx('note-reply')}>
                  <TextArea
                    padding={6}
                    value={replyContent}
                    onUpdateValue={value => setReplyContent(value)}
                    placeholder={LL.editor.notesPanel.enterReplyContent()}
                    rows={1}
                    onEnter={event => { event.preventDefault(); createNoteReply() }}
                  />
                  <div className={cx('reply-btns')}>
                    <Button className={cx('btn')} size="small" onClick={() => setReplyNoteId('')}>{LL.common.cancel()}</Button>
                    <Button className={cx('btn')} size="small" type="primary" onClick={() => createNoteReply()}>{LL.editor.notesPanel.reply()}</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {!notes.length ? <div className={cx('empty')}>{LL.editor.notesPanel.noNotesOnPage()}</div> : null}
        </div>
        <div className={cx('send')}>
          <TextArea
            ref={textAreaRef}
            value={content}
            onUpdateValue={value => setContent(value)}
            padding={10}
            placeholder={notePlaceholder}
            rows={2}
            onFocus={() => {
              setReplyNoteId('')
              setActiveNoteId('')
            }}
            onEnter={event => { event.preventDefault(); createNote() }}
          />
          <div className={cx('footer')}>
            {notes.length ? (
              <button
                type="button"
                className={cx('clear-btn')}
                data-tooltip={LL.editor.notesPanel.clearPageNotes()}
                onClick={() => clear()}
              >
                <Icon icon="trash-2" />
              </button>
            ) : null}
            <Button type="primary" onClick={() => createNote()}>
              <Icon icon="plus" /> {LL.editor.notesPanel.addNote()}
            </Button>
          </div>
        </div>
      </div>
    </MoveablePanel>
  )
})

NotesPanel.displayName = 'NotesPanel'

export default NotesPanel
