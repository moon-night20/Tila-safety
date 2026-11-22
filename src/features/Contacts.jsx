import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { Dialog, ScreenHeader, StatusPill } from '../App'
import { normalizePhoneNumber } from './phoneNumber'

const empty = { name: '', phone: '', relationship: 'Friend', consentConfirmed: false }

export default function Contacts() {
  const navigate = useNavigate()
  const { contacts, createContact, updateContact, reorderContacts, deleteContact, setToast } = useApp()
  const [editor, setEditor] = useState(null)
  const [removeId, setRemoveId] = useState(null)
  const [form, setForm] = useState(empty)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const openAdd = () => { setForm(empty); setFormError(''); setEditor('add') }
  const openEdit = (contact) => { setForm({ ...contact, consentConfirmed: true }); setFormError(''); setEditor(contact.id) }
  const save = async () => {
    if (!form.name.trim()) { setFormError('Enter the contact’s name.'); return }
    const phone = normalizePhoneNumber(form.phone)
    if (!phone) { setFormError('Enter an Ethiopian mobile number (09… or +251…) or an international number with country code.'); return }
    if (!form.consentConfirmed) { setFormError('Confirm this person agreed to receive SOS text messages.'); return }
    setSaving(true)
    setFormError('')
    try {
      const details = { name: form.name.trim(), phone, relationship: form.relationship, consentConfirmed: form.consentConfirmed }
      if (editor === 'add') await createContact(details)
      else await updateContact(editor, details)
      setToast(editor === 'add' ? 'Trusted contact added' : 'Contact updated')
      setEditor(null)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }
  const moveContact = async (id, offset) => {
    const currentIndex = contacts.findIndex((item) => item.id === id)
    const targetIndex = currentIndex + offset
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= contacts.length) return
    const next = [...contacts]
    ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
    try {
      await reorderContacts(next.map((contact) => contact.id))
      setToast('Contact priority updated')
    } catch (error) {
      setToast(`Could not reorder contacts: ${error.message}`)
    }
  }
  const removeContact = async (id) => {
    try {
      await deleteContact(id)
      setToast('Contact removed')
      setRemoveId(null)
    } catch (error) {
      setToast(`Could not remove contact: ${error.message}`)
    }
  }
  return (
    <section className="page contacts-page">
      <ScreenHeader title="Trusted contacts" subtitle="Add and rank up to five people who agreed to receive SOS texts" back={() => navigate('/home')} />
      <div className="contacts-toolbar"><StatusPill tone="purple">{contacts.length} of 5 contacts</StatusPill><button className="button primary" type="button" onClick={openAdd} disabled={contacts.length >= 5}>+ Add contact</button></div>
      <p className="priority-note">All listed contacts receive an SOS text, in rank order. Ethiopian numbers such as 09… or +251… are accepted.</p>
      {contacts.length ? <div className="contact-list">{contacts.map((contact, index) => <article className="contact-card" key={contact.id}><div className="rank-badge" aria-label={`Rank ${index + 1}`}>{index + 1}</div><div className="avatar">{contact.initials}</div><div className="contact-info"><h2>{contact.name}{index === 0 && <span>First to call</span>}</h2><p>{contact.relationship} · {contact.phone}</p></div><div className="contact-actions"><button type="button" onClick={() => moveContact(contact.id, -1)} disabled={index === 0} aria-label={`Move ${contact.name} up`}>↑</button><button type="button" onClick={() => moveContact(contact.id, 1)} disabled={index === contacts.length - 1} aria-label={`Move ${contact.name} down`}>↓</button><button type="button" onClick={() => openEdit(contact)}>Edit</button><button className="remove" type="button" onClick={() => setRemoveId(contact.id)}>Remove</button></div></article>)}</div> : <div className="empty-state"><h2>No trusted contacts yet</h2><p>Add the people you want to contact in an SOS alert.</p><button className="button primary" type="button" onClick={openAdd}>Add contact</button></div>}
      {editor && <Dialog title={editor === 'add' ? 'Add trusted contact' : 'Edit trusted contact'} confirmLabel={saving ? 'Saving…' : 'Save'} onCancel={() => setEditor(null)} onConfirm={save}><div className="dialog-form"><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="09… or +251…" autoComplete="tel" /></label><label>Relationship<select value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })}><option>Friend</option><option>Family</option><option>Partner</option><option>Neighbor</option><option>Other</option></select></label><label className="consent-check"><input type="checkbox" checked={form.consentConfirmed} onChange={(event) => setForm({ ...form, consentConfirmed: event.target.checked })} /><span>This person agreed to receive emergency SMS messages from me.</span></label>{formError && <p className="field-error" role="alert">{formError}</p>}</div></Dialog>}
      {removeId && <Dialog title="Remove this contact?" confirmLabel="Remove" danger onCancel={() => setRemoveId(null)} onConfirm={() => removeContact(removeId)}>They will no longer receive alerts from this account.</Dialog>}
    </section>
  )
}
