import { Link } from 'react-router-dom'
import { Shield24Regular } from '@fluentui/react-icons'

export default function Welcome() {
  return (
    <section className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-mark"><Shield24Regular /></div>
      <p className="eyebrow">PERSONAL SAFETY</p>
      <h1>Feel safer.<br /><span>Stay connected.</span></h1>
      <p className="welcome-copy">A calm, secure space for your location, check-ins, and SOS texts to the people you trust.</p>
      <div className="welcome-actions">
        <Link className="button primary" to="/auth/signup">Create account</Link>
        <Link className="button secondary" to="/auth/login">Sign in</Link>
      </div>
      <p className="prototype-note">Add trusted contacts who have agreed to receive emergency texts.</p>
    </section>
  )
}
