// app/components/toolbar/FontFamilySelect.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import Popover from "./Popover";

interface Font {
  name: string;
  family: string;
  url?: string; // Google Fonts stylesheet URL
}

const BASE_FONTS: Font[] = [
  { name: "Arial", family: "Arial, Helvetica, sans-serif" },
  { name: "Georgia", family: "Georgia, serif" },
  {
    name: "Domine",
    family: "Domine, serif",
    url: "https://fonts.googleapis.com/css2?family=Domine:wght@400;700&display=swap",
  },
  {
    name: "Recoleta",
    family: "var(--font-recoleta), serif",
  },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

export function FontFamilySelect({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  itemRefs.current = [];

  // reset search when opening
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const [fonts, setFonts] = useState<Font[]>(BASE_FONTS);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return fonts.filter((f) => f.name.toLowerCase().includes(q));
  }, [query, fonts]);

  // fetch full font list
  useEffect(() => {
    fetch('/api/fonts')
      .then((res) => res.json())
      .then((list: { name: string; category: string }[]) => {
        const extras = list.map((f) => ({
          name: f.name,
          family: `'${f.name}', ${f.category === 'serif' ? 'serif' : 'sans-serif'}`,
        }));
        setFonts((prev) => [...prev, ...extras]);
      })
      .catch(() => {/* ignore */});
  }, []);

  // load fonts for visible options
  useEffect(() => {
    filtered.forEach((f) => {
      const url = f.url || `https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, '+')}&display=swap`;
      if (!document.querySelector(`link[data-font="${f.name}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.setAttribute('data-font', f.name);
        document.head.appendChild(link);
      }
    });
  }, [filtered]);

  // keyboard navigation
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, filtered.findIndex((f) => f.name === value)));
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const f = filtered[active];
        if (f) onChange(f.name);
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, active, value, onChange, filtered]);

  useEffect(() => {
    if (!open) return;
    if (document.activeElement !== searchRef.current) {
      itemRefs.current[active]?.focus();
    }
  }, [open, active]);

  const current = fonts.find((f) => f.name === value) || fonts[0];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="h-12 min-w-[9rem] px-3 flex items-center justify-between rounded-lg bg-white/80 border border-teal-800/10 text-sm disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50"
        style={{ fontFamily: current.family }}
      >
        {current.name}
        <ChevronDown className="ml-1 h-4 w-4" />
      </button>

      <Popover anchor={btnRef.current} open={open} onClose={() => setOpen(false)}>
        <div className="max-h-60 overflow-y-auto p-1">
          <input
            ref={searchRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace") e.stopPropagation();
            }}
            placeholder="Search fonts"
            className="mb-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
          />
          <ul>
            {filtered.map((f, i) => (
              <li key={f.name} className="my-0.5">
                <button
                  ref={(el) => (itemRefs.current[i] = el)}
                  type="button"
                  onClick={() => {
                    onChange(f.name);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-md focus:outline-none hover:bg-[--walty-cream] focus:bg-[--walty-cream] ${
                    value === f.name ? "bg-[--walty-cream]" : ""
                  }`}
                  style={{ fontFamily: f.family }}
                >
                  {f.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-2 text-sm text-gray-500">No fonts found</li>
            )}
          </ul>
        </div>
      </Popover>
    </>
  );
}
