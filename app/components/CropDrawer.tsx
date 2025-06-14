"use client";

import { Fragment } from "react";
import { Transition } from "@headlessui/react";
import { Image as Photo, Square } from "lucide-react";

export interface CropDrawerProps {
  open: boolean;
  onCancel: () => void;
  onApply: () => void;
  onRatio: (r: number | null) => void;
}

const DRAWER_PX = 300;

export default function CropDrawer({
  open,
  onCancel,
  onApply,
  onRatio,
}: CropDrawerProps) {
  const ratios: Array<[string, number | null, React.ReactNode]> = [
    ["Freeform", null, <Square className="w-6 h-6" key="f" />],
    ["Original", -1, <Photo className="w-6 h-6" key="o" />],
    ["1:1", 1, <span key="1">1:1</span>],
    ["4:5", 4 / 5, <span key="2">4:5</span>],
    ["16:9", 16 / 9, <span key="3">16:9</span>],
    ["9:16", 9 / 16, <span key="4">9:16</span>],
  ];
  return (
    <Transition.Root show={open} as={Fragment}>
      <div className="fixed inset-0 z-50 flex pointer-events-none">
        <Transition.Child
          as={Fragment}
          enter="transform transition ease-out duration-300"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transform transition ease-in duration-300"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <div
            className="ml-auto h-full pointer-events-auto"
            style={{ width: DRAWER_PX }}
          >
            <div className="flex flex-col h-full bg-white shadow-xl">
              <header className="flex items-center justify-between px-4 py-3 shadow">
                <h2 className="text-sm font-medium">Crop</h2>
                <button onClick={onCancel} className="text-xl leading-none">
                  ×
                </button>
              </header>
              <section className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-3">
                  {ratios.map(([label, r, icon]) => (
                    <button
                      key={label}
                      onClick={() => onRatio(r === -1 ? NaN : r)}
                      className="flex flex-col items-center justify-center w-16 h-16 rounded-md border border-gray-300 hover:ring-2 hover:ring-[--walty-teal]"
                    >
                      {icon}
                      <span className="text-xs mt-1">{label}</span>
                    </button>
                  ))}
                </div>
              </section>
              <footer className="flex justify-end gap-2 px-4 py-3 border-t">
                <button onClick={onCancel} className="text-gray-600">
                  Cancel
                </button>
                <button
                  onClick={onApply}
                  className="rounded-md bg-[--walty-orange] text-white px-4 py-1"
                >
                  Apply
                </button>
              </footer>
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition.Root>
  );
}
