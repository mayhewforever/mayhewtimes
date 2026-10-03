export type User = { id: string; name: string; email: string; businessName: string; businessEmail: string; phone: string; currency: string; plan: 'free' | 'pro'; proUntil?: string | null };
export type QuoteItem = { name: string; description: string; quantity: number; unitPrice: number };
export type Frequency = 'one-time' | 'weekly' | 'biweekly' | 'monthly';
export type QuoteInput = { title: string; clientName: string; clientEmail: string; address: string; frequency: Frequency; items: QuoteItem[]; discountPercent: number; taxPercent: number; notes: string; validUntil: string };
export type Quote = QuoteInput & { id: string; currency?: string; status: 'draft' | 'sent' | 'accepted'; createdAt: string; updatedAt: string; publicToken: string; subtotal: number; discount: number; tax: number; total: number; acceptedAt: string | null; acceptedName: string | null };
export type Business = { name: string; email: string; phone: string; currency: string };
export type Usage = { used: number; limit: number | null; month: string };
