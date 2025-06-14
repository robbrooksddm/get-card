/**********************************************************************
 * TextToolbar.tsx – rich-text controls                               *
 * – Single-row Walty pill (matches Image toolbar)                    *
 * – Captions kept on every icon except font & size controls          *
 *********************************************************************/
'use client'

import { useEffect, useState } from 'react'
import { fabric }              from 'fabric'
import { getActiveTextbox }    from './FabricCanvas'
import { useEditor }           from './EditorStore'

/* UI building blocks */
import IconButton              from './toolbar/IconButton'
import { FontFamilySelect }    from './toolbar/FontFamilySelect'
import { FontSizeStepper }     from './toolbar/FontSizeStepper'
import ToolTextOpacitySlider   from './toolbar/ToolTextOpacitySlider'
import ToolTextColorPicker     from './toolbar/ToolTextColorPicker'

/* lucide-react icons */
import {
  Bold, Italic, Underline,
  CaseUpper, CaseLower, CaseSensitive,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Lock, Unlock, ArrowDownToLine, ArrowUpToLine,
} from 'lucide-react'

/* helper icons already used in Image toolbar */
import {
  AlignToPageVertical,
  AlignToPageHorizontal,
} from './toolbar/AlignToPage'

type Mode = 'staff' | 'customer'

interface Props {
  canvas   : fabric.Canvas | null
  addText  : () => void          // kept in props, just not shown in UI
  addImage : (file: File) => void
  mode     : Mode
  saving   : boolean
}

export default function TextToolbar (props: Props) {
  const { canvas: fc, mode } = props

  /* ------------------------------------------------------------------ */
  /* 1.  Re-render whenever Fabric selection changes                    */
  /* ------------------------------------------------------------------ */
  const [_, force] = useState({})
  useEffect(() => {
    if (!fc) return
    const tick = () => force({})
    fc.on('selection:created', tick)
      .on('selection:updated', tick)
      .on('selection:cleared', tick)
    return () => {
      fc.off('selection:created', tick)
        .off('selection:updated', tick)
        .off('selection:cleared', tick)
    }
  }, [fc])

  if (!fc) return null
  const tb = getActiveTextbox(fc)

  /* ------------------------------------------------------------------ */
  /* 2.  Store access for layer order & locking                         */
  /* ------------------------------------------------------------------ */
  const reorder     = useEditor(s => s.reorder)
  const updateLayer = useEditor(s => s.updateLayer)
  const activePage  = useEditor(s => s.activePage)
  const layerCount  = useEditor(
    s => s.pages[s.activePage]?.layers.length || 0,
  )

  /* ------------------------------------------------------------------ */
  /* 3.  Case-cycle & align-cycle helpers                               */
  /* ------------------------------------------------------------------ */
  const [caseState, setCaseState] =
    useState<'upper' | 'title' | 'lower'>('upper')

  const alignOrder = ['left', 'center', 'right', 'justify'] as const
  const cycleAlign = () => {
    if (!tb) return
    const current = (tb.textAlign ?? 'left') as typeof alignOrder[number]
    const idx     = alignOrder.indexOf(current)
    const next    = alignOrder[(idx + 1) % alignOrder.length]
    mutate({ textAlign: next as any })
  }

  /* ------------------------------------------------------------------ */
  /* 4.  Centre-on-page maths (copied from Image toolbar)               */
  /* ------------------------------------------------------------------ */
  const zoom = fc.viewportTransform?.[0] ?? 1
  const fcH  = (fc.getHeight() ?? 0) / zoom
  const fcW  = (fc.getWidth()  ?? 0) / zoom

  const cycleVertical = () => {
    if (!tb) return
    const { top, height } = tb.getBoundingRect(true, true)
    const pos = [0, fcH / 2 - height / 2, fcH - height]
    mutate({ top: pos[(pos.findIndex(p => Math.abs(top - p) < 1) + 1) % 3] })
  }

  const cycleHorizontal = () => {
    if (!tb) return
    const { left, width } = tb.getBoundingRect(true, true)
    const pos = [0, fcW / 2 - width / 2, fcW - width]
    mutate({ left: pos[(pos.findIndex(p => Math.abs(left - p) < 1) + 1) % 3] })
  }

  /* ------------------------------------------------------------------ */
  /* 5.  Lock / unlock & layer-order helpers                            */
  /* ------------------------------------------------------------------ */
  const locked = Boolean((tb as any)?.locked)
  const toggleLock = () => {
    if (!tb) return
    const next = !locked
    ;(tb as any).locked = next
    tb.set({
      lockMovementX: next,
      lockMovementY: next,
      lockScalingX : next,
      lockScalingY : next,
      lockRotation : next,
    })
    fc.requestRenderAll()
    updateLayer(activePage, (tb as any).layerIdx, { locked: next })
  }

  const sendBackward = () => {
    const idx = (tb as any).layerIdx ?? 0
    if (idx < layerCount - 1) reorder(idx, idx + 1)
  }
  const bringForward = () => {
    const idx = (tb as any).layerIdx ?? 0
    if (idx > 0 && idx <= layerCount - 1) reorder(idx, idx - 1)
  }

  /* ------------------------------------------------------------------ */
  /* 6.  mutate helper – keeps focus & fires Fabric events              */
  /* ------------------------------------------------------------------ */
  const mutate = (p: Partial<fabric.Textbox>) => {
    if (!tb) return
    tb.set(p); tb.setCoords()
    fc.setActiveObject(tb); fc.requestRenderAll()
    tb.fire('modified'); fc.fire('object:modified', { target: tb })
    force({})
  }

  /* ------------------------------------------------------------------ */
  /* 7.  Render                                                         */
  /* ------------------------------------------------------------------ */
  return (
    <div
      className="sticky inset-x-0 z-30 flex justify-center pointer-events-none select-none"
      style={{
        top: "var(--walty-header-h)",
        marginTop: "calc(var(--walty-toolbar-h) * -1)",
        height: "var(--walty-toolbar-h)",
      }}
    >

      {mode === 'staff' && (
        <div
          className="
            pointer-events-auto flex flex-nowrap items-center gap-3
            bg-white shadow-lg rounded-xl
            border border-[rgba(0,91,85,.2)] px-4 py-3
            max-w-none w-[calc(100%-rem)]"
        >
          {/* ───────── Font family & size (no captions) ───────── */}
          <FontFamilySelect
            disabled={!tb}
            value={tb?.fontFamily ?? 'Arial'}
            onChange={(v: string) => mutate({ fontFamily: v })}
          />
          <FontSizeStepper
            disabled={!tb}
            value={tb?.fontSize ?? 12}
            onChange={(v: number) => mutate({ fontSize: v })}
          />

          {/* colour picker */}
          <ToolTextColorPicker tb={tb} canvas={fc} mutate={mutate} />

          {/* centre on page */}
          <IconButton 
            Icon={AlignToPageVertical}
            label="Center vertical"
            caption="Center Y"
            onClick={cycleVertical}
            disabled={!tb}
          />
          <IconButton 
            Icon={AlignToPageHorizontal}
            label="Center horizontal"
            caption="Center X"
            onClick={cycleHorizontal}
            disabled={!tb}
          />

          {/* lock / unlock */}
          <IconButton 
            Icon={locked ? Lock : Unlock}
            label={locked ? 'Unlock layer' : 'Lock layer'}
            active={locked}
            onClick={toggleLock}
            disabled={!tb}
          />

          {/* send backward / bring forward */}
          <IconButton 
            Icon={ArrowDownToLine}
            label="Send backward"
            caption="Send ↓"
            onClick={sendBackward}
            disabled={!tb}
          />
          <IconButton 
            Icon={ArrowUpToLine}
            label="Bring forward"
            caption="Bring ↑"
            onClick={bringForward}
            disabled={!tb}
          />

          {/* B / I / U */}
          <IconButton 
            Icon={Bold}
            label="Bold"
            onClick={() =>
              mutate({ fontWeight: tb!.fontWeight === 'bold' ? 'normal' : 'bold' })}
            active={tb?.fontWeight === 'bold'}
            disabled={!tb}
          />
          <IconButton 
            Icon={Italic}
            label="Italic"
            onClick={() =>
              mutate({ fontStyle: tb!.fontStyle === 'italic' ? 'normal' : 'italic' })}
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

          {/* text-case cycle */}
          <IconButton 
            Icon={
              caseState === 'upper'
                ? CaseUpper
                : caseState === 'title'
                  ? CaseSensitive
                  : CaseLower
            }
            label="Change case"
            caption="Case"
            onClick={() => {
              if (!tb) return
              if (caseState === 'upper') {
                mutate({ text: tb.text!.toUpperCase() })
                setCaseState('title')
              } else if (caseState === 'title') {
                mutate({ text: tb.text!.replace(/\b\w/g, c => c.toUpperCase()) })
                setCaseState('lower')
              } else {
                mutate({ text: tb.text!.toLowerCase() })
                setCaseState('upper')
              }
            }}
            disabled={!tb}
          />

          {/* align cycle */}
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

          {/* line-height input */}
          <input
            disabled={!tb}
            type="number"
            step={0.1}
            min={0.5}
            max={3}
            value={tb?.lineHeight ?? ''}
            onChange={e => mutate({ lineHeight: +e.target.value })}
            title="Line height"
            className="
              w-16 h-12 px-2 border rounded disabled:opacity-40
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-teal-400/50
            "
          />

          {/* opacity slider */}
          <ToolTextOpacitySlider tb={tb} mutate={mutate} />

        </div>
      )}

    </div>
  )
}