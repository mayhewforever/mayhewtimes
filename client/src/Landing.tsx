import { ArrowDown, ArrowRight, Check, CheckCheck, ChevronDown, CircleCheck, Clock3, FileText, Leaf, Link2, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import './landing.css';

const PRO_PRICE = '₺399';

const features = [
  { icon: FileText, number: '01', title: 'Price with more confidence.', description: 'Start with a cleaning template, estimate your costs, and choose a target margin. Get a suggested price you can adjust before sending.' },
  { icon: Link2, number: '02', title: 'One link. An easy yes.', description: 'Share a private quote link on WhatsApp, by email, or however you talk to clients. They can review and accept without creating an account.' },
  { icon: CheckCheck, number: '03', title: 'Know where every job stands.', description: 'Keep drafts, sent quotes, and accepted work in one place. Copy a follow-up message when a client needs a friendly nudge.' },
];

const questions = [
  { title: 'Is NeatQuote right for my business?', answer: 'NeatQuote is built for independent residential cleaners and small cleaning teams. Use it for one-off deep cleans, regular home cleaning, and add-on services. You set your own service names and prices.' },
  { title: 'Does my client need an account?', answer: 'No. Your client opens the private link, reviews the quote, and enters their name to accept. You can see the accepted quote in your dashboard.' },
  { title: 'Can I use Turkish lira?', answer: 'Yes. Choose TRY in your business settings to display your quotes in Turkish lira. You can also use other supported currencies and set the tax rate that applies to your business.' },
  { title: 'Does NeatQuote collect payment from my clients?', answer: 'NeatQuote helps you create and get acceptance for quotes. Arrange payment for your cleaning work directly with your client using your usual method. Acceptance does not charge the client.' },
  { title: 'How does the paid plan work?', answer: 'Start with three quotes per month for free. Pro is ₺399 for 30 days of unlimited quoting, paid in advance with no automatic renewal. Pro purchases use secure hosted checkout with iyzico once paid upgrades are activated. You can use the Free plan today.' },
];

function SampleQuote() {
  return (
    <div className="lp-demo-wrap" aria-label="Illustrative example of a cleaning quote">
      <div className="lp-demo-orbit lp-demo-orbit-one" />
      <div className="lp-demo-orbit lp-demo-orbit-two" />
      <div className="lp-demo-sparkle"><Sparkles size={31} strokeWidth={1.4} /></div>
      <div className="lp-quote-card">
        <div className="lp-quote-topline"><span><span className="lp-live-dot" /> SAMPLE QUOTE</span><span>#NQ-014</span></div>
        <div className="lp-quote-business"><span className="lp-quote-mark"><Leaf size={22} strokeWidth={1.6} /></span><div><strong>Olive & Co.</strong><span>HOME CLEANING</span></div></div>
        <div className="lp-quote-rule" />
        <div className="lp-quote-heading"><div><span className="lp-small-label">PREPARED FOR</span><h3>Elif Yılmaz</h3><p>Regular home cleaning · İstanbul</p></div><span className="lp-quote-frequency">Every 2 weeks</span></div>
        <div className="lp-quote-table-heading"><span>SERVICE</span><span>AMOUNT</span></div>
        <div className="lp-quote-line"><div><strong>Home deep clean</strong><span>Kitchen, bathrooms & living spaces</span></div><span>₺1,800.00</span></div>
        <div className="lp-quote-line"><div><strong>Oven deep clean</strong><span>A little extra shine</span></div><span>₺350.00</span></div>
        <div className="lp-quote-calculations"><div><span>Subtotal</span><span>₺2,150.00</span></div><div className="lp-quote-discount"><span>Recurring discount · 10%</span><span>−₺215.00</span></div><div><span>Tax · 20%</span><span>₺387.00</span></div></div>
        <div className="lp-quote-total"><span>Your total</span><strong>₺2,322<span>.00</span></strong></div>
        <div className="lp-quote-accept"><Check size={17} /> Accept quote <ArrowRight size={17} /></div>
        <p className="lp-quote-note"><ShieldCheck size={12} /> No account needed to accept</p>
      </div>
      <div className="lp-accepted-note"><span className="lp-accepted-icon"><Check size={19} /></span><div><strong>Another job on the calendar.</strong><span>Example status: quote accepted</span></div><span className="lp-accepted-dot" /></div>
      <div className="lp-demo-caption">Illustrative sample · your services, your prices</div>
    </div>
  );
}

export default function Landing({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  return (
    <div className="lp-page">
      <header className="lp-header lp-container">
        <a className="lp-brand" href="#"><span className="lp-brand-mark"><Sparkles size={21} strokeWidth={1.8} /></span>neatquote<span className="lp-brand-period">.</span></a>
        <nav className="lp-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#pricing">Pricing</a><button className="lp-login" onClick={onLogin}>Log in</button><button className="lp-button lp-button-dark lp-nav-cta" onClick={onStart}>Get started <ArrowRight size={15} /></button></nav>
      </header>

      <main>
        <section className="lp-hero lp-container">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow"><span /> FOR INDEPENDENT CLEANING BUSINESSES</div>
            <h1>A cleaner way<br /> to win your<br /><span className="lp-heading-accent">next job.</span></h1>
            <p className="lp-hero-description">Good work deserves a great first impression. Create beautiful cleaning quotes, share a simple link, and make it easy for clients to say yes.</p>
            <div className="lp-hero-actions"><button className="lp-button lp-button-dark lp-button-large" onClick={onStart}>Create your first quote <ArrowRight size={18} /></button><a className="lp-how-link" href="#how-it-works">See how it works <ArrowDown size={15} /></a></div>
            <div className="lp-hero-assurances"><span><CircleCheck size={15} /> Free to get started</span><span><CircleCheck size={15} /> No card required</span></div>
          </div>
          <SampleQuote />
        </section>

        <div className="lp-value-strip"><div className="lp-container"><span className="lp-value-intro">Made for the way you work.</span><span><FileText size={17} /> Clear service breakdowns</span><span><Send size={17} /> Share anywhere</span><span><CircleCheck size={17} /> Simple client acceptance</span></div></div>

        <section className="lp-features lp-container">
          <div className="lp-section-heading"><div><div className="lp-eyebrow">LESS ADMIN. MORE MOMENTUM.</div><h2>You handle the cleaning.<br />We’ll help with the quoting.</h2></div><p>The little details that make your business look professional, without adding more to your day.</p></div>
          <div className="lp-feature-grid">{features.map(({ icon: Icon, number, title, description }) => <article className="lp-feature" key={number}><div className="lp-feature-top"><span className="lp-feature-icon"><Icon size={23} strokeWidth={1.6} /></span><span className="lp-feature-number">{number}</span></div><h3>{title}</h3><p>{description}</p></article>)}</div>
        </section>

        <section className="lp-work-section" id="how-it-works"><div className="lp-container lp-work-grid"><div className="lp-work-intro"><div className="lp-eyebrow">FROM HELLO TO BOOKED</div><h2>A few minutes.<br />A better impression.</h2><p>No complicated software to learn. Just a straightforward way to turn your next inquiry into a quote you’re proud to send.</p><button className="lp-button lp-button-dark" onClick={onStart}>Let’s make a quote <ArrowRight size={17} /></button><div className="lp-work-decoration" aria-hidden="true"><span><Plus size={23} /></span><span><ArrowRight size={23} /></span><span><Check size={23} /></span></div></div><div className="lp-steps"><article><span className="lp-step-number">1</span><div><h3>Make it yours</h3><p>Add your business details, choose your currency, and give your quote a personal touch.</p></div></article><article><span className="lp-step-number">2</span><div><h3>Find your price. Build your quote.</h3><p>Use a service template or the margin helper. Add extras, discounts, and tax, and we’ll handle the calculations.</p></div></article><article><span className="lp-step-number">3</span><div><h3>Share it. Get the yes.</h3><p>Send the link to your client. They review and accept, and you see the status in your dashboard.</p></div></article></div></div></section>

        <section className="lp-pricing lp-container" id="pricing"><div className="lp-section-heading lp-centered"><div className="lp-eyebrow">SMALL BUSINESS. SIMPLE PRICING.</div><h2>Start free. Grow at your pace.</h2><p>A useful free plan today, with room for a busier tomorrow.</p></div><div className="lp-price-grid"><article className="lp-price-card"><span className="lp-plan-eyebrow">FOR GETTING STARTED</span><h3>Free</h3><div className="lp-price">₺0<span>/ month</span></div><p>Everything you need to send your first quotes.</p><button className="lp-button lp-button-outline" onClick={onStart}>Start for free <ArrowRight size={17} /></button><ul><li><Check size={17} /> 3 quotes every month</li><li><Check size={17} /> Templates & margin helper</li><li><Check size={17} /> Your business details & currency</li><li><Check size={17} /> Share links & track acceptance</li><li><Check size={17} /> Follow-ups & printable quotes</li></ul><span className="lp-plan-bottom">No card. No commitment.</span></article><article className="lp-price-card lp-price-pro"><span className="lp-plan-badge"><Sparkles size={13} /> ROOM TO GROW</span><span className="lp-plan-eyebrow">FOR A FULLER CALENDAR</span><h3>Pro</h3><div className="lp-price">{PRO_PRICE}<span>/ 30 days</span></div><p>More room to quote as your business grows.</p><button className="lp-button lp-button-mint" onClick={onStart}>Get started with Free <ArrowRight size={17} /></button><ul><li><Check size={17} /> Unlimited quotes for 30 days</li><li><Check size={17} /> Everything in the Free plan</li><li><Check size={17} /> Pay in advance, no automatic renewal</li></ul><div className="lp-pro-note"><Clock3 size={16} /><span>Paid upgrades are being prepared. Start with the Free plan today.</span></div><span className="lp-plan-bottom">Secure hosted checkout with iyzico when available.</span></article></div></section>

        <section className="lp-faq lp-container"><div className="lp-faq-intro"><div className="lp-eyebrow">A FEW GOOD QUESTIONS</div><h2>Let’s clear<br />things up.</h2><p>A little clarity before your first quote.</p></div><div className="lp-faq-list">{questions.map(({ title, answer }) => <details key={title}><summary>{title}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

        <section className="lp-final-cta lp-container"><div className="lp-final-sparkle"><Sparkles size={34} strokeWidth={1.3} /></div><div><span className="lp-eyebrow">YOUR NEXT JOB STARTS HERE</span><h2>Make your first impression<br />a sparkling one.</h2><p>Your first three quotes are on us. Let’s get to work.</p></div><button className="lp-button lp-button-dark lp-button-large" onClick={onStart}>Create your first quote <ArrowRight size={18} /></button></section>
      </main>

      <footer className="lp-footer lp-container"><a className="lp-brand" href="#"><span className="lp-brand-mark"><Sparkles size={18} /></span>neatquote<span className="lp-brand-period">.</span></a><span>Good work. Clearly quoted.</span><div><a href="#pricing">Pricing</a><button onClick={onLogin}>Log in</button><span>© {new Date().getFullYear()} NeatQuote</span></div></footer>
    </div>
  );
}
