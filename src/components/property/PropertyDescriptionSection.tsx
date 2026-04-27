import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Section, SectionHeader } from "@/components/property/DetailPrimitives";

interface Props {
  description: string | null | undefined;
}

/**
 * Property description with read-more / read-less toggle.
 * Self-contained: owns the expanded state internally so the parent page
 * doesn't need to track it.
 */
export function PropertyDescriptionSection({ description }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;
  return (
    <Section>
      <SectionHeader icon={FileText} title="Description" />
      <div className="p-6">
        <div
          className={`text-sm text-muted-foreground leading-relaxed ${
            expanded ? "" : "line-clamp-4"
          }`}
        >
          {description}
        </div>
        {description.length > 200 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary mt-3 hover:underline font-medium"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />Read more
              </>
            )}
          </button>
        )}
      </div>
    </Section>
  );
}
