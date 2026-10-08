// Capa de datos de la app de clientes: la misma base de Firestore que la app admin.
// Cada cliente solo lee y escribe su ficha (clientes/{uid}) y sus pedidos (campo uid);
// las reglas de firestore.rules lo garantizan. Sin configuración de Firebase corre en
// modo prueba, guardando en el navegador con la misma llave que la app admin.
import { firebaseConfig } from "../firebase-config.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";
const LLAVE_CORREO = "cerdisimo-correo-enlace";

export const modoPrueba = !firebaseConfig.apiKey;

export async function crearStore() {
  return modoPrueba ? storeLocal() : storeFirebase();
}

// ---------- Modo prueba (localStorage, compartido con la app admin en modo prueba) ----------
function storeLocal() {
  const LLAVE = "cerdisimo-datos-v1";
  const USUARIO = { uid: "cliente-prueba", email: "cliente@prueba.com" };
  const leer = () => {
    try { return Object.assign({ clientes: [], pedidos: [], movimientos: [], config: [] }, JSON.parse(localStorage.getItem(LLAVE))); }
    catch (e) { return { clientes: [], pedidos: [], movimientos: [], config: [] }; }
  };
  const oyentes = [];
  const avisar = () => { const d = leer(); oyentes.forEach((cb) => cb(d)); };
  const escribir = (f) => { const d = leer(); f(d); try { localStorage.setItem(LLAVE, JSON.stringify(d)); } catch (e) { /* nada */ } avisar(); };
  window.addEventListener("storage", (e) => { if (e.key === LLAVE) avisar(); });
  const escuchar = (cb) => { oyentes.push(cb); cb(leer()); };
  let sesionCb = null;
  let dentro = sessionStorage.getItem("cerdisimo-prueba-dentro") === "1";
  const cambiarSesion = (v) => { dentro = v; sessionStorage.setItem("cerdisimo-prueba-dentro", v ? "1" : ""); if (sesionCb) sesionCb(v ? USUARIO : null); };
  return {
    estadoSesion(cb) { sesionCb = cb; cb(dentro ? USUARIO : null); },
    async entrarConGoogle() { cambiarSesion(true); },
    async enviarEnlace() { cambiarSesion(true); },
    async completarEnlace() {},
    async salir() { cambiarSesion(false); location.reload(); },
    escucharFicha(uid, cb) { escuchar((d) => cb(d.clientes.find((c) => c.id === uid) || null)); },
    escucharPedidos(uid, cb) { escuchar((d) => cb(d.pedidos.filter((p) => p.uid === uid))); },
    escucharPrecios(cb) { escuchar((d) => cb(d.config.find((c) => c.id === "precios") || null)); },
    async guardarFicha(uid, ficha) {
      escribir((d) => {
        const i = d.clientes.findIndex((c) => c.id === uid);
        if (i >= 0) d.clientes[i] = { ...d.clientes[i], ...ficha }; else d.clientes.push({ ...ficha, id: uid });
      });
    },
    async crearPedido(p) {
      const id = Math.random().toString(36).slice(2, 12);
      escribir((d) => { d.pedidos.push({ ...p, id }); });
      return id;
    },
    async actualizarPedido(id, cambios) {
      escribir((d) => { const p = d.pedidos.find((x) => x.id === id); if (p) Object.assign(p, cambios); });
    }
  };
}

// ---------- Firestore ----------
async function storeFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  a.languageCode = "es";
  const db = fs.getFirestore(app);
  const errorLectura = (que) => (e) => { console.error(e); alert("No se pudo leer " + que + ": " + e.message); };

  return {
    estadoSesion(cb) { auth.onAuthStateChanged(a, cb); },
    // El popup debe abrirse dentro del toque del botón
    entrarConGoogle() { return auth.signInWithPopup(a, new auth.GoogleAuthProvider()); },
    async enviarEnlace(correo) {
      await auth.sendSignInLinkToEmail(a, correo, { url: location.origin + location.pathname, handleCodeInApp: true });
      localStorage.setItem(LLAVE_CORREO, correo);
    },
    // Si la página se abrió desde el enlace del correo, termina de entrar
    async completarEnlace() {
      if (!auth.isSignInWithEmailLink(a, location.href)) return;
      let correo = localStorage.getItem(LLAVE_CORREO);
      if (!correo) correo = prompt("Para terminar de entrar, escribe tu correo:");
      if (!correo) return;
      await auth.signInWithEmailLink(a, correo.trim(), location.href);
      localStorage.removeItem(LLAVE_CORREO);
      history.replaceState(null, "", location.pathname);
    },
    async salir() { await auth.signOut(a); location.reload(); },
    escucharFicha(uid, cb) {
      fs.onSnapshot(fs.doc(db, "clientes", uid), (s) => cb(s.exists() ? { ...s.data(), id: s.id } : null), errorLectura("tus datos"));
    },
    escucharPedidos(uid, cb) {
      fs.onSnapshot(fs.query(fs.collection(db, "pedidos"), fs.where("uid", "==", uid)),
        (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))), errorLectura("tus pedidos"));
    },
    escucharPrecios(cb) {
      fs.onSnapshot(fs.doc(db, "config", "precios"), (s) => cb(s.exists() ? s.data() : null), errorLectura("los precios"));
    },
    async guardarFicha(uid, ficha) { await fs.setDoc(fs.doc(db, "clientes", uid), ficha, { merge: true }); },
    async crearPedido(p) { const ref = await fs.addDoc(fs.collection(db, "pedidos"), p); return ref.id; },
    async actualizarPedido(id, cambios) { await fs.updateDoc(fs.doc(db, "pedidos", id), cambios); }
  };
}
