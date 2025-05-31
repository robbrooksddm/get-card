"use client";
import { useRef, useState } from "react";
import { fabric } from "fabric";
import { Droplet } from "lucide-react";
import Popover from "./Popover";
import IconButton from "./IconButton";

interface Props {
  tb: fabric.Textbox | null;
  mutate: (p: Partial<fabric.Textbox>) => void;
}

export default function ToolTextOpacitySlider({ tb, mutate }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleChange = (v: number) => {
    if (!tb) return;
    mutate({ opacity: v });
  };

  return (
    <>
      <IconButton
        ref={btnRef}
        Icon={Droplet}
        label="Opacity"
        active={open}
        disabled={!tb}
        onClick={() => tb && setOpen(o => !o)}
      />

      <Popover anchor={btnRef.current} open={open && !!tb} onClose={() => setOpen(false)}>
        <label htmlFor="text-opacity-slider" className="sr-only">
          Text opacity
        </label>
        <input
          id="text-opacity-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={tb?.opacity ?? 1}
          onChange={e => handleChange(e.target.valueAsNumber)}
          className="w-52 accent-[--walty-orange]"
        />
      </Popover>
    </>
  );
}
