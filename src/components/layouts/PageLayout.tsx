import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface PageLayoutProps {
  children: ReactNode;
  /** Extra className applied to the <main> wrapper */
  className?: string;
  /** Suppress the footer (e.g. wizard/form pages that have their own bottom bar) */
  noFooter?: boolean;
}

/**
 * Standard public page shell: Navbar → content → Footer.
 *
 * Replaces the repeated manual Navbar + Footer pattern found in 35+ page files.
 * Usage:
 *
 *   export default function MyPage() {
 *     return (
 *       <PageLayout>
 *         <section>…</section>
 *       </PageLayout>
 *     );
 *   }
 */
export function PageLayout({ children, className, noFooter = false }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main id="main-content" className={`flex-1${className ? ` ${className}` : ""}`}>
        {children}
      </main>
      {!noFooter && <Footer />}
    </div>
  );
}
