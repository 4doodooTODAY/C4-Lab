// Public privacy policy. Reachable at /privacy with no login so it can be
// linked from the App Store and Play Store listings.
//
// IMPORTANT: this is an honest description of what the app actually does with
// data, but it is a template, not legal advice. Review the company details,
// contact address, and retention terms with counsel before you rely on it.

const UPDATED = 'August 20, 2026'
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
              active, because that is what lets you and your clients get back to
              past projects. We do not keep personal data longer than we need it
              for the purpose it was collected.
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-text-primary">Account data</strong> (name, email, phone, photo, role) is kept while the account is active.</li>
              <li><strong className="text-text-primary">Uploaded content</strong> (footage, photos, video, captions, comments, messages) is kept while the account or the client project it belongs to is active.</li>
              <li><strong className="text-text-primary">Applications</strong> submitted through the sign-in screen are kept for up to 12 months from the date of the application if they are not approved, then deleted.</li>
              <li><strong className="text-text-primary">Backups</strong> roll off automatically within 30 days.</li>
            </ul>
          </Section>

          <Section title="Deleting your data">
            <p>
              You can ask us to delete your profile and your content at any time.
              Email{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>{' '}
              from the address on your account, or ask any C4C Lab admin to
              delete the account for you. We may ask you to confirm your identity
              before we act on a deletion request, so that nobody else can delete
              your work.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">
                Once a deletion request is confirmed, we erase your personal data
                and uploaded content from our live systems and from backups
                within 30 days,
              </strong>{' '}
              except where we are required to retain records by law. Where an
              exception applies we keep only the records the law requires, for
              only as long as it requires, and we delete the rest on the same 30
              day schedule. Reasons we may need to retain something include tax
              and accounting rules, resolving a dispute or legal claim,
              preventing fraud or abuse, or complying with a lawful request.
            </p>
            <p className="mt-2">
              Two things to know before you ask. Deletion is permanent and we
              cannot undo it, so export anything you want to keep first. And
              content you shared into a client project may remain visible to that
              client where they hold their own rights to it, for example footage
              delivered to them under a contract. Tell us if you want that
              handled differently and we will work it out with you.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can request access to, or correction of, your personal data by
              contacting us at{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>.
              You can update your name and photo in the app at any time. To have
              your data erased, see "Deleting your data" above.
            </p>
          </Section>

          <Section title="Children">
            <p>The platform is for business use and is not directed to children under 13.</p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy? Email{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>.
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
