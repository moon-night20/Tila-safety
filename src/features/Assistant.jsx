import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { ScreenHeader } from '../App'
import { assistantPrompts } from '../data/mockData'

export default function Assistant() {
  const navigate = useNavigate()
  const { assistantHistory, setAssistantHistory } = useApp()
  const [draft, setDraft] = useState('')
  const send = (text) => {
    const prompt = text.trim()
    if (!prompt) return
    const known = assistantPrompts.find((item) => item.prompt.toLowerCase() === prompt.toLowerCase())
    const response = known?.response || 'This is a scripted demo assistant. Tila cannot interpret emergencies or provide live AI guidance. If you are in immediate danger, contact local emergency services.'
    setAssistantHistory((items) => [...items, { id: Date.now(), prompt, response }])
    setDraft('')
  }
  return (
    <section className="page assistant-page">
      <ScreenHeader title="Safety assistant" subtitle="Scripted demo guidance" back={() => navigate('/home')} />
      <div className="assistant-layout">
        <aside className="prompt-panel"><h2>Suggested prompts</h2>{assistantPrompts.map((item) => <button type="button" key={item.prompt} onClick={() => send(item.prompt)}>{item.prompt}</button>)}</aside>
        <article className="chat-card">
          <div className="demo-disclosure"><strong>Demo assistant</strong><span>Responses are scripted, not live AI.</span></div>
          <div className="chat-history" aria-live="polite">
            {assistantHistory.length === 0 && <div className="chat-empty"><span>✦</span><h2>How can I help?</h2><p>Choose a prompt or type a general safety question.</p></div>}
            {assistantHistory.map((item) => <div className="message-group" key={item.id}><div className="message user"><span>You</span><p>{item.prompt}</p></div><div className="message assistant-message"><span>Tila demo</span><p>{item.response}</p></div></div>)}
          </div>
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); send(draft) }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a demo safety question…" /><button type="submit" aria-label="Send">↑</button></form>
        </article>
      </div>
    </section>
  )
}
