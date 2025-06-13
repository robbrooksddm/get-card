export interface PrintSpec {
  trimW: number; // inches
  trimH: number; // inches
  bleed: number; // inches
  dpi: number;
}

export const PRINT_SPECS: Record<string, PrintSpec> = {
  'card-7x5': { trimW: 7, trimH: 5, bleed: 0.125, dpi: 300 },
} as const;

export const inchesToPx = (inches: number, dpi: number) => inches * dpi;
export const mmToPx = (mm: number, dpi: number) => inchesToPx(mm / 25.4, dpi);
