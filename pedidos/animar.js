// Movimiento de caricatura para los botones de la tienda.
// Este archivo solo pone y quita clases; cómo se mueve cada cosa está en animaciones.css.
const BOTON = ".btn, .btn-mini, .stepper button, .pestanas button, .franja-evento summary";
const PASO = "[data-paso], [data-paso-evento]";
const quieto = matchMedia("(prefers-reduced-motion: reduce)");

// En iPhone, :active (el botón aplastado) solo se ve si la página escucha los toques
document.addEventListener("touchstart", () => {}, { passive: true });

export function animar(el, clase) {
  if (!el || quieto.matches) return;
  el.classList.remove(clase);
  void el.offsetWidth; // vuelve a empezar si ya estaba corriendo
  el.classList.add(clase);
  const fin = (e) => {
    if (e.target !== el) return;
    el.classList.remove(clase);
    el.removeEventListener("animationend", fin);
  };
  el.addEventListener("animationend", fin);
}

// Antes de que la tienda cambie la cantidad, se anota cuánto había
let antes = null;
document.addEventListener("click", (e) => {
  const b = e.target.closest(PASO);
  antes = b ? b.parentElement.querySelector("output").textContent : null;
}, true);

// Después del cambio: el botón rebota y la cantidad, el producto y el total reaccionan
document.addEventListener("click", (e) => {
  const b = e.target.closest(BOTON);
  if (!b || !b.isConnected) return;
  if (b.matches("summary")) { animar(b.querySelector(".franja-ver"), "rebota"); return; }
  animar(b, "rebota");
  if (!b.matches(PASO)) return;
  const out = b.parentElement.querySelector("output");
  if (out.textContent === antes) { animar(out, "nono"); return; } // ya no baja de 0 ni sube del tope
  const suma = Number(b.dataset.paso || b.dataset.pasoEvento) > 0;
  animar(out, suma ? "sube" : "baja");
  const prod = b.closest(".prod");
  if (suma && out.textContent === "1") animar(prod, "menea");
  animar(prod.querySelector(".prod-chip"), "columpia");
  animar(b.closest("form").querySelector(".total strong"), "pop");
});

// Domicilio o Lo recojo: la opción elegida da un brinco
document.addEventListener("change", (e) => {
  if (e.target.matches(".check input")) animar(e.target, "pop");
});

// Cuando sale un error, el botón principal de ese formulario dice que no con la cabeza
const vigia = new MutationObserver((cambios) => {
  new Set(cambios.map((c) => c.target.nodeType === 1 ? c.target : c.target.parentElement)).forEach((err) => {
    const caja = err.closest(".error");
    if (caja && caja.textContent.trim()) animar(caja.closest("form, .form")?.querySelector(".btn-grande"), "nono");
  });
});
document.querySelectorAll(".error").forEach((el) => vigia.observe(el, { childList: true, characterData: true, subtree: true }));
