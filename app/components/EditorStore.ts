/**********************************************************************
 * EditorStore.ts – single source-of-truth (Zustand) + History
 * 2025-06-15 • adds: undo / redo that stay in sync with Sanity
 *********************************************************************/
import { create } from 'zustand'
import type { Layer, TemplatePage } from './FabricCanvas'

/* ---------- shared page constants (matches FabricCanvas) --------- */
const DPI       = 300
const mm        = (n: number) => (n / 25.4) * DPI
const TRIM_W_MM = 150
const TRIM_H_MM = 214
const BLEED_MM  = 3
const PAGE_W    = Math.round(mm(TRIM_W_MM + BLEED_MM * 2))
const PAGE_H    = Math.round(mm(TRIM_H_MM + BLEED_MM * 2))

/* ---------- helpers ------------------------------------------------ */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/* ---------- extra editor-only fields ------------------------------- */
export type EditorLayer = Layer & {
  /** blob: URL shown while an upload is in-flight                   */
  srcUrl?: string
  /** `true` between upload POST → success                           */
  uploading?: boolean
}

/* ---------- Selfie drawer state (unchanged) ----------------------- */
type DrawerState =
  | 'closed' | 'idle' | 'picked' | 'generating'
  | 'grid'   | 'applying'

/* ---------- full Zustand shape ------------------------------------ */
interface EditorState {
  /* ---- card data ---- */
  pages: TemplatePage[]
  activePage: number

  /* ---- Selfie drawer ---- */
  drawerState: DrawerState
  drawerImages: string[]
  drawerProgress: number
  selectedFile?: File
  choice?: number                      // 0-3 in the variant-grid

  /* ---- UNDO / REDO ---- */
  history: TemplatePage[][]
  histPtr: number                      // points at `history[histPtr]`
  pushHistory: () => void
  undo: () => void
  redo: () => void

  /* ---- simple setters ---- */
  setPages: (p: TemplatePage[]) => void
  setActive: (i: number) => void
  setDrawerState: (s: DrawerState) => void
  setDrawerImgs:  (a: string[]) => void
  setProgress:    (n: number) => void

    /* new — FabricCanvas pushes a whole page’s layer list */
  setPageLayers: (page: number, layers: EditorLayer[]) => void

  /* ---- canvas ↔ sidebar actions ---- */
  addText: () => void
  addImage: (file: File) => Promise<void>
  updateLayer: (page: number, idx: number, data: Partial<EditorLayer>) => void
  reorder: (from: number, to: number) => void
  deleteLayer: (idx: number) => void
}

/* ------------------------------------------------------------------ */
export const useEditor = create<EditorState>((set, get) => ({
  /* ───── card data ───── */
  pages: [],
  activePage: 0,

  /* ───── drawer defaults ───── */
  drawerState: 'idle',
  drawerImages: [],
  drawerProgress: 0,

  /* ───── history ───── */
  history: [],
  histPtr: -1,

  /* ───── history helpers ───── */
  pushHistory: () => {
    const { history, histPtr, pages } = get()
    const snapshot = clone(pages)

    /* overwrite anything “ahead” of the current pointer              */
    const next = history.slice(0, histPtr + 1)
    next.push(snapshot)

    set({ history: next, histPtr: next.length - 1 })
  },

  undo: () => {
    const { histPtr, history } = get()
    if (histPtr <= 0) return                  // nothing left to undo

    const newPtr = histPtr - 1
    set({
      pages  : clone(history[newPtr]),
      histPtr: newPtr,
    })
  },

  redo: () => {
    const { histPtr, history } = get()
    if (histPtr >= history.length - 1) return // nothing to redo

    const newPtr = histPtr + 1
    set({
      pages  : clone(history[newPtr]),
      histPtr: newPtr,
    })
  },

  /* ───── generic setters ───── */
  setPages: pages => {
    set({ pages })
    /* initialise history once we know the starting template          */
    if (get().history.length === 0) get().pushHistory()
  },

  setActive     : i   => set({ activePage: i }),
  setDrawerState: s   => set({ drawerState: s, drawerProgress: 0 }),
  setDrawerImgs : arr => set({ drawerImages: arr, choice: undefined }),
  setProgress   : n   => set({ drawerProgress: n }),

    /* push whole layer arrays coming from FabricCanvas */
    setPageLayers : (pageIdx: number, layers: EditorLayer[]) =>
      set(state => {
        const pages = [...state.pages]
        if (!pages[pageIdx]) return { pages }
        pages[pageIdx] = { ...pages[pageIdx], layers }
        return { pages }
      }),

  /*────────────────────── editor actions ───────────────────────────*/
  addText: () => {
    const { activePage, pages, pushHistory } = get()
    const nextPages = clone(pages)

    nextPages[activePage].layers.push({
      type : 'text',
      text : 'New text',
      x    : 100,
      y    : 100,
      width: 200,
      leftPct:   (100 / PAGE_W) * 100,
      topPct:    (100 / PAGE_H) * 100,
      widthPct:  (200 / PAGE_W) * 100,
      heightPct: (0 / PAGE_H) * 100,
    })

    set({ pages: nextPages })
    pushHistory()
  },

  /*--------------------------------------------------------------
   * addImage(file)
   *  – optimistic placeholder
   *  – upload POST  →  { url, assetId }
   *  – swap-in Sanity reference
   *------------------------------------------------------------*/
  addImage: async (file) => {
    const { activePage, pages, pushHistory } = get()

    /* 1 ▸ optimistic blob: layer ---------------------------------- */
    const blobUrl  = URL.createObjectURL(file)
    const nextPages= clone(pages)
    nextPages[activePage].layers.push({
      type     : 'image',
      x        : 100,
      y        : 100,
      width    : 300,
      leftPct:   (100 / PAGE_W) * 100,
      topPct:    (100 / PAGE_H) * 100,
      widthPct:  (300 / PAGE_W) * 100,
      heightPct: (300 / PAGE_H) * 100,
      srcUrl   : blobUrl,
      uploading: true,
    } as EditorLayer)

    set({ pages: nextPages })
    pushHistory()                              // snapshot with placeholder

    /* 2 ▸ upload --------------------------------------------------- */
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())

      const { url, assetId } = await res.json()

      /* 3 ▸ swap-in real Sanity reference -------------------------- */
      const swapPages = clone(get().pages)
      const layers    = swapPages[activePage].layers
      const i         = layers.findIndex(
                          l => l.type === 'image' &&
                               (l as EditorLayer).uploading &&
                               (l as EditorLayer).srcUrl === blobUrl
                        )
      if (i !== -1) {
        layers[i] = {
          ...layers[i],
          uploading: false,
          assetId,
          srcUrl: url,
          src   : {
            _type : 'image',
            asset : { _type: 'reference', _ref: assetId },
          },
        } as EditorLayer
        set({ pages: swapPages })
        pushHistory()                          // snapshot with final image
      }
    } catch (err) {
      console.error('Upload failed:', err)
      /* optional: toast or mark layer errored */
    }
  },

  /* live edits coming back from FabricCanvas ---------------------- */
  updateLayer: (pageIdx, idx, data) => {
    const { pages, pushHistory } = get()
    const nextPages = clone(pages)

    Object.assign(nextPages[pageIdx].layers[idx] ?? {}, data)
    set({ pages: nextPages })
    pushHistory()
  },

  /* drag-to-reorder in LayerPanel --------------------------------- */
  reorder: (from, to) => {
    const { activePage, pages, pushHistory } = get()
    const nextPages = clone(pages)
    const [moved]   = nextPages[activePage].layers.splice(from, 1)
    nextPages[activePage].layers.splice(to, 0, moved)

    set({ pages: nextPages })
    pushHistory()
  },

  /* delete layer (sidebar OR ⌫ key) ------------------------------- */
  deleteLayer: idx => {
    const { activePage, pages, pushHistory } = get()
    const nextPages = clone(pages)
    nextPages[activePage].layers.splice(idx, 1)

    set({ pages: nextPages })
    pushHistory()
  },
}))
