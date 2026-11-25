import { debounce, throttle } from '@/utils/debounce'
import { flushCommitQueue } from '@/utils/commitQueue'
import { useSnapshotStore } from '@/store'

const addHistorySnapshot = debounce(function() {
  flushCommitQueue()
  useSnapshotStore.getState().addSnapshot()
}, 300, { trailing: true })

const redo = throttle(function() {
  flushCommitQueue()
  addHistorySnapshot.flush()
  useSnapshotStore.getState().reDo()
}, 100, { leading: true, trailing: false })

const undo = throttle(function() {
  flushCommitQueue()
  addHistorySnapshot.flush()
  useSnapshotStore.getState().unDo()
}, 100, { leading: true, trailing: false })

const historySnapshot = {
  addHistorySnapshot,
  redo,
  undo,
}

export const getHistorySnapshot = () => historySnapshot

export default () => historySnapshot
