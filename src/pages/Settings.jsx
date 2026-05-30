import { useState, useRef } from 'react'
import { Loader2, Check, User, Lock, Camera } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/ui/Avatar'

const ROLE_LABELS = { admin: 'Admin', creative: 'Creative', client: 'Client' }

export default function Settings() {
  const { profile, user } = useAuth()
  const fileInputRef = useRef(null)

  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  const [name, setName] = useState(profile?.full_name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState('')

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file'); return }

    setAvatarUploading(true)
    setAvatarError('')

    const path = `${user.id}/avatar`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) { setAvatarError(uploadError.message); setAvatarUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Bust cache so the new image loads immediately
    const busted = `${publicUrl}?t=${Date.now()}`

    await supabase.from('profiles').update({ avatar_url: busted }).eq('id', user.id)
    setAvatarUrl(busted)
    setAvatarUploading(false)
  }

  const handleNameSave = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setNameSaving(true)
    setNameError('')
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id)
    if (error) { setNameError(error.message) } else { setNameSaved(true); setTimeout(() => setNameSaved(false), 2500) }
    setNameSaving(false)
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return }
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters'); return }
    setPwSaving(true)
    setPwError('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwError(error.message) } else {
      setPwSaved(true); setNewPassword(''); setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 2500)
    }
    setPwSaving(false)
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Manage your account details.</p>
      </div>

      <div className="space-y-5">
        {/* Profile */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <User size={15} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Profile</h2>
          </div>

          {/* Avatar upload */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              {avatarUploading ? (
                <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-text-muted" />
                </div>
              ) : (
                <Avatar name={profile?.full_name} url={avatarUrl} size={14} />
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={16} className="text-white" />
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={handleAvatarClick}
                className="text-sm font-medium text-accent hover:underline"
              >
                {avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
              <p className="text-xs text-text-muted mt-0.5">JPG, PNG or GIF</p>
              {avatarError && <p className="text-xs text-red-500 mt-1">{avatarError}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Email</label>
            <input className="input w-full bg-surface-2 text-text-muted cursor-not-allowed" value={user?.email || ''} disabled />
          </div>

          {profile?.role !== 'client' && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Role</label>
              <input className="input w-full bg-surface-2 text-text-muted cursor-not-allowed capitalize"
                value={ROLE_LABELS[profile?.role] || profile?.role || ''} disabled />
            </div>
          )}

          <form onSubmit={handleNameSave}>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Full Name</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Your name" required />
              <button type="submit" disabled={nameSaving || name.trim() === profile?.full_name}
                className="btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-50">
                {nameSaving ? <Loader2 size={13} className="animate-spin" /> : nameSaved ? <Check size={13} /> : null}
                {nameSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-red-500 mt-1.5">{nameError}</p>}
          </form>
        </div>

        {/* Password */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={15} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Change Password</h2>
          </div>
          <form onSubmit={handlePasswordSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">New Password</label>
              <input type="password" className="input w-full" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Confirm New Password</label>
              <input type="password" className="input w-full" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Same as above" required />
            </div>
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            <button type="submit" disabled={pwSaving || !newPassword || !confirmPassword}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {pwSaving ? <Loader2 size={13} className="animate-spin" /> : pwSaved ? <Check size={13} /> : null}
              {pwSaved ? 'Password updated!' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
