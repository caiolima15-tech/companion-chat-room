# Mecânica de Armas — MVP validável

Começar pequeno e sólido: 1 arma (pistola) + punhos, roda de seleção estilo GTA V (desktop e mobile), 1 NPC inimigo que leva dano e morre com SFX e animações. Depois expandimos.

## O que entra nesta etapa

### 1. Catálogo de armas (banco + painel admin)
Nova tabela `weapons` (config global) com:
- slug, nome, ícone, slot da roda (0–7), tipo (`melee` | `firearm`)
- dano, alcance, cadência, tamanho do pente, munição de reserva inicial, tempo de recarga
- IDs de clipes de áudio: tiro, recarga, click-vazio, impacto
- Slug de animação: idle, shoot, reload (usa animações já instaladas do avatar)
- Modelo GLB opcional na mão do player (upload no painel; se vazio, usa um placeholder simples)

Painel **⚔ Armas** (novo, ao lado de Mecânicas/Empregos):
- Lista + editor por arma (mesma UX simples do painel de empregos revisado)
- Upload de GLB da arma, upload de SFX (cria audio_clips automaticamente)
- Botão "Dar ao jogador" para testar rapidamente
- Botão "Testar tiro" no editor

### 2. Inventário de armas do jogador
Tabela `player_weapons` (user_id, weapon_slug, ammo_in_mag, ammo_reserve, owned).
Client mantém cache em `window.__inv` e sincroniza no shutdown/pickup/reload.

### 3. Roda de armas (GTA-style)
Novo módulo `public/weapon-wheel.js`:
- Desktop: **segurar Tab** abre a roda (slow-mo leve no HUD), mouse escolhe o setor, soltar confirma.
- Mobile: botão dedicado no HUD (ao lado do volante/joystick) — toque e arrasto radial escolhe, soltar confirma.
- 8 slots: slot 0 = **Punhos/sem arma** (mão livre, igual GTA), slots 1–7 populados pelo catálogo. Setores vazios ficam esmaecidos.
- Mostra nome, ícone, munição atual/reserva. Setinhas ‹ 1/3 › para variantes do mesmo slot (compat GTA), mas nesta etapa só 1 por slot.

### 4. Ações de combate
`public/weapons.js` (runtime):
- **Atirar**: click esquerdo / botão de tiro no mobile. Consome 1 do pente, toca SFX + animação `shoot`, raycast a partir da câmera até o alcance, aplica dano em NPC/entidade atingida. Se pente=0, toca click-vazio.
- **Recarregar**: tecla **R** / botão recarregar no mobile. Trava input por `reload_ms`, toca SFX e animação `reload`, move munição da reserva para o pente.
- **Guardar arma**: selecionar slot 0 na roda → animação de guardar, remove modelo da mão.
- HUD compacto no canto: ícone da arma + `pente / reserva`.

### 5. NPC inimigo (teste)
Nova coluna `npcs.hostile` (bool) + `hp` (int, default 100). Quando `hostile=true`:
- Recebe dano dos tiros/socos; barra de HP flutuante aparece só quando ferido.
- Ao chegar em 0 HP: toca animação `die` (fallback: `hit` mantido; se não houver `die`, cai deitado via ragdoll simples de rotação), remove-se após 6s, dispara evento `npc-killed` para o sistema de Mecânicas.
- Reage a tiro próximo: vira pro atirador e toca `hit`.

### 6. Integração com Mecânicas
Novos gatilhos: `on_weapon_shot`, `on_npc_killed`, `on_reload`.
Nova ação: `give_weapon` (dar arma + munição ao jogador).
Isso te permite criar missões futuras tipo "matar 5 inimigos" sem tocar em código.

## Detalhes técnicos

- **Mira**: nesta MVP, tiro *hip-fire* com dispersão pequena baseada em movimento; sem ADS/scope ainda.
- **Impacto**: partícula simples (sprite) + som de impacto; buraco de bala é um decal opcional numa próxima iteração.
- **Sombra/perf**: modelo da arma reutiliza materiais existentes (`shadowSide`, `castShadow`) para não regredir a iluminação.
- **Mobile**: novo botão flutuante 🎯 (tiro) e 🔄 (recarga); botão da roda ⚙️ substitui atual atalho de emote quando arma está equipada (emote continua acessível segurando o botão).
- **Persistência**: `player_weapons` com RLS por `auth.uid()`; `weapons` legível por `authenticated`, editável só por `admin` (via `has_role`).
- **Segurança**: dano validado só do lado do dono do NPC/servidor de tick — nesta MVP, dano em NPCs é aplicado localmente + broadcast realtime (igual ao chute atual). Endurecemos depois.

## Fluxo de validação (o que vamos testar no fim)

1. Abrir painel **⚔ Armas** → criar "Pistola" com SFX e ícone → salvar.
2. Painel → "Dar ao jogador" → abrir roda → selecionar Pistola.
3. Criar NPC com `hostile=true` e HP 100.
4. Atirar 5x → NPC toma dano e morre com animação/SFX.
5. Recarregar (R) → animação + SFX + munição volta ao pente.
6. Selecionar slot 0 na roda → arma some da mão.
7. Repetir no mobile.

## Perguntas rápidas antes de codar

1. **Câmera durante o tiro**: mantém a câmera 3ª pessoa atual (mais próximo dos ombros ao equipar arma) ou você quer também uma mira em 1ª pessoa opcional?
2. **Modelo da pistola**: você tem GLB pra subir agora, ou uso um placeholder low-poly gerado por código pra validar e você troca depois no painel?
3. **NPC inimigo revida**: nesta MVP o inimigo só apanha e morre, ou já quer que ele tente correr atrás e dar soco quando você chega perto?
