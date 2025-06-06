import { Transition } from '@headlessui/react'
import { Fragment } from 'react'

export interface CropDrawerProps {
  open: boolean
  onCommit: () => void
  onCancel: () => void
}

export default function CropDrawer({ open, onCommit, onCancel }: CropDrawerProps) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <div className="fixed inset-y-0 right-0 z-40 flex pointer-events-none">
        <Transition.Child
          as={Fragment}
          enter="transform transition ease-out duration-300"
          enterFrom="translate-x-full"
          enterTo="translate-x-0"
          leave="transform transition ease-in duration-300"
          leaveFrom="translate-x-0"
          leaveTo="translate-x-full"
        >
          <div className="ml-auto w-[260px] max-w-full h-full bg-white shadow-xl flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-3">
              <h2 className="text-sm font-medium">Crop Photo</h2>
              <button onClick={onCancel} className="text-xl leading-none">×</button>
            </div>
            <div className="flex-1 p-4 flex flex-col gap-4 text-sm">
              <p>Drag the image or corner handles to adjust the crop.</p>
              <div className="mt-auto flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-md border border-indigo-600 text-indigo-600 py-2 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={onCommit}
                  className="flex-1 rounded-md bg-indigo-600 text-white py-2 font-semibold"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition.Root>
  )
}
