// NPC TTS — usa ElevenLabs e retorna áudio MP3
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ELEVEN_KEY = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!ELEVEN_KEY) return new Response("missing key", { status: 500, headers: corsHeaders });
  try {
    const { text, voice_id } = await req.json();
    if (!text) return new Response("bad request", { status: 400, headers: corsHeaders });
    const voice = (voice_id || "JBFqnCBsd6RMkjVDRZzb").trim();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVEN_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: String(text).slice(0, 500),
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      return new Response(JSON.stringify({ error: t }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, { headers: { ...corsHeaders, "Content-Type": "audio/mpeg" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
