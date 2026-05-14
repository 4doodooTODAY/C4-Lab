import { supabase } from './supabase'

export async function uploadToR2({ file, category, clientName, projectName, onProgress }) {
  // 1. Get pre-signed URL from edge function
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        filename:    file.name,
        contentType: file.type || 'application/octet-stream',
        category,
        clientName:  clientName || 'no-client',
        projectName: projectName || 'no-project',
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to get upload URL')
  }
  const { uploadUrl, publicUrl, key } = await res.json()

  // 2. Upload directly to R2 using pre-signed URL
  const xhr = new XMLHttpRequest()
  await new Promise((resolve, reject) => {
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.send(file)
  })

  return { publicUrl, key }
}
