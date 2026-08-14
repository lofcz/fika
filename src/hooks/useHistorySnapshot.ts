import { debounce, throttle } from '@/utils/debounce'
import { useSnapshotStore } from '@/store'

const addHistorySnapshot = debounce(function() {
  useSnapshotStore.getState().addSnapshot()
}, 300, { trailing: true })

const redo = throttle(function() {
  useSnapshotStore.getState().reDo()
}, 100, { leading: true, trailing: false })

const undo = throttle(function() {
  useSnapshotStore.getState().unDo()
}, 100, { leading: true, trailing: false })

const historySnapshot = {
  addHistorySnapshot,
  redo,
  undo,
}

export default () => historySnapshot
