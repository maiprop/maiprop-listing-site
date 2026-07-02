import { useState, useMemo } from "react";
import { Calculator, TrendingUp, Percent, DollarSign, BarChart2 } from "lucide-react";
import { calculateMonthlyRentEstimate } from "@/lib/priceCalculations";

type Props = {
  /** Prefill purchase price from listing (optional) */
  defaultPrice?: number;
  /** Prefill sqm for yield estimate (optional) */
  defaultSqm?: number;
  className?: string;
};

export function ROICalculator({ defaultPrice = 200000, defaultSqm = 80, className = "" }: Props) {
  const initialMonthlyRent = calculateMonthlyRentEstimate({ price: defaultPrice, sqm: defaultSqm });
  const [purchasePrice, setPurchasePrice] = useState(defaultPrice);
  const [downPaymentPct, setDownPaymentPct] = useState(25);
  const [interestRate, setInterestRate] = useState(4.5);
  const [loanYears, setLoanYears] = useState(25);
  const [monthlyRent, setMonthlyRent] = useState(initialMonthlyRent); // ~€8/sqm/mo heuristic
  const [monthlyExpenses, setMonthlyExpenses] = useState(Math.round(initialMonthlyRent * 0.25)); // ~25% of rent
  const [appreciationPct, setAppreciationPct] = useState(3);

  const result = useMemo(() => {
    const down = purchasePrice * (downPaymentPct / 100);
    const loan = purchasePrice - down;
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanYears * 12;
    const monthlyPayment =
      loan > 0 && monthlyRate > 0
        ? (loan * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
        : 0;

    const grossIncome = monthlyRent * 12;
    const operatingExpenses = monthlyExpenses * 12;
    const noi = grossIncome - operatingExpenses;
    const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

    const annualDebtService = monthlyPayment * 12;
    const cashFlow = noi - annualDebtService;
    const cashInvested = down;
    const cashOnCash = cashInvested > 0 ? (cashFlow / cashInvested) * 100 : 0;

    const year5Value = purchasePrice * Math.pow(1 + appreciationPct / 100, 5);
    const equityGain = year5Value - purchasePrice;
    const totalReturn5y = equityGain + cashFlow * 5;
    const roi5y = cashInvested > 0 ? (totalReturn5y / cashInvested) * 100 : 0;

    return {
      capRate,
      cashOnCash,
      monthlyPayment: Math.round(monthlyPayment),
      cashFlow: Math.round(cashFlow),
      noi: Math.round(noi),
      roi5y,
      year5Value: Math.round(year5Value),
    };
  }, [
    purchasePrice,
    downPaymentPct,
    interestRate,
    loanYears,
    monthlyRent,
    monthlyExpenses,
    appreciationPct,
  ]);

  return (
    <div className={`glass-card rounded-2xl overflow-hidden border border-border ${className}`}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-muted/30">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calculator className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h4 className="font-display font-semibold text-sm">ROI Calculator</h4>
          <p className="text-[11px] text-muted-foreground">Cap rate, cash-on-cash, 5-year ROI</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Purchase price (€)</label>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Down payment (%)</label>
            <input
              type="number"
              value={downPaymentPct}
              onChange={(e) => setDownPaymentPct(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Interest rate (%)</label>
            <input
              type="number"
              step={0.1}
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Loan term (years)</label>
            <input
              type="number"
              value={loanYears}
              onChange={(e) => setLoanYears(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Monthly rent (€)</label>
            <input
              type="number"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Monthly expenses (€)</label>
            <input
              type="number"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Annual appreciation (%)</label>
            <input
              type="number"
              step={0.5}
              value={appreciationPct}
              onChange={(e) => setAppreciationPct(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl p-3 bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Percent className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-primary uppercase">Cap rate</span>
            </div>
            <p className="font-display font-bold text-lg text-primary">{result.capRate.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl p-3 bg-brand-gold/10 border border-brand-gold/20">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-brand-gold" />
              <span className="text-[10px] font-semibold text-brand-gold uppercase">Cash-on-cash</span>
            </div>
            <p className="font-display font-bold text-lg text-brand-gold">{result.cashOnCash.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl p-3 bg-brand-emerald/10 border border-brand-emerald/20">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart2 className="w-3.5 h-3.5 text-brand-emerald" />
              <span className="text-[10px] font-semibold text-brand-emerald uppercase">5-yr ROI</span>
            </div>
            <p className="font-display font-bold text-lg text-brand-emerald">{result.roi5y.toFixed(0)}%</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl p-3 bg-muted/50 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">Monthly cash flow</span>
            </div>
            <p className="font-display font-semibold text-foreground">
              {result.cashFlow >= 0 ? "+" : ""}€{result.cashFlow.toLocaleString()}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground pt-1">
          Indicative only. NOI = gross rent − operating expenses. Excludes taxes, vacancy, capex.
        </p>
      </div>
    </div>
  );
}
