// Public support page. Apple and Google both require a reachable Support URL
// on the store listing, so this lives at /support with no login.

const CONTACT = 'yourmove@connectfourcreative.com'

export default function Support() {
  return (
    <div className="app-ground min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-14 text-text-secondary">
        <h1 className="display mb-2">Support</h1>
        <p className="text-sm text-text-muted mb-8">We're here to help.</p>

        <div className="card p-6 mb-6">
          <h2 className="font-display text-lg text-text-primary mb-2">Get in touch</h2>
          <p className="text-sm leading-relaxed mb-3">
            Email us at{' '}
            <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>{' '}
            and we'll get back to you. Tell us your name, what you were doing, and
            what went wrong, and we can sort it out faster.
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          <Section title="I can't sign in">
            <p>
              C4C Lab is invite only. If you applied to join, your account isn't
              created until we approve you and send an invite, so signing in
              won't work yet. If you already have an account, use "Forgot
              password" on the sign-in screen to reset it.
            </p>
          </Section>

          <Section title="I'm a client and didn't get my link">
            <p>
              Your creative sends your join link by text and email. Check your
              spam folder, then ask them to resend it. You never need to create
              an account yourself.
            </p>
          </Section>

          <Section title="I applied. What happens next?">
            <p>
              We review every application by hand, usually within a few days. If
              it's a fit, we email an invite, and that link sets up your account.
            </p>
          </Section>

          <Section title="An upload or video isn't working">
            <p>
              Large files can take a while on a slow connection, so give it time
              before retrying. If a video plays sound with no picture, or an
              upload fails repeatedly, email us with the file name and we'll look
              into it.
            </p>
          </Section>

          <Section title="Delete my account or data">
            <p>
              Email{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>{' '}
              and we'll remove your account and content. See our{' '}
              <a href="/privacy" className="text-accent hover:underline">privacy policy</a>{' '}
              for details on what we store.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display text-base text-text-primary mb-1.5">{title}</h2>
      {children}
    </section>
  )
}
