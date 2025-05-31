/**********************************************************************
 * TextToolbar.tsx – rich-text controls                               *
 * keeps focus after every style change (no flicker)                  *
 *********************************************************************/
'use client'

import { useEffect, useState } from 'react'
import { fabric }              from 'fabric'
import { getActiveTextbox }    from './FabricCanvas'
import IconButton              from './toolbar/IconButton'
import ToolTextOpacitySlider   from './toolbar/ToolTextOpacitySlider'
import {
  Type,
  Bold,
  Italic,
  Underline,
  CaseUpper,
  CaseLower,
  CaseSensitive,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from 'lucide-react'

type Mode = 'staff'|'customer'
const fonts = ['Arial','Georgia','monospace','Dingos Stamp']

interface Props{
  canvas   : fabric.Canvas|null
  addText  : () => void
  addImage : (file:File)=>void
  mode     : Mode
  saving   : boolean
}

export default function TextToolbar(props:Props){
  const {canvas:fc,addText,addImage,mode,saving}=props

  /* re-render when Fabric selection changes */
  const [_,force] = useState({})
  useEffect(()=>{
    if(!fc) return
    const tick=()=>force({})
    fc.on('selection:created',tick)
      .on('selection:updated',tick)
      .on('selection:cleared',tick)
    return()=>{fc.off('selection:created',tick)
                .off('selection:updated',tick)
                .off('selection:cleared',tick)}
  },[fc])

  const tb = fc ? getActiveTextbox(fc) : null
  const [caseState, setCaseState] =
    useState<'upper' | 'title' | 'lower'>('upper')
  const alignOrder = ['left', 'center', 'right', 'justify'] as const
  const alignSymbols: Record<string, string> = {
    left: '←',
    center: '↔︎',
    right: '→',
    justify: '⎯',
  }
  const cycleAlign = () => {
    if (!tb) return
    const current = (tb.textAlign ?? 'left') as typeof alignOrder[number]
    const idx = alignOrder.indexOf(current)
    const next = alignOrder[(idx + 1) % alignOrder.length]
    mutate({ textAlign: next as any })
  }
  if(!fc) return null

  /** mutate helper – apply Fabric props, keep focus, fire modified */
  const mutate = (p:Partial<fabric.Textbox>)=>{
    if(!tb) return
    tb.set(p); tb.setCoords()
    fc.setActiveObject(tb); fc.requestRenderAll()
    tb.fire('modified'); fc.fire('object:modified',{target:tb})
    force({})
  }

  /* ---------------------------------------------------------------- */
  return (
    <div className="fixed inset-x-0 top-2 z-30 flex justify-center pointer-events-none select-none">

      {/* ───────── ① MAIN TOOLBAR (staff only) ───────── */}
      {mode==='staff' && (
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-6
                     bg-[--walty-cream]/95 backdrop-blur shadow-lg rounded-xl
                     border border-[rgba(0,91,85,.2)] px-4 py-3
                     max-w-[720px] w-[calc(100%-6rem)]"
        >

          {/* Add text */}
          <IconButton Icon={Type} label="Add text" caption="Text" onClick={addText} />


          {/* font family */}
          <select disabled={!tb} value={tb?.fontFamily ?? fonts[0]}
                  onChange={e=>mutate({fontFamily:e.target.value})}
                  className="border p-1 rounded min-w-[8rem] disabled:opacity-40">
            {fonts.map(f=><option key={f}>{f}</option>)}
          </select>

          {/* font size */}
          <div className="flex items-center">
            <button disabled={!tb} onClick={()=>mutate({fontSize:Math.max(10,(tb!.fontSize??12)-4)})}
                    className="toolbar-btn rounded-l">−</button>
            <input disabled={!tb} type="number" value={tb?.fontSize ?? ''}
                   onChange={e=>mutate({fontSize:+e.target.value})}
                   className="w-14 border-t border-b p-1 text-center disabled:opacity-40"/>
            <button disabled={!tb} onClick={()=>mutate({fontSize:(tb!.fontSize??12)+4})}
                    className="toolbar-btn rounded-r">+</button>
          </div>

          {/* colour */}
          <input disabled={!tb} type="color" value={tb ? tb.fill as string : '#000000'}
                 onChange={e=>mutate({fill:e.target.value})}
                 className="disabled:opacity-40 h-8 w-8 border p-0"/>

          {/* B / I / U */}
          <IconButton
            Icon={Bold}
            label="Bold"
            onClick={() => mutate({ fontWeight: tb!.fontWeight === 'bold' ? 'normal' : 'bold' })}
            active={tb?.fontWeight === 'bold'}
            disabled={!tb}
          />
          <IconButton
            Icon={Italic}
            label="Italic"
            onClick={() => mutate({ fontStyle: tb!.fontStyle === 'italic' ? 'normal' : 'italic' })}
            active={tb?.fontStyle === 'italic'}
            disabled={!tb}
          />
          <IconButton
            Icon={Underline}
            label="Underline"
            onClick={() => mutate({ underline: !tb!.underline })}
            active={!!tb?.underline}
            disabled={!tb}
          />

          {/* text case cycle */}
          <IconButton
            Icon={caseState === 'upper' ? CaseUpper : caseState === 'title' ? CaseSensitive : CaseLower}
            label="Change case"
            onClick={() => {
              if (!tb) return;
              if (caseState === 'upper') {
                mutate({ text: tb!.text!.toUpperCase() });
                setCaseState('title');
              } else if (caseState === 'title') {
                mutate({ text: tb!.text!.replace(/\b\w/g, c => c.toUpperCase()) });
                setCaseState('lower');
              } else {
                mutate({ text: tb!.text!.toLowerCase() });
                setCaseState('upper');
              }
            }}
            disabled={!tb}
          />

          {/* align */}
          <IconButton
            Icon={
              (tb?.textAlign ?? 'left') === 'left'
                ? AlignLeft
                : (tb?.textAlign ?? 'left') === 'center'
                  ? AlignCenter
                  : (tb?.textAlign ?? 'left') === 'right'
                    ? AlignRight
                    : AlignJustify
            }
            label="Align"
            onClick={cycleAlign}
            disabled={!tb}
          />

          {/* line-height */}
          <input
            disabled={!tb}
            type="number"
            step={0.1}
            min={0.5}
            max={3}
            value={tb?.lineHeight ?? ''}
            onChange={e => mutate({ lineHeight: +e.target.value })}
            className="w-16 border p-1 rounded disabled:opacity-40"
          />

          {/* opacity */}
          <ToolTextOpacitySlider tb={tb} mutate={mutate} />
        </div>
      )}

    </div>
  )
}