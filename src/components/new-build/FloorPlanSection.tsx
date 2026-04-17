import { useState } from "react";
import { FileImage, Info, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FloorPlanSection({
  images,
  onRequestPlans,
}: {
  images: string[];
  onRequestPlans: () => void;
}) {
  const [activeFloor, setActiveFloor] = useState(0);
  const additionalImages = images.filter((_url, i) => i > 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="font-display font-semibold mb-1 flex items-center gap-2">
        <FileImage className="w-4 h-4 text-primary" /> Gallery
      </h2>
      <p className="text-xs text-muted-foreground mb-4">Additional photos and project visuals</p>

      {additionalImages.length > 0 ? (
        <div className="space-y-3">
          {additionalImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {additionalImages.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFloor(i)}
                  className={`relative shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === activeFloor ? "border-primary" : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl overflow-hidden border border-border bg-muted aspect-[4/3]">
            <img src={additionalImages[activeFloor]} alt="Gallery image" className="w-full h-full object-contain" />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" />
            Images are indicative — final specifications confirmed at reservation
          </p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <FileImage className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">More details available on request</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contact the developer to receive detailed unit layouts, dimensions, and specifications
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={onRequestPlans}>
            <MessageSquare className="w-3.5 h-3.5" /> Request more details
          </Button>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4 flex items-start gap-3 rounded-lg bg-secondary/40 p-3">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Full unit availability, exact sizes, and per-unit pricing are provided by the developer on request. Use the <strong>Register Interest</strong> form to receive the full unit schedule.
        </p>
      </div>
    </div>
  );
}
