/**********************************************************************
 * app/admin/templates/[id]/EditorWrapper.tsx   (CLIENT COMPONENT)
 * Wraps CardEditor:
 *   • handles saving to /api/templates/[id]
 *   • shows an inline error banner on failure
 *********************************************************************/
'use client'

import {useState}   from 'react'
import {useRouter}  from 'next/navigation'

import CardEditor   from '@/app/components/CardEditor'
import type {TemplatePage} from '@/app/components/FabricCanvas'

interface Props {
  templateId   : string
  initialPages : TemplatePage[]
}

export default function EditorWrapper({templateId, initialPages}: Props) {
  const router          = useRouter()
  const [error, setErr] = useState<string | null>(null)

  /** CardEditor → onSave */
  const handleSave = async (pages: TemplatePage[], coverImageId?: string) => {
    try {
      setErr(null)
      const res = await fetch(`/api/templates/${templateId}`, {
        method : 'PATCH',            // or POST – both accepted
        headers: {'content-type': 'application/json'},
        body   : JSON.stringify({ pages, coverImage: coverImageId }),
      })

      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Save failed')
      }

      router.refresh()              // pull latest draft from Sanity
    } catch (err: any) {
      console.error('[admin:save]', err)
      setErr(err?.message ?? 'Server error – see console')
    }
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-4 py-2
                        rounded shadow-lg z-50 text-sm">
          {error}
        </div>
      )}

      <CardEditor
        initialPages={initialPages}
        templateId={templateId}
        mode="staff"
        onSave={handleSave}
      />
    </>
  )
}