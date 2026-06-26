// Lovable UI helpers — modal/toast/prompt usados por jobs-admin e mechanics-admin.
(function () {
  if (window.LV) return;
  const stack = [];
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
  function makeModal({ title, large, foot } = {}) {
    const backdrop = document.createElement("div");
    backdrop.className = "lv-modal-backdrop";
    backdrop.style.zIndex = String(9100 + stack.length * 5);
    const modal = document.createElement("div");
    modal.className = "lv-modal" + (large ? " lv-modal-lg" : "");
    modal.innerHTML = `<div class="lv-modal-head"><h3>${esc(title || "")}</h3><button class="lv-x" aria-label="Fechar">✕</button></div><div class="lv-modal-body"></div>`;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    const obj = { backdrop, modal, body: modal.querySelector(".lv-modal-body"), close };
    function close() {
      backdrop.remove();
      const i = stack.indexOf(obj); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = "";
    }
    modal.querySelector(".lv-x").onclick = close;
    backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
    const onKey = e => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
    if (foot && foot.length) {
      const f = document.createElement("div"); f.className = "lv-modal-foot";
      for (const b of foot) {
        const btn = document.createElement("button");
        btn.className = "lv-btn" + (b.primary ? " primary" : "") + (b.danger ? " danger" : "") + (b.ghost ? " ghost" : "");
        btn.textContent = b.label; btn.onclick = b.onClick;
        f.appendChild(btn);
      }
      modal.appendChild(f);
    }
    stack.push(obj);
    return obj;
  }
  function toast(text, kind) {
    const t = document.createElement("div");
    t.className = "lv-toast" + (kind ? " " + kind : "");
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; }, 2200);
    setTimeout(() => t.remove(), 2600);
  }
  function confirmBox(msg, onYes) {
    const m = makeModal({
      title: "Confirmar",
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => m.close() },
        { label: "Confirmar", danger: true, onClick: () => { m.close(); onYes && onYes(); } },
      ],
    });
    m.body.innerHTML = `<div>${esc(msg)}</div>`;
  }
  function promptText(label, initial, onValue, opts = {}) {
    const m = makeModal({
      title: label,
      foot: [
        { label: "Cancelar", ghost: true, onClick: () => { m.close(); onValue && onValue(null); } },
        { label: "OK", primary: true, onClick: ok },
      ],
    });
    m.body.innerHTML = opts.multiline
      ? `<div class="lv-field"><textarea id="lv-prompt-in">${esc(initial || "")}</textarea></div>`
      : `<div class="lv-field"><input type="text" id="lv-prompt-in" value="${esc(initial || "")}"/></div>`;
    const input = m.body.querySelector("#lv-prompt-in");
    input.focus();
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !opts.multiline) ok(); });
    function ok() { const v = input.value; m.close(); onValue && onValue(v); }
  }
  window.LV = { modal: makeModal, toast, confirm: confirmBox, promptText, esc };
})();
