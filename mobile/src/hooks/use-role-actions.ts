import type { AppRole } from '@/types/domain';

export type RoleAction = {
  title: string;
  body: string;
  accent: string;
};

export function getRoleActions(role: AppRole): RoleAction[] {
  switch (role) {
    case 'seller':
      return [
        { title: 'Create listing', body: 'Draft, price, and publish a property from mobile.', accent: '#0F766E' },
        { title: 'Lead triage', body: 'Review buyer requests and viewing intent.', accent: '#B95D22' },
        { title: 'Open house', body: 'Track registrations and private offers.', accent: '#256E4A' },
      ];
    case 'agent':
    case 'professional':
      return [
        { title: 'Lead inbox', body: 'Prioritize hot leads and reply fast.', accent: '#0F766E' },
        { title: 'Portfolio', body: 'Manage active stock and promoted listings.', accent: '#B95D22' },
        { title: 'Verification', body: 'Keep trust status and services current.', accent: '#256E4A' },
      ];
    case 'developer':
      return [
        { title: 'Projects', body: 'Monitor new-build inventory and unit interest.', accent: '#0F766E' },
        { title: 'Reservations', body: 'Track qualified buyers and next follow-ups.', accent: '#B95D22' },
        { title: 'Media kit', body: 'Keep project assets consistent across channels.', accent: '#256E4A' },
      ];
    case 'investor':
      return [
        { title: 'Deal flow', body: 'Review firesales, auctions, and off-market matches.', accent: '#0F766E' },
        { title: 'Proof of funds', body: 'Keep verification ready for fast offers.', accent: '#B95D22' },
        { title: 'Watchlist', body: 'Track discounts and AI-ranked opportunities.', accent: '#256E4A' },
      ];
    case 'admin':
      return [
        { title: 'Moderation', body: 'Review listings, reports, and verification queues.', accent: '#0F766E' },
        { title: 'Pricing', body: 'Watch subscription health and plan limits.', accent: '#B95D22' },
        { title: 'Platform', body: 'Keep operational queues moving.', accent: '#256E4A' },
      ];
    case 'buyer':
    default:
      return [
        { title: 'Saved search', body: 'Follow homes, price moves, and new matches.', accent: '#0F766E' },
        { title: 'Book viewing', body: 'Request in-person or online property tours.', accent: '#B95D22' },
        { title: 'Compare', body: 'Shortlist homes with AI and neighborhood signals.', accent: '#256E4A' },
      ];
  }
}
