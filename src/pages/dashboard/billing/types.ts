export interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  amount_due?: number | null;
  subtotal?: number | null;
  total?: number | null;
  tax_amount?: number | null;
  currency: string;
  created: string;
  period_start: string | null;
  period_end: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  payment_intent_id?: string | null;
  charge_id?: string | null;
  receipt_url?: string | null;
  description: string | null;
  automatic_tax?: {
    enabled: boolean | null;
    status: string | null;
  } | null;
  customer_tax_exempt?: string | null;
  customer_tax_ids?: Array<{
    id: string | null;
    type: string | null;
    value: string | null;
  }>;
  taxes?: Array<{
    amount: number | null;
    taxable_amount: number | null;
    taxability_reason: string | null;
    tax_rate_id: string | null;
    display_name: string | null;
    percentage: number | null;
    country: string | null;
  }>;
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
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    plan_name: string;
    amount: number | null;
    currency: string;
    interval: string;
    product_id?: string | null;
    price_id?: string | null;
    subscription_item_id?: string | null;
    plan_key?: string | null;
  } | null;
}
