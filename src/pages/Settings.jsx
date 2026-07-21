import { useState, useRef } from 'react'
import { Loader2, Check, User, Lock, Camera, Scissors, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/ui/Avatar'
import NotificationSettings from '../components/settings/NotificationSettings'

const ROLE_LABELS = { admin: 'Admin', creative: 'Creative', editor: 'Editor', client: 'Client' }

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

  // Creative profile fields
  const [creativeAbout, setCreativeAbout] = useState(profile?.creative_about || '')
  const [creativeEquipment, setCreativeEquipment] = useState(profile?.creative_equipment || '')
  const [creativeShoots, setCreativeShoots] = useState(profile?.creative_ideal_shoots || [])
  const [newShootType, setNewShootType] = useState('')
  const [creativeSaving, setCreativeSaving] = useState(false)
  const [creativeSaved, setCreativeSaved] = useState(false)
  const [creativeError, setCreativeError] = useState('')

  // Editor profile fields
  const [editorAbout, setEditorAbout] = useState(profile?.editor_about || '')
  const [editorSoftware, setEditorSoftware] = useState(profile?.editor_software || '')
  const [editorEdits, setEditorEdits] = useState(profile?.editor_ideal_edits || [])
  const [editorAiTools, setEditorAiTools] = useState(profile?.editor_ai_tools || [])
  const [newEditType, setNewEditType] = useState('')
  const [newAiTool, setNewAiTool] = useState('')
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorSaved, setEditorSaved] = useState(false)
  const [editorError, setEditorError] = useState('')

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

  const handleCreativeSave = async (e) => {
    e.preventDefault()
    setCreativeSaving(true)
    setCreativeError('')
    const { error } = await supabase.from('profiles').update({
      creative_about: creativeAbout.trim() || null,
      creative_equipment: creativeEquipment.trim() || null,
      creative_ideal_shoots: creativeShoots.length > 0 ? creativeShoots : null,
    }).eq('id', user.id)
    if (error) { setCreativeError(error.message) } else {
      setCreativeSaved(true)
      setTimeout(() => setCreativeSaved(false), 2500)
    }
    setCreativeSaving(false)
  }

  const handleEditorSave = async (e) => {
    e.preventDefault()
    setEditorSaving(true)
    setEditorError('')
    const { error } = await supabase.from('profiles').update({
      editor_about: editorAbout.trim() || null,
      editor_software: editorSoftware.trim() || null,
      editor_ideal_edits: editorEdits.length > 0 ? editorEdits : null,
      editor_ai_tools: editorAiTools.length > 0 ? editorAiTools : null,
    }).eq('id', user.id)
    if (error) { setEditorError(error.message) } else {
      setEditorSaved(true)
      setTimeout(() => setEditorSaved(false), 2500)
    }
    setEditorSaving(false)
  }

  const addShootType = () => {
    if (!newShootType.trim()) return
    if (!creativeShoots.includes(newShootType.trim())) {
      setCreativeShoots([...creativeShoots, newShootType.trim()])
    }
    setNewShootType('')
  }

  const removeShootType = (type) => {
    setCreativeShoots(creativeShoots.filter(t => t !== type))
  }

  const addEditType = () => {
    if (!newEditType.trim()) return
    if (!editorEdits.includes(newEditType.trim())) {
      setEditorEdits([...editorEdits, newEditType.trim()])
    }
    setNewEditType('')
  }

  const removeEditType = (type) => {
    setEditorEdits(editorEdits.filter(t => t !== type))
  }

  const addAiTool = () => {
    if (!newAiTool.trim()) return
    if (!editorAiTools.includes(newAiTool.trim())) {
      setEditorAiTools([...editorAiTools, newAiTool.trim()])
    }
    setNewAiTool('')
  }

  const removeAiTool = (tool) => {
    setEditorAiTools(editorAiTools.filter(t => t !== tool))
  }

  return (
    <div className="p-8 max-w-xl">
      <div className="anim-rise mb-8">
        <h1 className="display">Settings</h1>
        <p className="text-text-secondary mt-2">Your account, your profile, your notifications.</p>
      </div>

      <div className="space-y-5">
        {/* Profile */}
        <div className="anim-rise d1 card p-6">
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
              {avatarError && <p className="text-xs text-status-overdue-text mt-1">{avatarError}</p>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
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
                {nameSaved ? 'Saved' : 'Save'}
              </button>
            </div>
            {nameError && <p className="text-xs text-status-overdue-text mt-1.5">{nameError}</p>}
          </form>
        </div>

        {/* Password */}
        <div className="anim-rise d2 card p-6">
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
            {pwError && <p className="text-xs text-status-overdue-text">{pwError}</p>}
            <button type="submit" disabled={pwSaving || !newPassword || !confirmPassword}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              {pwSaving ? <Loader2 size={13} className="animate-spin" /> : pwSaved ? <Check size={13} /> : null}
              {pwSaved ? 'Password updated' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Creative Profile Section */}
        {(profile?.role === 'creative' || profile?.role === 'admin') && (
          <div className="anim-rise d3 card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Camera size={15} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Creative profile</h2>
            </div>
            <form onSubmit={handleCreativeSave} className="space-y-4">
              <div>
                <label className="label">About You</label>
                <textarea className="input resize-none text-xs" rows={3}
                  placeholder="Tell clients and the team about your creative vision and experience…"
                  value={creativeAbout} onChange={(e) => setCreativeAbout(e.target.value)} />
              </div>
              <div>
                <label className="label">Equipment You Use</label>
                <textarea className="input resize-none text-xs" rows={2}
                  placeholder="e.g. Canon R5, DJI Mavic 3, Neewer lighting kit…"
                  value={creativeEquipment} onChange={(e) => setCreativeEquipment(e.target.value)} />
              </div>
              <div>
                <label className="label">Ideal Types of Shoots</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" className="input text-xs flex-1"
                    placeholder="e.g. Restaurant Photography, Wedding Photos & Video"
                    value={newShootType} onChange={(e) => setNewShootType(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addShootType() } }} />
                  <button type="button" onClick={addShootType} className="btn-secondary text-xs">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {creativeShoots.map((type) => (
                    <span key={type} className="inline-flex items-center gap-2 bg-surface-2 text-text-primary text-xs px-2.5 py-1.5 rounded-full">
                      {type}
                      <button type="button" onClick={() => removeShootType(type)} className="hover:text-status-overdue-text">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {creativeError && <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-sm px-3 py-2">{creativeError}</p>}
              <button type="submit" disabled={creativeSaving}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {creativeSaving ? <Loader2 size={13} className="animate-spin" /> : creativeSaved ? <Check size={13} /> : null}
                {creativeSaved ? 'Saved' : 'Save profile'}
              </button>
            </form>
          </div>
        )}

        {/* Editor Profile Section */}
        {(profile?.role === 'editor' || profile?.role === 'admin') && (
          <div className="anim-rise d4 card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Scissors size={15} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Editor profile</h2>
            </div>
            <form onSubmit={handleEditorSave} className="space-y-4">
              <div>
                <label className="label">About You</label>
                <textarea className="input resize-none text-xs" rows={3}
                  placeholder="Tell the team about your editing style and experience…"
                  value={editorAbout} onChange={(e) => setEditorAbout(e.target.value)} />
              </div>
              <div>
                <label className="label">Editing Software You Use</label>
                <textarea className="input resize-none text-xs" rows={2}
                  placeholder="e.g. Adobe Premiere Pro, Final Cut Pro, DaVinci Resolve, Photoshop…"
                  value={editorSoftware} onChange={(e) => setEditorSoftware(e.target.value)} />
              </div>
              <div>
                <label className="label">Ideal Types of Edits</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" className="input text-xs flex-1"
                    placeholder="e.g. Reels, Long-form videos, Photo retouching"
                    value={newEditType} onChange={(e) => setNewEditType(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditType() } }} />
                  <button type="button" onClick={addEditType} className="btn-secondary text-xs">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editorEdits.map((type) => (
                    <span key={type} className="inline-flex items-center gap-2 bg-surface-2 text-text-primary text-xs px-2.5 py-1.5 rounded-full">
                      {type}
                      <button type="button" onClick={() => removeEditType(type)} className="hover:text-status-overdue-text">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">AI Tools You're Proficient With</label>
                <div className="flex gap-2 mb-2">
                  <input type="text" className="input text-xs flex-1"
                    placeholder="e.g. Adobe Firefly, ChatGPT, Runway AI"
                    value={newAiTool} onChange={(e) => setNewAiTool(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAiTool() } }} />
                  <button type="button" onClick={addAiTool} className="btn-secondary text-xs">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editorAiTools.map((tool) => (
                    <span key={tool} className="inline-flex items-center gap-2 bg-surface-2 text-text-primary text-xs px-2.5 py-1.5 rounded-full">
                      {tool}
                      <button type="button" onClick={() => removeAiTool(tool)} className="hover:text-status-overdue-text">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              {editorError && <p className="text-xs text-status-overdue-text bg-status-overdue-bg rounded-sm px-3 py-2">{editorError}</p>}
              <button type="submit" disabled={editorSaving}
                className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                {editorSaving ? <Loader2 size={13} className="animate-spin" /> : editorSaved ? <Check size={13} /> : null}
                {editorSaved ? 'Saved' : 'Save profile'}
              </button>
            </form>
          </div>
        )}

        {/* Notifications */}
        <NotificationSettings />
      </div>
    </div>
  )
}
