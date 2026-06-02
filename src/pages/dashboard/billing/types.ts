export interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  description: string | null;
}

export interface BillingInfo {
  invoices: Invoice[];
  billing_configured?: boolean;
  customer_found?: boolean;
  portal_eligible?: boolean;
  billing_reason?: string;
  subscription: {
    id: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    plan_name: string;
    amount: number | null;
    currency: string;
    interval: string;
  } | null;
}
