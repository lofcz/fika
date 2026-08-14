import { useMainStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import {
  multiSelectOperateEqual,
  operatePropsEqual,
  typedOperateEqual,
} from './operateCompare'

function ignoreContentWhileIdle() {
  return !useMainStore.getState().isScaling
}

export function operateMemoEqual<T extends Parameters<typeof operatePropsEqual>[0]>(prev: T, next: T) {
  return operatePropsEqual(prev, next, ignoreContentWhileIdle())
}

export function typedOperateMemoEqual<T extends { elementInfo: PPTElement; handlerVisible: boolean }>(prev: T, next: T) {
  return typedOperateEqual(prev, next, ignoreContentWhileIdle())
}

export function multiSelectOperateMemoEqual(prev: { elementList: PPTElement[] }, next: { elementList: PPTElement[] }) {
  return multiSelectOperateEqual(prev, next, ignoreContentWhileIdle())
}
