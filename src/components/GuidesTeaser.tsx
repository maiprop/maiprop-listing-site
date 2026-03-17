import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollReveal, RevealItem } from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";

interface Article {
  id: string;
  slug: string;
  title: string;
  meta_description: string;
  category: string;
  read_time: string;
  updated_at: string;
}

const categoryColors: Record<string, string> = {
  "Golden Visa": "bg-primary/10 text-primary",
  "Investment": "bg-accent/10 text-accent-foreground",
  "Tax & Finance": "bg-secondary/10 text-secondary-foreground",
  default: "bg-muted text-muted-foreground",
};

export default function GuidesTeaser() {
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    supabase
      .from("articles")
      .select("id, slug, title, meta_description, category, read_time, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setArticles(data);
      });
  }, []);

  if (articles.length === 0) return null;

  return (
    <section id="resources" className="py-20 bg-background" aria-labelledby="guides-teaser-heading">
      <div className="container mx-auto px-6 max-w-6xl">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <Badge className="mb-4 border-primary/30 bg-primary/10 text-primary">
              <BookOpen className="mr-1 h-3 w-3" /> Resources
            </Badge>
            <h2 id="guides-teaser-heading" className="mb-4 text-3xl font-bold md:text-4xl">
              Investor Guides &amp; Insights
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Expert analysis on Greek Golden Visa rules, investment strategies, and market opportunities.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal variant="stagger">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {articles.map((article) => {
              const colorClass = categoryColors[article.category] ?? categoryColors.default;
              return (
                <RevealItem key={article.id}>
                  <Link
                    to={`/guides/${article.slug}`}
                    className="group flex flex-col h-full rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-300 overflow-hidden"
                  >
                    <div className="p-6 flex flex-col flex-1 gap-4">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colorClass}`}>
                          {article.category || "Guide"}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {article.read_time || "5 min read"}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                        {article.meta_description}
                      </p>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary mt-auto">
                        Read: {article.title} <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                </RevealItem>
              );
            })}
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <div className="mt-10 text-center">
            <Link
              to="/guides"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-primary text-primary font-semibold text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Explore all investor guides <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
