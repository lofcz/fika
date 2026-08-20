import { convertLatexToMathMl } from 'mathlive'
import { mml2omml } from 'mathml2omml-plus'

const mml = convertLatexToMathMl('v = \\frac{s}{t}')
console.log('MML:', mml.slice(0, 400))
const wrapped = /<math[\s>]/i.test(mml)
  ? mml
  : `<math xmlns="http://www.w3.org/1998/Math/MathML">${mml}</math>`
const omml = mml2omml(wrapped)
console.log('OMML:', omml.slice(0, 600))
console.log({
  hasMf: omml.includes('<m:f'),
  hasNum: omml.includes('<m:num'),
  hasDen: omml.includes('<m:den'),
  hasOMath: omml.includes('<m:oMath'),
})
