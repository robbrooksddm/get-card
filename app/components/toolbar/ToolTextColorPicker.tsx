"use client";
import { useRef, useState, useEffect } from "react";
import { fabric } from "fabric";
import { Pipette } from "lucide-react";
import Popover from "./Popover";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  const bigint = parseInt(h.length === 3 ? h.split("").map(x => x + x).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map(x => {
        const s = x.toString(16);
        return s.length === 1 ? "0" + s : s;
      })
      .join("")
  );
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

interface Props {
  tb: fabric.Textbox | null;
  canvas: fabric.Canvas | null;
  mutate: (p: Partial<fabric.Textbox>) => void;
}

export default function ToolTextColorPicker({ tb, canvas, mutate }: Props) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#000000");
  const [hsv, setHsv] = useState<[number, number, number]>([0, 0, 0]);
  const [docColors, setDocColors] = useState<string[]>([]);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (tb) {
      const hex = tb.fill as string;
      setColor(hex);
      setHsv(hexToHsv(hex));
    }
  }, [tb]);

  useEffect(() => {
    if (!open || !canvas) return;
    const colours = Array.from(
      new Set(
        canvas
          .getObjects()
          .map(o => (o as any).fill)
          .filter((c): c is string => typeof c === "string")
      )
    ).filter(c => /^#([0-9a-f]{3}){1,2}$/i.test(c));
    setDocColors(colours as string[]);
  }, [open, canvas]);

  const handleChange = (val: string) => {
    setColor(val);
    setHsv(hexToHsv(val));
    if (tb) mutate({ fill: val });
  };

  const handleEyeDropper = async () => {
    if (typeof window !== "undefined" && (window as any).EyeDropper) {
      try {
        const eye = new (window as any).EyeDropper();
        const result = await eye.open();
        handleChange(result.sRGBHex);
      } catch {
        /* cancelled */
      }
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Text colour"
        disabled={!tb}
        onClick={() => tb && setOpen(o => !o)}
        className="h-12 w-12 rounded-lg border border-teal-800/10 shadow disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
        style={{ backgroundColor: tb ? (tb.fill as string) : "#000" }}
      />

      <Popover anchor={btnRef.current} open={open && !!tb} onClose={() => setOpen(false)}>
        <div className="space-y-3 w-52" onKeyDown={e => e.stopPropagation()}>
          <ColorArea hsv={hsv} onChange={nv => {
            setHsv(nv);
            const hex = hsvToHex(...nv);
            setColor(hex);
            if (tb) mutate({ fill: hex });
          }} />
          <input
            type="range"
            min={0}
            max={360}
            value={hsv[0]}
            onChange={e => {
              const h = Number(e.target.value);
              const nv: [number, number, number] = [h, hsv[1], hsv[2]];
              setHsv(nv);
              const hex = hsvToHex(...nv);
              setColor(hex);
              if (tb) mutate({ fill: hex });
            }}
            className="w-full accent-[--walty-orange]"
            aria-label="Hue"
          />
          <input
            type="text"
            value={color}
            onChange={e => handleChange(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
            aria-label="Hex colour"
          />
          {docColors.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Document colours">
              {docColors.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleChange(c)}
                  style={{ backgroundColor: c }}
                  className="h-6 w-6 rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
                  aria-label={`Use ${c}`}
                />
              ))}
            </div>
          )}
          {typeof window !== "undefined" && (window as any).EyeDropper && (
            <button
              type="button"
              onClick={handleEyeDropper}
              className="flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
            >
              <Pipette className="h-4 w-4" /> Pick colour
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}

interface AreaProps {
  hsv: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}

function ColorArea({ hsv, onChange }: AreaProps) {
  const areaRef = useRef<HTMLDivElement>(null);

  const handle = (e: React.PointerEvent) => {
    if (!areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    const s = x / rect.width;
    const v = 1 - y / rect.height;
    onChange([hsv[0], s, v]);
  };

  const start = (e: React.PointerEvent) => {
    handle(e);
    const move = (ev: PointerEvent) => handle(ev as any);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={areaRef}
      onPointerDown={start}
      className="relative h-32 w-full cursor-crosshair rounded"
      style={{
        backgroundColor: `hsl(${hsv[0]},100%,50%)`,
        backgroundImage:
          "linear-gradient(to right, #fff, rgba(255,255,255,0)), linear-gradient(to top, #000, rgba(0,0,0,0))",
      }}
    >
      <div
        className="pointer-events-none absolute h-3 w-3 rounded-full border border-white shadow"
        style={{
          left: `${hsv[1] * 100}%`,
          top: `${(1 - hsv[2]) * 100}%`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

