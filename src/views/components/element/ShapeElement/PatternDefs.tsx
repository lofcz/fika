import { memo } from 'react';
export type IPatternDefsProps = {
  id: string;
  src: string;
};
const PatternDefs = memo((props: IPatternDefsProps) => {
  const { id, src } = props;
  return <pattern id={id} patternContentUnits='objectBoundingBox' patternUnits='objectBoundingBox' width='1' height='1'><image href={src} width='1' height='1' preserveAspectRatio='xMidYMid slice' /></pattern>;
});
export default PatternDefs;
