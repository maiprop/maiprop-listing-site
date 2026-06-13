import { Cookie, FileText, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

type PolicyKey = "privacy" | "terms" | "cookie";

type LegalTable = {
  headers: string[];
  rows: string[][];
};

type LegalSubsection = {
  title: string;
  paragraphs?: string[];
  list?: string[];
  table?: LegalTable;
};

type LegalSection = LegalSubsection & {
  subsections?: LegalSubsection[];
};

type LegalPolicyContent = {
  eyebrow: string;
  title: string;
  updated: string;
  sections: LegalSection[];
};

const policyIcons = {
  privacy: { Icon: Shield, bg: "bg-primary/10", color: "text-primary" },
  terms: { Icon: FileText, bg: "bg-brand-gold/10", color: "text-brand-gold" },
  cookie: { Icon: Cookie, bg: "bg-accent/10", color: "text-accent" },
} satisfies Record<PolicyKey, { Icon: typeof Shield; bg: string; color: string }>;

const fallbackPolicy: LegalPolicyContent = {
  eyebrow: "Legal",
  title: "Policy",
  updated: "This policy is temporarily unavailable.",
  sections: [],
};

function isLegalPolicyContent(value: unknown): value is LegalPolicyContent {
  return Boolean(
    value
      && typeof value === "object"
      && "title" in value
      && "sections" in value
      && Array.isArray((value as { sections?: unknown }).sections),
  );
}

function LegalTableView({ table }: { table: LegalTable }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            {table.headers.map((header) => (
              <th key={header} className="text-left py-2 pr-4 text-foreground font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) => (
                <td key={`${cell}-${index}`} className="py-2 pr-4 text-muted-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalBlock({ block, headingLevel = 2 }: { block: LegalSubsection; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingClass = headingLevel === 2
    ? "font-display text-xl font-bold text-foreground mb-3"
    : "font-semibold text-base text-foreground mt-5 mb-2";

  return (
    <section>
      <Heading className={headingClass}>{block.title}</Heading>
      {block.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="mt-3 first:mt-0">
          {paragraph}
        </p>
      ))}
      {block.list && (
        <ul className="list-disc ml-6 mt-2 space-y-1">
          {block.list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {block.table && <LegalTableView table={block.table} />}
    </section>
  );
}

export function LegalPolicyPage({ policyKey }: { policyKey: PolicyKey }) {
  const { t } = useTranslation();
  const content = t(`legalPages.${policyKey}`, { returnObjects: true });
  const policy = isLegalPolicyContent(content) ? content : fallbackPolicy;
  const { Icon, bg, color } = policyIcons[policyKey];

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Navbar />
      <main id="main-content" className="pt-16">
        <section className="py-16 container max-w-4xl">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{policy.eyebrow}</p>
              <h1 className="font-display text-3xl font-bold">{policy.title}</h1>
            </div>
          </div>
          <p className="text-muted-foreground mb-10">{policy.updated}</p>

          <div className="prose prose-invert max-w-none space-y-10 text-sm leading-relaxed text-foreground/85">
            {policy.sections.map((section) => (
              <section key={section.title} className="space-y-5">
                <LegalBlock block={section} />
                {section.subsections?.map((subsection) => (
                  <LegalBlock key={subsection.title} block={subsection} headingLevel={3} />
                ))}
              </section>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
