// NPC STT — gera token single-use do ElevenLabs Scribe Realtime para o cliente
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!ELEVEN_KEY) return new Response(JSON.stringify({ error: "missing ELEVENLABS_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      { method: "POST", headers: { "xi-api-key": ELEVEN_KEY } }
    );
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: t || `status ${res.status}` }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await res.json();
    return new Response(JSON.stringify({ token: data.token }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
