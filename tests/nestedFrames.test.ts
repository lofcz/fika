import { describe, expect, it } from '@rstest/core'
import type { PPTElement, PPTShapeElement } from '@/types/slides'
import { createFrameFromSelection, frameAncestors, frameClipPolygon, frameDescendantIds, normalizeFrameOrder, reconcileFrameTransforms, reparentFrameElements } from '@/utils/nestedFrames'
const shape = (id:string,left=0,top=0,parentFrameId?:string,frame=false):PPTShapeElement => ({id,type:'shape',left,top,width:100,height:100,rotate:0,viewBox:[100,100],path:'M0 0H100V100H0Z',fill:'#fff',fixedRatio:false,parentFrameId,...(frame?{frame:{clipContent:true}}:{})})
describe('nested native frames', () => {
  it('wraps entire native groups and orders background before children',()=>{
    const a={...shape('a',10,20),groupId:'g'},b={...shape('b',150,20),groupId:'g'}
    const result=createFrameFromSelection([a,b],['a'],'f','Frame')
    expect(result.elements.map(el=>el.id)).toEqual(['f','a','b'])
    expect(result.elements[0].width).toBe(240)
    expect(result.elements.slice(1).every(el=>el.parentFrameId==='f')).toBe(true)
  })
  it('prevents cycles and keeps selected descendants nested on reparent',()=>{
    const elements=[shape('a',0,0,undefined,true),shape('b',0,0,'a',true),shape('c',0,0,'b'),shape('d',0,0,undefined,true)]
    expect(reparentFrameElements(elements,['a'],'b')).toEqual(elements)
    const next=reparentFrameElements(elements,['a','b'],'d')
    expect(next.find(el=>el.id==='b')?.parentFrameId).toBe('a')
    expect(frameAncestors(next.find(el=>el.id==='c')!,next).map(el=>el.id)).toEqual(['b','a','d'])
    expect(frameDescendantIds(next,['a'])).toEqual(['a','b','c'])
    expect(normalizeFrameOrder(next).map(el=>el.id)).toEqual(['d','a','b','c'])
  })
  it('distinguishes absent, overlapping and fully disjoint ancestor clips',()=>{
    const a=shape('a',0,0,undefined,true),b=shape('b',50,50,'a',true),c=shape('c',60,60,'b')
    expect(frameClipPolygon(a,[a,b,c])).toBe(null)
    expect(frameClipPolygon(c,[a,b,c])).toHaveLength(4)
    expect(frameClipPolygon(c,[a,{...b,left:200},c])).toEqual([])
    const rotated=frameClipPolygon(c,[{...a,rotate:45},b,c])!
    expect(rotated.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))).toBe(true)
  })
  it('moves nested descendants once and preserves explicitly moved children',()=>{
    const a=shape('a',0,0,undefined,true),b=shape('b',10,10,'a',true),c=shape('c',20,20,'b')
    const result=reconcileFrameTransforms([a,b,c],[{...a,left:100},b,c])
    expect(result.map(el=>el.left)).toEqual([100,110,120])
    expect(reconcileFrameTransforms([a,b,c],[{...a,left:100},b,{...c,left:120}]).map(el=>el.left)).toEqual([100,110,120])
    expect(reconcileFrameTransforms([a,b,c],[{...a,width:200},b,c]).map(el=>el.left)).toEqual([0,10,20])
  })
  it('rotates line endpoints with their frame',()=>{
    const a=shape('a',0,0,undefined,true),line:PPTElement={id:'line',type:'line',parentFrameId:'a',left:0,top:0,width:1,start:[0,0],end:[100,0],style:'solid',color:'#000',points:['','']}
    const result=reconcileFrameTransforms([a,line],[{...a,rotate:90},line])[1]
    expect(result.left).toBeCloseTo(100)
    expect(result.top).toBeCloseTo(0)
    if(result.type!=='line') throw new Error('line')
    expect(result.end[0]).toBeCloseTo(0);expect(result.end[1]).toBeCloseTo(100)
  })
})
