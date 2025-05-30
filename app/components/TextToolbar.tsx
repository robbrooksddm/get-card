/**********************************************************************
 * TextToolbar.tsx – rich-text controls                               *
 * keeps focus after every style change (no flicker)                  *
 *********************************************************************/
'use client'

import { useEffect, useState } from 'react'
import { fabric }              from 'fabric'
import { getActiveTextbox }    from './FabricCanvas'

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
    <div className="fixed top-0 inset-x-0 z-30 flex justify-center pointer-events-none select-none">

      {/* ───────── ① MAIN TOOLBAR (staff only) ───────── */}
      {mode==='staff' && (
        <div className="toolbar pointer-events-auto flex flex-wrap items-center gap-2
                        border bg-white/95 backdrop-blur rounded-md shadow px-3 py-1
                        max-w-[800px] w-[calc(100%-10rem)]">

          {/* +Text */}
          <button onClick={addText} className="px-3 py-1 rounded bg-blue-600 text-white
                                               shrink-0 hover:bg-blue-700 active:bg-blue-800">
            + Text
          </button>


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
          <button disabled={!tb} onClick={()=>mutate({fontWeight:tb!.fontWeight==='bold'?'normal':'bold'})}
                  className="toolbar-btn font-bold">B</button>
          <button disabled={!tb} onClick={()=>mutate({fontStyle:tb!.fontStyle==='italic'?'normal':'italic'})}
                  className="toolbar-btn italic">I</button>
          <button disabled={!tb} onClick={()=>mutate({underline:!tb!.underline})}
                  className="toolbar-btn underline">U</button>

          {/* text case cycle */}
          <button
            disabled={!tb}
            onClick={() => {
              if (!tb) return
              if (caseState === 'upper') {
                mutate({ text: tb!.text!.toUpperCase() })
                setCaseState('title')
              } else if (caseState === 'title') {
                mutate({ text: tb!.text!.replace(/\b\w/g, c => c.toUpperCase()) })
                setCaseState('lower')
              } else {
                mutate({ text: tb!.text!.toLowerCase() })
                setCaseState('upper')
              }
            }}
            className="toolbar-btn">
            {caseState === 'upper' ? 'AA' : caseState === 'title' ? 'Aa' : 'aa'}
          </button>

          {/* align */}
          <button
            disabled={!tb}
            onClick={cycleAlign}
            className="toolbar-btn">
            {alignSymbols[tb?.textAlign ?? 'left']}
          </button>

          {/* line-height */}
          <input disabled={!tb} type="number" step={0.1} min={0.5} max={3}
                 value={tb?.lineHeight ?? ''}
                 onChange={e=>mutate({lineHeight:+e.target.value})}
                 className="w-16 border p-1 rounded disabled:opacity-40"/>

          {/* opacity */}
          <input disabled={!tb} type="range" min={0} max={1} step={0.01}
                 value={tb?.opacity ?? 1}
                 onChange={e=>mutate({opacity:+e.target.value})}
                 className="disabled:opacity-40"/>
        </div>
      )}

    </div>
  )
}

/* inject one-off tiny CSS (only once) */
if(typeof window!=='undefined' && !document.getElementById('toolbar-css')){
  const shared='border px-2 py-[2px] rounded hover:bg-gray-100 disabled:opacity-40'
  const style=document.createElement('style'); style.id='toolbar-css'
  style.innerHTML=`.toolbar-btn{${shared}}`
  document.head.appendChild(style)
}