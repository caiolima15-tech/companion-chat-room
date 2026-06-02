import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  useEffect(() => {
    // Preserve query + hash so Supabase recovery tokens (?code=, #access_token=, #type=recovery)
    // survive the redirect to the static app shell.
    const { search, hash } = window.location;
    window.location.replace("/index.html" + (search || "") + (hash || ""));
  }, []);
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#111318", color: "#f7f1e6", fontFamily: "system-ui" }}>
      Carregando sala 3D…
    </div>
  );
}
