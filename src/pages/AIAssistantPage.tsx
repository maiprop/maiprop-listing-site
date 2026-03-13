import { Navbar } from "@/components/Navbar";
import AIAssistantWidget from "@/components/AIAssistantWidget";

export default function AIAssistantPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="pt-16 flex-1 flex flex-col pb-20 lg:pb-8">
        <div className="container max-w-2xl flex-1 flex flex-col py-4 px-4">
          <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card overflow-hidden">
            <AIAssistantWidget variant="embedded" />
          </div>
        </div>
      </div>
    </div>
  );
}
