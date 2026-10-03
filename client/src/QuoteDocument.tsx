import { Check, Mail, MapPin, Phone, Sparkles } from 'lucide-react';
import type { Business, Quote, QuoteInput } from './types';
import { dateLabel, money } from './api';

export const frequencyLabels = { 'one-time': 'One-time cleaning', weekly: 'Weekly cleaning', biweekly: 'Every two weeks', monthly: 'Monthly cleaning' };
export function lineAmount(quantity: number, unitPrice: number) {
  return Math.floor((Math.round(quantity * 100) * unitPrice + 50) / 100);
}
export function totals(quote: QuoteInput) {
  const subtotal = quote.items.reduce((sum, item) => sum + lineAmount(item.quantity, item.unitPrice), 0);
  const discount = Math.floor((subtotal * Math.round(quote.discountPercent * 100) + 5000) / 10000);
  const tax = Math.floor(((subtotal - discount) * Math.round(quote.taxPercent * 100) + 5000) / 10000);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}
export default function QuoteDocument({ quote, business }: { quote: QuoteInput | Quote; business: Business }) {
  const values = 'total' in quote ? quote : totals(quote);
  const accepted = 'status' in quote && quote.status === 'accepted';
  return <article className="quote-document">
    <div className="document-heading"><div className="document-business"><span className="document-mark"><Sparkles size={22} /></span><div><strong>{business.name || 'Your cleaning business'}</strong><span>Cleaning, thoughtfully done.</span></div></div><span className="document-label">SERVICE QUOTE · {business.currency}</span></div>
    <div className="document-title"><p className="eyebrow">A fresh start for your space</p><h1>{quote.title || 'Your cleaning quote'}</h1><div className="document-frequency">{frequencyLabels[quote.frequency]}</div></div>
    <div className="document-details"><div><p className="small-label">PREPARED FOR</p><strong>{quote.clientName || 'Client name'}</strong>{quote.address && <span><MapPin size={13} />{quote.address}</span>}{quote.clientEmail && <span><Mail size={13} />{quote.clientEmail}</span>}</div><div><p className="small-label">VALID UNTIL</p><strong>{quote.validUntil ? dateLabel(quote.validUntil) : 'Select a date'}</strong><span>{'createdAt' in quote ? `Prepared ${dateLabel(quote.createdAt)}` : 'Prepared just for you'}</span></div></div>
    <table className="document-items"><thead><tr><th>Service</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{quote.items.map((item, index) => <tr key={index}><td><strong>{item.name || 'Cleaning service'}</strong>{item.description && <span>{item.description}</span>}</td><td>{item.quantity}</td><td>{money(item.unitPrice, business.currency)}</td><td>{money(lineAmount(item.quantity, item.unitPrice), business.currency)}</td></tr>)}</tbody></table>
    <div className="document-totals"><div><span>Subtotal</span><strong>{money(values.subtotal, business.currency)}</strong></div>{quote.discountPercent > 0 && <div><span>Discount ({quote.discountPercent}%)</span><strong>−{money(values.discount, business.currency)}</strong></div>}{quote.taxPercent > 0 && <div><span>Tax ({quote.taxPercent}%)</span><strong>{money(values.tax, business.currency)}</strong></div>}<div className="document-total"><span>{quote.frequency === 'one-time' ? 'Total' : 'Total per visit'}</span><strong>{money(values.total, business.currency)}</strong></div></div>
    {quote.notes && <div className="document-notes"><p className="small-label">THE LITTLE DETAILS</p><p>{quote.notes}</p></div>}
    {accepted && <div className="document-accepted"><Check size={18} /><span>Accepted by {quote.acceptedName} on {dateLabel(quote.acceptedAt || quote.updatedAt)}</span></div>}
    <div className="document-footer"><strong>We look forward to making your space shine.</strong><div>{business.email && <span><Mail size={13} />{business.email}</span>}{business.phone && <span><Phone size={13} />{business.phone}</span>}</div></div>
  </article>;
}
