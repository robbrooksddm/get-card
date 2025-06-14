export interface PrintSpec {
  trimWidthIn: number
  trimHeightIn: number
  bleedIn: number
  dpi: number
}

export const PRINT_SPECS = {
  'greeting-card-giant': {
    trimWidthIn: 9,
    trimHeightIn: 11.6667,
    bleedIn: 0.125,
    dpi: 300,
  },
  'greeting-card-classic': {
    trimWidthIn: 5,
    trimHeightIn: 7,
    bleedIn: 0.125,
    dpi: 300,
  },
  'greeting-card-mini': {
    trimWidthIn: 4,
    trimHeightIn: 6,
    bleedIn: 0.125,
    dpi: 300,
  },
} as const;

export type Sku = keyof typeof PRINT_SPECS;

export function getSpecForSku(sku: string | undefined): PrintSpec | undefined {
  if (!sku) return undefined;
  return PRINT_SPECS[sku as Sku];
}
