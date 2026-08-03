// Public privacy policy. Reachable at /privacy with no login so it can be
// linked from the App Store and Play Store listings.
//
// IMPORTANT: this is an honest description of what the app actually does with
// data, but it is a template, not legal advice. Review the company details,
// contact address, and retention terms with counsel before you rely on it.

const UPDATED = 'August 3, 2026'
const CONTACT = 'privacy@connectfourcreative.com' // confirm this inbox exists

export default function Privacy() {
  return (
    <div className="app-ground min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-14 text-text-secondary">
        <h1 className="display mb-2">Privacy Policy</h1>
        <p className="text-sm text-text-muted mb-8">Last updated {UPDATED}</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <p>
            C4C Lab is a private content production platform operated by Connect
            Four Creative ("we", "us"). This policy explains what we collect, why,
            and who we share it with. Access is by invitation only.
          </p>

          <Section title="Information we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>Account details you provide: name, email address, and an optional profile photo.</li>
              <li>Content you upload or create: footage, photos, videos, project details, captions, comments, and messages.</li>
              <li>Basic technical data needed to run the service, such as authentication tokens and upload progress.</li>
            </ul>
          </Section>

          <Section title="How we use it">
            <p>
              We use your information solely to operate the platform: to sign you
              in, show you your projects, deliver and review content, send you
              relevant notifications, and provide support. We do not sell your
              personal information, and we do not use it for advertising.
            </p>
          </Section>

          <Section title="Service providers">
            <p>We share data only with the vendors that run the service on our behalf:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Supabase, for authentication and database storage.</li>
              <li>Cloudflare R2, for media file storage and delivery.</li>
              <li>Resend, for transactional email.</li>
              <li>Vercel, for hosting.</li>
            </ul>
            <p className="mt-2">Each processes data only to provide their service to us.</p>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your account and content for as long as your account is
              active. When an account is closed, we remove its personal data and
              uploaded content within a reasonable period, except where we must
              retain records to meet legal obligations.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can request access to, correction of, or deletion of your
              personal data by contacting us at{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>.
              You can update your name and photo in the app at any time.
            </p>
          </Section>

          <Section title="Children">
            <p>The platform is for business use and is not directed to children under 13.</p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy? Email{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">{CONTACT}</a>.
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
      <h2 className="font-display text-lg text-text-primary mb-2">{title}</h2>
      {children}
    </section>
  )
}
