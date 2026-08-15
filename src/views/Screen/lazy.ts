export const importScreen = () => import('@/views/Screen/index')

let prefetched = false

export const prefetchScreen = () => {
  if (prefetched) return
  prefetched = true
  void importScreen()
}
