export const propertyTypeCards = [
  { label: 'Apartment', emoji: 'Apt', href: 'apartment', body: 'City homes and investment flats' },
  { label: 'Land', emoji: 'Land', href: 'land', body: 'Plots, buildable parcels, zones' },
  { label: 'New Dev', emoji: 'New', href: 'pre_sale', body: 'Off-plan and new builds' },
  { label: 'Retail Shop', emoji: 'Shop', href: 'shop', body: 'Commercial storefronts' },
  { label: 'Open House', emoji: 'Open', href: 'open_house', body: 'Upcoming property events' },
  { label: 'Auctions', emoji: 'Bid', href: 'auction', body: 'Court auction opportunities' },
];

export const commercialChips = [
  'Warehouse',
  'Restaurant / Cafe',
  'Hotel / B&B',
  'Clinic / Medical',
  'Industrial Space',
  'Showroom',
  'Hall / Event Space',
  'Business Centre',
];

export const professionalGroups = [
  {
    id: 'agents',
    label: 'Real Estate Agents',
    short: 'Agents',
    categories: ['real_estate_agent'],
    tone: '#0F766E',
  },
  {
    id: 'legal',
    label: 'Legal & Title',
    short: 'Legal',
    categories: ['lawyer', 'notary'],
    tone: '#8B5CF6',
  },
  {
    id: 'finance',
    label: 'Finance & Insurance',
    short: 'Finance',
    categories: ['financial_advisor', 'valuer', 'insurance_broker'],
    tone: '#256E4A',
  },
  {
    id: 'design',
    label: 'Design & Planning',
    short: 'Design',
    categories: ['architect', 'civil_engineer', 'interior_designer'],
    tone: '#B95D22',
  },
  {
    id: 'construction',
    label: 'Construction & Trades',
    short: 'Trades',
    categories: ['electrician', 'plumber', 'contractor', 'carpenter', 'painter'],
    tone: '#0E7490',
  },
  {
    id: 'management',
    label: 'Property & Hospitality',
    short: 'Management',
    categories: ['property_manager', 'facility_manager', 'short_term_rental_operator'],
    tone: '#A16207',
  },
];

export const professionalCategoryLabels: Record<string, string> = {
  real_estate_agent: 'Real Estate Agent',
  lawyer: 'Lawyer',
  notary: 'Notary',
  architect: 'Architect',
  civil_engineer: 'Civil Engineer',
  interior_designer: 'Interior Designer',
  financial_advisor: 'Financial Advisor',
  valuer: 'Valuer',
  insurance_broker: 'Insurance Broker',
  electrician: 'Electrician',
  plumber: 'Plumber',
  contractor: 'Contractor',
  property_manager: 'Property Manager',
  facility_manager: 'Facility Manager',
  short_term_rental_operator: 'Short-Term Rental',
};
