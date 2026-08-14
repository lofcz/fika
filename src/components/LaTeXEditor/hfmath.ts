import { hfmath as HfmathEngine, CONFIG as hfmathConfig } from 'hfmath';
import { toHfmathLatex } from '@/utils/latex';
hfmathConfig.SUB_SUP_SCALE = 0.5;

/** Same API as upstream hfmath, with MathLive-compact TeX normalized first. */
export class hfmath extends HfmathEngine {
  constructor(latex: string) {
    super(toHfmathLatex(latex));
  }
}
