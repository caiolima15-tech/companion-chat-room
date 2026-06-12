// NPC chat — gera resposta usando Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { npc_id, text } = await req.json();
    if (!npc_id || !text) return new Response(JSON.stringify({ error: "bad request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: npc } = await admin.from("npc_instances").select("display_name,persona,voice_id,model_id").eq("id", npc_id).maybeSingle();
    if (!npc) return new Response(JSON.stringify({ error: "npc not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: model } = await admin.from("npc_models").select("default_persona,voice_id").eq("id", npc.model_id).maybeSingle();
    const persona = { ...(model?.default_persona || {}), ...(npc.persona || {}) };
    const voiceId = npc.voice_id || model?.voice_id || "JBFqnCBsd6RMkjVDRZzb";

    // últimas 8 mensagens
    const { data: hist } = await admin
      .from("npc_conversations")
      .select("role,text")
      .eq("user_id", user.id).eq("npc_id", npc_id)
      .order("created_at", { ascending: false }).limit(8);
    const history = (hist || []).reverse();

    const sys = `Você é ${npc.display_name}, um NPC vivendo numa cidade virtual.
Persona: ${JSON.stringify(persona)}.
Fale em português brasileiro coloquial, curto (1-2 frases), como uma pessoa real numa conversa casual de rua.
Nunca diga que é uma IA. Mantenha o personagem.`;

    // grava mensagem do usuário
    await admin.from("npc_conversations").insert({ user_id: user.id, npc_id, role: "user", text });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          ...history.map((m: any) => ({ role: m.role, content: m.text })),
          { role: "user", content: text },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      return new Response(JSON.stringify({ error: "ai failed", detail: errTxt, status: aiRes.status }), { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiRes.json();
    const reply = aiJson?.choices?.[0]?.message?.content?.trim() || "...";

    await admin.from("npc_conversations").insert({ user_id: user.id, npc_id, role: "assistant", text: reply });

    return new Response(JSON.stringify({ reply, voice_id: voiceId, name: npc.display_name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
