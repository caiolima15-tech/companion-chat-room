// NPC chat — gera resposta usando Lovable AI Gateway
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const VOICE_POOL = {
  male:   ["JBFqnCBsd6RMkjVDRZzb", "TX3LPaxmHKxFdv7VOQHJ", "nPczCjzI2devNBz1zQrb"], // George, Liam, Brian
  female: ["EXAVITQu4vr4xnSDxMaL", "FGY2WhTYpPnrIDTdsKH5", "Xb7hH8MSUJpSbSDYk0k2"], // Sarah, Laura, Alice
  neutral:["JBFqnCBsd6RMkjVDRZzb", "EXAVITQu4vr4xnSDxMaL"],
};
function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function pickVoice(npcId: string, gender: string) {
  const pool = (VOICE_POOL as any)[gender] || VOICE_POOL.neutral;
  return pool[hashStr(npcId) % pool.length];
}

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

    const { data: npc } = await admin.from("npc_instances").select("display_name,persona,voice_id,model_id,backstory").eq("id", npc_id).maybeSingle();
    if (!npc) return new Response(JSON.stringify({ error: "npc not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: model } = await admin.from("npc_models").select("default_persona,voice_id,gender").eq("id", npc.model_id).maybeSingle();
    const persona = { ...(model?.default_persona || {}), ...(npc.persona || {}) };
    const gender = (model?.gender || "neutral") as string;
    const voiceId = npc.voice_id || model?.voice_id || pickVoice(npc_id, gender);

    // ===== Gerar nome + backstory se ainda não tem =====
    let displayName = npc.display_name;
    let backstory = npc.backstory;
    const looksGeneric = !displayName || /^npc/i.test(displayName) || /^pessoa/i.test(displayName);
    if (!backstory || looksGeneric) {
      try {
        const genderHint = gender === "male" ? "masculino" : gender === "female" ? "feminino" : "qualquer";
        const genRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{
              role: "user",
              content: `Crie um personagem brasileiro fictício, gênero ${genderHint}.
Responda APENAS em JSON válido: {"name":"Nome Sobrenome","backstory":"4 a 6 frases curtas em português brasileiro sobre quem é, idade aproximada, profissão, gostos, peculiaridades, onde mora e um segredo ou sonho. Tom natural, sem clichês."}`,
            }],
          }),
        });
        if (genRes.ok) {
          const gj = await genRes.json();
          let raw = gj?.choices?.[0]?.message?.content?.trim() || "";
          raw = raw.replace(/^```json\s*|\s*```$/g, "");
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            if (parsed.name) displayName = String(parsed.name).slice(0, 60);
            if (parsed.backstory) backstory = String(parsed.backstory).slice(0, 2000);
            await admin.from("npc_instances").update({ display_name: displayName, backstory }).eq("id", npc_id);
          }
        }
      } catch (e) { console.warn("backstory gen fail", e); }
    }

    // últimas 8 mensagens
    const { data: hist } = await admin
      .from("npc_conversations")
      .select("role,text")
      .eq("user_id", user.id).eq("npc_id", npc_id)
      .order("created_at", { ascending: false }).limit(8);
    const history = (hist || []).reverse();

    // Fase da conversa baseada em quantas mensagens do user já existem (antes desta)
    const userMsgCount = history.filter((m: any) => m.role === "user").length;
    const phase = userMsgCount < 2 ? 1 : userMsgCount < 5 ? 2 : 3;
    const phaseRules = phase === 1
      ? `FASE: primeiro contato. Responda com NO MÁXIMO 3 a 6 palavras. Tipo "opa, e aí?", "fala", "oi, tudo?", "eae mano". NÃO se apresente, NÃO conte o que está fazendo, NÃO puxe assunto. Só cumprimente de volta ou responda curtíssimo. Pode ser uma interjeição só.`
      : phase === 2
      ? `FASE: esquentando. 1 frase curta, até ~12 palavras. Responde o que foi perguntado sem floreio, sem contar história de vida. Ainda não puxe assunto demais.`
      : `FASE: à vontade. Até 2 frases coloquiais. Pode contar coisas da sua história SE perguntarem ou vier muito a propósito. Continue curto, sem monólogo.`;
    const maxTok = phase === 1 ? 30 : phase === 2 ? 60 : 120;

    const sys = `Você é ${displayName || "um morador"}, um NPC vivendo numa cidade virtual.
${backstory ? `Sua história (NÃO despeje isso, use só se vier muito a propósito numa conversa já em andamento): ${backstory}` : ""}
Persona extra: ${JSON.stringify(persona)}.

Fale como brasileiro de verdade na rua: gírias leves, contrações ("tô", "tá", "pra", "cê", "tbm"), pode usar "kkk" raramente. Nunca diga que é uma IA. Nunca narre ações entre asteriscos. Nada de emojis em excesso, nada de listas, nada de parágrafos. Varie aberturas — nem todo "oi" precisa virar "Oi! Tudo bem?". Pode ser só "fala", "e aí", "opa", "eae".

${phaseRules}`;

    // grava mensagem do usuário + atualiza last_user_msg_at
    await admin.from("npc_conversations").insert({ user_id: user.id, npc_id, role: "user", text, last_user_msg_at: new Date().toISOString() });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0.9,
        max_tokens: maxTok,
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
    let reply = aiJson?.choices?.[0]?.message?.content?.trim() || "...";

    // Pós-processamento defensivo: na fase 1, corta tudo depois da 1ª frase / limita palavras
    if (phase === 1) {
      const firstSentence = reply.split(/(?<=[.!?…])\s+/)[0] || reply;
      reply = firstSentence;
      const words = reply.split(/\s+/);
      if (words.length > 10) reply = words.slice(0, 10).join(" ");
    } else if (phase === 2) {
      const sentences = reply.split(/(?<=[.!?…])\s+/);
      if (sentences.length > 1) reply = sentences.slice(0, 1).join(" ");
    }

    await admin.from("npc_conversations").insert({ user_id: user.id, npc_id, role: "assistant", text: reply });

    return new Response(JSON.stringify({ reply, voice_id: voiceId, name: displayName, gender, backstory }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
