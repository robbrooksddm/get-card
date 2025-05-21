/**********************************************************************
 * LayerPanel.tsx – sidebar: upload, reorder, delete layers
 *********************************************************************/
'use client'

import { useState }                from 'react'
import { useEditor }               from './EditorStore'
import {
  DndContext, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/* single row (draggable) ------------------------------------------ */
function Row ({ id, idx }: { id: string; idx: number }) {
  const layer   = useEditor(s => s.pages[s.activePage]?.layers[idx]) as any
  const remove  = useEditor(s => s.deleteLayer) // not .removeLayer

  const {
    attributes, listeners, setNodeRef, transform, transition,
  } = useSortable({ id })

  const style = { transform: CSS.Transform.toString(transform), transition }
  if (!layer) return null

  return (
    <li ref={setNodeRef} style={style}
        className="flex items-center bg-gray-100 rounded mb-1 p-2 text-xs">
      <span {...listeners} {...attributes} className="cursor-grab mr-2">☰</span>
      {layer.thumbUrl && (
        <img src={layer.thumbUrl} alt="" className="w-8 h-8 mr-2 object-contain border" />
      )}
      <span className="flex-1 truncate">
        {layer.type === 'text'
          ? (layer.text ?? 'text').slice(0, 20)
          : 'image'}
      </span>
      <button onClick={() => remove(idx)}>🗑</button>
    </li>
  )
}

/* panel ------------------------------------------------------------ */
export default function LayerPanel () {
  const { pages, activePage } = useEditor()
  const reorder  = useEditor(s => s.reorder)
  const addImage = useEditor(s => s.addImage)
  const [open, setOpen] = useState(true)

  const sensors   = useSensors(useSensor(PointerSensor))

  if (!pages[activePage]) return null
  const ids = pages[activePage].layers.map((_, i) => i.toString())
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id)
      reorder(+e.active.id, +e.over.id)
  }

  return (
    <aside className={`fixed top-0 left-0 h-full w-64 bg-white shadow
                       transition-transform ${open ? '' : '-translate-x-60'}`}>
      {/* toggle pill ------------------------------------------------ */}
      <button onClick={() => setOpen(!open)}
              className="absolute -right-5 top-1/2 w-5 h-16 rounded-r
                         bg-gray-300 text-xs">
        {open ? '◀︎' : '▶︎'}
      </button>

      {/* upload ---------------------------------------------------- */}
      <label className="m-4 flex flex-col items-center border-2 border-dashed
                         rounded p-4 cursor-pointer text-blue-700 hover:bg-blue-50">
        <span className="text-3xl leading-none">⬆️</span>
        Upload
        <input type="file" accept="image/*" className="hidden"
               onChange={e=>{
                 const f=e.target.files?.[0]; if(f) addImage(f)
                 e.currentTarget.value=''
               }} />
      </label>

      {/* list ------------------------------------------------------ */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="px-4 pb-4 overflow-y-auto h-[calc(100vh-200px)]">
            {ids.map((id,i)=><Row key={id} id={id} idx={i}/>)}
          </ul>
        </SortableContext>
      </DndContext>
    </aside>
  )
}