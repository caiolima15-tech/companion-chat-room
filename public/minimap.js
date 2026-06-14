// Minimapa 2D + GPS — canto inferior esquerdo.
// GPS target é setado por jobs.js via window.__jobGpsTarget = {x, z, label} (ou null).
(function () {
  const SIZE = 170;
  let canvas, ctx, labelEl, wrapEl;

  function mount() {
    if (document.getElementById("miniMap")) return;
    wrapEl = document.createElement("div");
    wrapEl.id = "miniMap";
    wrapEl.innerHTML = `
      <canvas width="${SIZE}" height="${SIZE}"></canvas>
      <div id="miniMapLabel"></div>`;
    document.body.appendChild(wrapEl);
    canvas = wrapEl.querySelector("canvas");
    ctx = canvas.getContext("2d");
    labelEl = wrapEl.querySelector("#miniMapLabel");
    requestAnimationFrame(loop);
  }

  function loop() {
    try { draw(); } catch {}
    requestAnimationFrame(loop);
  }

  function draw() {
    if (!ctx) return;
    const p = window.__player;
    if (!p) { wrapEl.style.opacity = "0.35"; return; }
    wrapEl.style.opacity = "1";
    const tgt = window.__jobGpsTarget;
    const R = SIZE / 2;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // fundo
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,14,22,0.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(R, R, (R - 2) * i / 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const heading = p.rotation?.y || 0; // norte = -z
    // jogador (centro), aponta para "cima"
    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = "#33dd66";
    ctx.fill();
    ctx.restore();

    // alvo GPS
    if (tgt && Number.isFinite(tgt.x) && Number.isFinite(tgt.z)) {
      const dx = tgt.x - p.position.x;
      const dz = tgt.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      // rotação relativa ao heading do jogador (queremos "frente" para cima)
      const cos = Math.cos(-heading);
      const sin = Math.sin(-heading);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      // escala: 1 unidade do mundo = ~2 pixels, com cap
      const scale = 2.0;
      let px = rx * scale;
      let py = rz * scale; // +z mundo é "trás" no minimapa
      const maxR = R - 14;
      const r = Math.hypot(px, py);
      const onEdge = r > maxR;
      if (onEdge) { px = px * maxR / r; py = py * maxR / r; }
      ctx.save();
      ctx.translate(R + px, R + py);
      // seta apontando "para fora" (na borda) ou estrela (perto)
      if (onEdge) {
        const ang = Math.atan2(py, px);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 6);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fillStyle = "#ffd11a";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffd11a";
        ctx.fill();
        ctx.strokeStyle = "#7a5a00";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      labelEl.style.display = "block";
      labelEl.textContent = `${tgt.label || "Destino"} · ${dist < 10 ? dist.toFixed(1) : Math.round(dist)}m`;
    } else {
      labelEl.style.display = "none";
    }
  }

  document.addEventListener("DOMContentLoaded", mount);
  setTimeout(mount, 1500);
})();
