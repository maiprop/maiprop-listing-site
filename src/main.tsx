import { createRoot } from "react-dom/client";
import "./index.css";

async function bootstrap() {
  try {
    const { default: App } = await import("./App.tsx");
    createRoot(document.getElementById("root")!).render(<App />);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const root = document.getElementById("root")!;
    root.innerHTML = `
      <div style="padding:2rem;font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;">
        <h1 style="color:#b91c1c;margin:0 0 1rem;">Configuration Error</h1>
        <p style="margin:0 0 1rem;color:#374151;">${msg.replace(/</g, "&lt;")}</p>
        <p style="margin:0;font-size:0.9rem;color:#6b7280;">Ensure your <code style="background:#fee2e2;padding:2px 6px;border-radius:4px;">.env</code> file exists with <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_PUBLISHABLE_KEY</b>. Copy from <code>.env.example</code> and add your Supabase project credentials.</p>
      </div>
    `;
  }
}

bootstrap();
