export interface PrintSpec {
  trimWidthIn: number
  trimHeightIn: number
  bleedIn: number
  dpi: number
}

export interface CardProductDoc {
  printSpec: PrintSpec
  [key: string]: any
}
