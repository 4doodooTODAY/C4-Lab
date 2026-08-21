// Public user agreement. Reachable at /terms with no login so it can be linked
// from the App Store and Play Store listings and from the application form.
//
// IMPORTANT: this is a drafted agreement, not legal advice. Two clauses in
// particular need a lawyer's eyes before you rely on them:
//
//   1. Arbitration. This is written provider-neutral on purpose: it does not
//      name a forum, it defers to whatever consumer rules apply, and it caps
//      what arbitration can cost the claimant. That combination is what keeps
//      a clause like this from being struck down as unconscionable, which is
//      the usual fate of clauses that name an expensive forum. Have counsel
//      confirm the fee-shifting language matches the provider you settle on.
//   2. The liability cap. Maryland enforces caps between commercial parties,
//      but the savings clause below is what keeps it from failing wholesale in
//      states that limit them.

const UPDATED = 'August 20, 2026'
const CONTACT = 'yourmove@connectfourcreative.com'
const ENTITY  = 'Connect Four Creative'
const STATE   = 'Maryland'

export default function Terms() {
  return (
    <div className="app-ground min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-14 text-text-secondary">
        <h1 className="display mb-2">User Agreement</h1>
        <p className="text-sm text-text-muted mb-8">Last updated {UPDATED}</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <p>
            This User Agreement ("Agreement") is a binding contract between you
            and {ENTITY} ("Company", "we", "us"), and governs your use of C4C Lab
            and any related sites, apps, and services (the "Service"). By
            creating an account, applying for access, or using the Service, you
            agree to this Agreement. If you do not agree, do not use the Service.
          </p>

          <Section title="1. Eligibility and accounts">
            <p>
              The Service is invitation only and intended for business use. You
              must be at least 18 years old and able to form a binding contract.
              If you use the Service on behalf of a company or client, you
              represent that you have authority to bind that organization to this
              Agreement, and "you" includes that organization.
            </p>
            <p className="mt-2">
              You are responsible for everything that happens under your account
              and for keeping your credentials confidential. Tell us promptly at{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>{' '}
              if you believe your account has been compromised. We may approve,
              refuse, suspend, or revoke access at our discretion.
            </p>
          </Section>

          <Section title="2. Your content">
            <p>
              You keep ownership of the footage, photos, video, captions,
              comments, and other material you upload or create ("Your Content").
              You grant us a non-exclusive, worldwide, royalty free license to
              host, store, reproduce, encode, transmit, and display Your Content
              solely to operate and provide the Service to you and to the
              collaborators and clients you share it with. This license ends when
              you delete Your Content, subject to reasonable backup retention as
              described in our{' '}
              <a href="/privacy" className="text-accent-hover underline underline-offset-2">Privacy Policy</a>.
            </p>
            <p className="mt-2">
              You represent that you have all rights, releases, and permissions
              necessary for Your Content, including from people who appear in it
              and from any rights holders in music or other embedded material.
            </p>
          </Section>

          <Section title="3. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Upload material you do not have the rights to, or that is unlawful, infringing, or defamatory.</li>
              <li>Attempt to access accounts, data, or areas of the Service that are not yours.</li>
              <li>Probe, scan, reverse engineer, or interfere with the Service or its security.</li>
              <li>Use bots, scrapers, or automated tools to access the Service, submit applications, or generate load beyond normal human use.</li>
              <li>Resell, sublicense, or provide the Service to third parties outside your organization without our written consent.</li>
            </ul>
            <p className="mt-2">
              We apply rate limits and other automated protections to keep the
              Service available. Circumventing them is a breach of this Agreement.
            </p>
          </Section>

          <Section title="4. Fees">
            <p>
              Some access to the Service is provided under a separate written
              order, statement of work, or invoice with {ENTITY}. Where fees
              apply, they are due as stated in that document and, unless it says
              otherwise, are non-refundable. Fees are exclusive of taxes, which
              are your responsibility.
            </p>
          </Section>

          <Section title="5. Termination">
            <p>
              You may stop using the Service at any time and may request deletion
              of your account as described in our{' '}
              <a href="/privacy" className="text-accent-hover underline underline-offset-2">Privacy Policy</a>.
              We may suspend or terminate your access immediately if you breach
              this Agreement, if your use puts the Service or other users at
              risk, or if we are required to do so by law. Sections 6 through 11
              survive termination.
            </p>
          </Section>

          <Section title="6. Disclaimer of warranties">
            <p className="uppercase">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
              WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY. TO
              THE FULLEST EXTENT PERMITTED BY LAW, THE COMPANY DISCLAIMS ALL
              IMPLIED WARRANTIES, INCLUDING THE IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON
              INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
              UNINTERRUPTED, SECURE, OR ERROR FREE, OR THAT ANY CONTENT WILL BE
              PRESERVED WITHOUT LOSS. YOU ARE RESPONSIBLE FOR MAINTAINING YOUR
              OWN BACKUP COPIES OF YOUR CONTENT.
            </p>
          </Section>

          <Section title="7. Limitation of liability">
            <p className="uppercase">
              IN NO EVENT SHALL THE COMPANY, ITS OWNERS, OFFICERS, EMPLOYEES,
              CONTRACTORS, OR SUPPLIERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY
              LOSS OF PROFITS, REVENUE, GOODWILL, BUSINESS OPPORTUNITY, OR
              ANTICIPATED SAVINGS, OR FOR ANY LOSS, CORRUPTION, OR UNAUTHORIZED
              DISCLOSURE OF DATA OR CONTENT, OR FOR ANY INTERRUPTION OF THE
              SERVICE, ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE
              SERVICE, WHETHER BASED IN CONTRACT, TORT (INCLUDING NEGLIGENCE),
              STRICT LIABILITY, OR ANY OTHER THEORY, AND WHETHER OR NOT THE
              COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="uppercase mt-3">
              THE COMPANY'S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT
              OF OR RELATING TO THIS AGREEMENT OR THE SERVICE SHALL NOT EXCEED
              THE LESSER OF (A) THE TOTAL AMOUNTS YOU ACTUALLY PAID TO THE
              COMPANY FOR THE SERVICE IN THE TWELVE (12) MONTHS IMMEDIATELY
              PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) TEN THOUSAND
              US DOLLARS ($10,000).
            </p>
            <p className="mt-3">
              Some jurisdictions do not allow the exclusion or limitation of
              certain warranties or damages, so parts of Sections 6 and 7 may not
              apply to you. In those jurisdictions the Company's liability is
              limited to the greatest extent permitted by law. Nothing in this
              Agreement excludes liability for fraud, willful misconduct, or any
              liability that cannot lawfully be excluded. The limitations in this
              Section apply even if a limited remedy fails of its essential
              purpose, and they reflect an agreed allocation of risk that is a
              basis of the bargain between us.
            </p>
          </Section>

          <Section title="8. Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless the Company and
              its owners, officers, employees, contractors, and agents from and
              against any and all claims, demands, actions, damages, losses,
              liabilities, judgments, settlements, costs, and expenses (including
              reasonable attorneys' fees) arising out of or relating to: (a) Your
              Content, including any claim that it infringes or misappropriates
              the rights of a third party or was used without a required release
              or license; (b) your use of the Service; (c) your breach of this
              Agreement or of any law; or (d) your violation of the rights of any
              third party.
            </p>
            <p className="mt-2">
              We will notify you of any such claim and may, at our option,
              participate in the defense with counsel of our choosing at our own
              expense. You may not settle any claim in a way that imposes an
              obligation or admission on the Company without our prior written
              consent.
            </p>
          </Section>

          <Section title="9. Dispute resolution and arbitration">
            <p>
              Please read this Section carefully. It affects how disputes between
              us are resolved and limits the ways you can seek relief.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Informal resolution first.</strong>{' '}
              Before starting an arbitration, you agree to contact us at{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>{' '}
              with a written description of the dispute and to negotiate in good
              faith for at least thirty (30) days.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Binding arbitration.</strong>{' '}
              Any dispute arising out of or relating to this Agreement or the
              Service that is not resolved informally shall be finally settled
              by binding arbitration rather than in court, except as stated under
              "Exceptions" below. The arbitration shall be administered by a
              neutral, nationally recognized arbitration provider agreed by the
              parties, under that provider's rules in effect at the time the
              claim is filed, including any consumer arbitration rules that apply
              to you. If the parties cannot agree on a provider within thirty
              (30) days, either party may ask a court of competent jurisdiction
              to appoint one.
            </p>
            <p className="mt-2">
              The arbitration shall be before a single arbitrator, seated in{' '}
              {STATE}, United States of America, and conducted in English. The
              arbitrator may award the same individual relief a court could, and
              the award is final and binding. Judgment on the award may be
              entered in any court of competent jurisdiction. The law governing
              this Agreement is the law of the State of {STATE}, as stated in
              Section 10.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Costs.</strong> Each party
              bears its own attorneys' fees unless the arbitrator awards them.
              Where you are an individual consumer, we will pay the filing,
              administrative, and arbitrator fees to the extent the provider's
              consumer rules require, and in any event arbitration will not cost
              you more than filing the same claim in court. If the cost of
              arbitration would prevent you from bringing a claim, tell us and we
              will work with you so that cost is not the reason your claim goes
              unheard.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Remote participation.</strong>{' '}
              If you live outside {STATE}, you may participate in hearings by
              telephone or video, and the arbitrator may decide a claim on
              written submissions alone where the provider's rules allow it.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">Exceptions.</strong> Either
              party may bring an individual claim in a small claims court of
              competent jurisdiction, and either party may seek injunctive or
              other equitable relief in a court of competent jurisdiction to
              protect its intellectual property or confidential information
              without first meeting the requirements above.
            </p>
            <p className="mt-2">
              <strong className="text-text-primary">No class actions.</strong>{' '}
              All claims must be brought in an individual capacity and not as a
              plaintiff or class member in any purported class, collective, or
              representative proceeding, and the arbitrator may not consolidate
              the claims of more than one person. If this waiver is found
              unenforceable as to a particular claim, that claim shall proceed in
              court and the remainder of this Section shall stay in force.
            </p>
          </Section>

          <Section title={`10. Governing law and venue`}>
            <p>
              This Agreement and any dispute arising out of it are governed by
              the laws of the State of {STATE}, United States of America, without
              regard to its conflict of laws rules. The United Nations Convention
              on Contracts for the International Sale of Goods does not apply.
              Subject to Section 9, you and the Company consent to the exclusive
              jurisdiction and venue of the state and federal courts located in{' '}
              {STATE} for any matter not subject to arbitration.
            </p>
          </Section>

          <Section title="11. General">
            <p>
              This Agreement, together with the{' '}
              <a href="/privacy" className="text-accent-hover underline underline-offset-2">Privacy Policy</a>{' '}
              and any written order or statement of work between us, is the entire
              agreement about the Service. If any provision is held unenforceable,
              it will be modified to the minimum extent necessary and the rest
              stays in effect. Our failure to enforce a provision is not a waiver
              of it. You may not assign this Agreement without our written
              consent; we may assign it in connection with a merger, acquisition,
              or sale of assets.
            </p>
            <p className="mt-2">
              We may update this Agreement. If a change is material we will give
              notice in the app or by email before it takes effect. Continuing to
              use the Service after a change takes effect means you accept the
              updated Agreement.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about this Agreement? Email{' '}
              <a href={`mailto:${CONTACT}`} className="text-accent-hover underline underline-offset-2">{CONTACT}</a>.
            </p>
          </Section>

          <p className="pt-4 border-t border-border text-xs text-text-muted">
            See also our{' '}
            <a href="/privacy" className="text-accent-hover underline underline-offset-2">Privacy Policy</a>{' '}
            and{' '}
            <a href="/support" className="text-accent-hover underline underline-offset-2">Support</a> page.
          </p>
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
