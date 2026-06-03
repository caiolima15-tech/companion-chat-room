# Animações customizadas no painel admin

Hoje as animações são fixas no código (`idle`, `walk`, `run`, `dance`, `wave`, `kickWeak`, `kickStrong`) e cada interação aceita um `animation_url` digitado à mão. A ideia é deixar você subir arquivos `.fbx` quando quiser, ajustá-los no painel de Animações, e escolhê-los nas interações via dropdown.

## O que muda na interface

**Painel "🎬 Animações" (admin lateral)**
- Botão **+ Adicionar animação** no topo da lista.
- Ao clicar: abre mini-form com **nome** (ex.: "Aceno militar") + seletor de arquivo `.fbx`.
- Faz upload, salva no banco e a animação aparece na mesma lista das nativas.
- Cada animação custom ganha os mesmos ajustes (offset X/Y/Z + rotação X/Y/Z), botões **Testar / Resetar / Salvar / 🗑 Excluir**.
- Animações nativas continuam aparecendo, mas sem botão de excluir.

**Painel de Interações**
- Campo `animation_url` (texto livre hoje) vira **dropdown** com:
  - "— Nenhuma (idle) —"
  - Lista de animações customizadas cadastradas
  - Opção "URL manual…" para colar link externo (compatibilidade).
- Ao selecionar uma custom, o `animation_url` salvo é a URL do arquivo no storage.

## Backend

**Storage bucket** `animations` (público leitura) — arquivos `.fbx` até ~20MB.

**Tabela** `public.custom_animations`:
- `name` (texto, único por criador)
- `file_url` (URL pública do .fbx)
- `file_path` (caminho no bucket, p/ poder excluir)
- `created_by` (uuid do admin)
- `created_at`

**RLS:**
- SELECT: qualquer usuário autenticado (precisa carregar nas interações de todo mundo).
- INSERT / UPDATE / DELETE: apenas admins (via `has_role(auth.uid(), 'admin')`).

**Realtime** ligado para a tabela, assim quando um admin sobe uma nova animação ela aparece no dropdown dos outros admins sem reload.

## Detalhes técnicos

- `ANIM_URLS` e `animTunings` passam a ser mesclados em runtime: nativas (hardcoded) + customizadas (carregadas do Supabase em `boot`).
- Tunings das customizadas salvos na mesma chave `localStorage` `neon-tap-room-anim-tunings`, indexados por `custom:<id>`.
- Upload usa `supabase.storage.from('animations').upload(...)` com path `${userId}/${timestamp}-${safeName}.fbx`.
- "Testar" toca a animação no avatar local via `loadFbxClip(file_url)` + `retargetClipToBones` (mesma rotina já usada nas interações de sentar).
- Excluir: remove a row + remove o arquivo do storage. Interações que ainda referenciam aquela URL passam a cair no fallback "idle" (sem quebrar).

## Arquivos afetados

- **nova migração**: tabela `custom_animations` + GRANTs + RLS + realtime.
- **novo bucket**: `animations` (público).
- `public/index.html`: HTML do botão "+" e mini-form de upload no painel de Animações; troca do input de `animation_url` por `<select>` no editor de interações.
- `public/app.js`: 
  - carregar custom anims do Supabase no boot e em realtime;
  - render do botão "+" / form de upload / lista com excluir;
  - popular o `<select>` no editor de interações;
  - estender `animTunings` para suportar IDs `custom:<id>`.
