import { enterScreening, enterScreeningFromStart, exitScreening } from '@/utils/screening'
import { prefetchScreen } from '@/views/Screen/lazy'

export { beginScreening, enterScreening, enterScreeningFromStart, exitScreening } from '@/utils/screening'

export default () => ({
  enterScreening,
  enterScreeningFromStart,
  exitScreening,
  prefetchScreen,
})
