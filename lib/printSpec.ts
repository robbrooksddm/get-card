import type { PrintSpec } from '@/sanity/lib/types'

let currentSpec: PrintSpec = {
  trimWidthIn: 7,
  trimHeightIn: 5,
  bleedIn: 0.125,
  dpi: 300,
}

export function setPrintSpec(spec: PrintSpec) {
  currentSpec = spec
}

export const getPrintSpec = () => currentSpec

export const mm = (n: number) => (n / 25.4) * currentSpec.dpi
export const pageWidth  = () => Math.round(mm(currentSpec.trimWidthIn + currentSpec.bleedIn * 2))
export const pageHeight = () => Math.round(mm(currentSpec.trimHeightIn + currentSpec.bleedIn * 2))
