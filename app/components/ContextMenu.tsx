'use client'

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Scissors,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Crop,
  Lock,
} from 'lucide-react';

export type MenuAction =
  | 'add'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'crop'
  | 'lock';

interface Props {
  pos: { x: number; y: number };
  locked: boolean;
  onAction: (a: MenuAction) => void;
  onClose: () => void;
}

export default function ContextMenu({ pos, locked, onAction, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const Item = ({ Icon, label, action }: { Icon: any; label: string; action: MenuAction }) => (
    <button
      type="button"
      onClick={() => onAction(action)}
      className="flex items-center gap-2 px-3 py-1 text-[--walty-teal] hover:bg-[--walty-orange]/10"
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </button>
  );

  return createPortal(
    <div
      style={{ top: pos.y, left: pos.x }}
      className="fixed z-50 bg-white border border-[rgba(0,91,85,.2)] rounded shadow-lg pointer-events-auto"
    >
      <div className="flex flex-col py-1">
        <Item Icon={Plus}          label="Add"        action="add" />
        <Item Icon={Scissors}      label="Cut"        action="cut" />
        <Item Icon={Copy}          label="Copy"       action="copy" />
        <Item Icon={ClipboardPaste} label="Paste"      action="paste" />
        <Item Icon={CopyPlus}      label="Duplicate"  action="duplicate" />
        <Item Icon={Trash2}        label="Delete"     action="delete" />
        <Item Icon={Crop}          label="Crop"       action="crop" />
        <Item Icon={Lock}          label={locked ? 'Unlock' : 'Lock'} action="lock" />
      </div>
    </div>,
    document.body,
  );
}
