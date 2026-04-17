import { useState } from "react";
import { ClipboardList, Download, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useReportUsage, useRecordReport, REPORT_INCLUDED, REPORT_EXTRA_COST } from "@/hooks/useUsageAddons";

interface Props {
  listingId: string;
}

export function PropertyReportCard({ listingId }: Props) {
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const { data: reportCount = 0 } = useReportUsage();
  const recordReport = useRecordReport();

  const [reportLoaded, setReportLoaded] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  return (
    <div className={`glass-card rounded-2xl overflow-hidden border ${reportLoaded ? "border-primary/30" : "border-primary/20"}`}>
      <div className="flex items-center gap-2 px-5 py-3.5 bg-primary/5 border-b border-primary/20">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-sm flex-1">Property Report</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
          mAI Prop · 2026 Model
        </span>
      </div>

      <div className="p-5">
        {!isPro ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/pricing">
                <Zap className="w-4 h-4" /> Upgrade to Pro
              </Link>
            </Button>
            <p className="text-[10px] text-muted-foreground">Pro Feature · Unlock full reports</p>
          </div>
        ) : reportLoaded ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Report loaded. Download your full PDF below.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2">
              <Download className="w-4 h-4" /> Download PDF
            </Button>
            <p className="text-[10px] text-muted-foreground">Full · Instant · PDF export</p>
          </div>
        ) : reportCount >= REPORT_INCLUDED ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Included reports used this month. Extra reports cost €{REPORT_EXTRA_COST} each.
            </p>
            <Button className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2" asChild>
              <Link to="/pricing"><Zap className="w-4 h-4" /> Get Extra Report</Link>
            </Button>
            <p className="text-[10px] text-muted-foreground">€{REPORT_EXTRA_COST} per extra report</p>
          </div>
        ) : (
          <div className="text-center space-y-3">
            {isPro && (
              <p className="text-[10px] text-muted-foreground">
                {Math.max(0, REPORT_INCLUDED - reportCount)} of {REPORT_INCLUDED} reports remaining this month
              </p>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Deep-dive: Area trends, comparable sales, property specifics analysis, and charts.
            </p>
            <Button
              className="w-full bg-gradient-primary border-0 text-primary-foreground gap-2"
              onClick={async () => {
                if (!user) return;
                setReportLoading(true);
                try {
                  await recordReport.mutateAsync(listingId);
                  setReportLoaded(true);
                } finally {
                  setReportLoading(false);
                }
              }}
              disabled={reportLoading}
            >
              {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {reportLoading ? "Loading…" : "Load Report"}
            </Button>
            <p className="text-[10px] text-muted-foreground">Full · Instant · Not a formal report</p>
          </div>
        )}
      </div>
    </div>
  );
}
