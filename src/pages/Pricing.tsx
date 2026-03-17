import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";

const Pricing = () => (
  <>
    <Helmet>
      <title>Pricing | mAI Investments</title>
      <meta name="description" content="Pro subscription for investors. Upgrade to apply for Quick Sale deals." />
    </Helmet>
    <Navbar />
    <main className="min-h-screen pt-24 pb-16 px-4">
      <div className="container max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Pro Subscription</h1>
        <p className="text-muted-foreground mb-6">Upgrade to Pro to apply for Quick Sale deals.</p>
        <Link to="/" className="text-primary hover:underline">Back to home</Link>
      </div>
    </main>
  </>
);

export default Pricing;
