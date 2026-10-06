// Capa de datos: Firestore cuando hay configuración, o el navegador (modo prueba) cuando no.
// Colecciones: clientes, pedidos, movimientos y config (documento "app").
import { firebaseConfig } from "./firebase-config.js";
import { pedidosSemilla } from "./semilla.js";

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";
const COLECCIONES = ["clientes", "pedidos", "movimientos", "config"];

export const modoPrueba = !firebaseConfig.apiKey;

function vacio() {
  return { clientes: [], pedidos: [], movimientos: [], config: [] };
}

// ---------- Modo prueba (localStorage) ----------
function storeLocal() {
  const LLAVE = "cerdisimo-datos-v1";
  let datos = vacio();
  try {
    const guardado = JSON.parse(localStorage.getItem(LLAVE));
    if (guardado) datos = Object.assign(vacio(), guardado);
  } catch (e) { /* sin almacenamiento: seguimos en memoria */ }
  const oyentes = [];
  const guardar = () => {
    try { localStorage.setItem(LLAVE, JSON.stringify(datos)); } catch (e) { /* nada */ }
    oyentes.forEach((cb) => cb(datos));
  };
  const id = () => Math.random().toString(36).slice(2, 12);
  return {
    async iniciar() { return { usuario: { email: "modo prueba" } }; },
    escuchar(cb) { oyentes.push(cb); cb(datos); },
    async agregar(col, doc) { const nuevo = { ...doc, id: id() }; datos[col].push(nuevo); guardar(); return nuevo.id; },
    async fijar(col, docId, doc) {
      const i = datos[col].findIndex((d) => d.id === docId);
      if (i >= 0) datos[col][i] = { ...datos[col][i], ...doc }; else datos[col].push({ ...doc, id: docId });
      guardar();
    },
    async actualizar(col, docId, cambios) { return this.fijar(col, docId, cambios); },
    async borrar(col, docId) { datos[col] = datos[col].filter((d) => d.id !== docId); guardar(); },
    async lote(ops) { for (const op of ops) await this[op[0]](...op.slice(1)); },
    async salir() {}
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
  const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });

  return {
    async iniciar(pedirLogin) {
      let usuario = await new Promise((res) => { const u = auth.onAuthStateChanged(a, (x) => { u(); res(x); }); });
      if (!usuario) {
        // El popup de Google debe abrirse dentro del toque del botón, por eso app.js lo llama.
        usuario = await pedirLogin(() => auth.signInWithPopup(a, new auth.GoogleAuthProvider()).then((c) => c.user));
      }
      const socio = await fs.getDoc(fs.doc(db, "socios", usuario.email)).catch(() => null);
      if (!socio || !socio.exists()) {
        throw new Error("La cuenta " + usuario.email + " no está autorizada. Agrégala en la colección «socios» de Firestore.");
      }
      return { usuario };
    },
    escuchar(cb) {
      const datos = vacio();
      const listos = new Set();
      COLECCIONES.forEach((col) => {
        fs.onSnapshot(fs.collection(db, col), (snap) => {
          datos[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          listos.add(col);
          if (listos.size === COLECCIONES.length) cb(datos);
        }, (err) => alert("Error leyendo " + col + ": " + err.message));
      });
    },
    async agregar(col, doc) { const ref = await fs.addDoc(fs.collection(db, col), doc); return ref.id; },
    async fijar(col, docId, doc) { await fs.setDoc(fs.doc(db, col, docId), doc, { merge: true }); },
    async actualizar(col, docId, cambios) { await fs.updateDoc(fs.doc(db, col, docId), cambios); },
    async borrar(col, docId) { await fs.deleteDoc(fs.doc(db, col, docId)); },
    async lote(ops) {
      const b = fs.writeBatch(db);
      for (const [op, col, docId, doc] of ops) {
        const ref = fs.doc(db, col, docId);
        if (op === "fijar") b.set(ref, doc, { merge: true });
        else if (op === "actualizar") b.update(ref, doc);
        else if (op === "borrar") b.delete(ref);
      }
      await b.commit();
    },
    async salir() { await auth.signOut(a); location.reload(); }
  };
}

export async function crearStore() {
  return modoPrueba ? storeLocal() : storeFirebase();
}

// Carga los 5 clientes del 6 de octubre una sola vez (marca config/app.semillaCargada).
export async function sembrarSiHaceFalta(store, datos) {
  const app = datos.config.find((c) => c.id === "app");
  if (app && app.semillaCargada) return false;
  if (datos.clientes.length || datos.pedidos.length) {
    await store.fijar("config", "app", { semillaCargada: true });
    return false;
  }
  const ops = [];
  pedidosSemilla().forEach(({ cliente, pedido }) => {
    const { id: cid, ...c } = cliente;
    const { id: pid, ...pd } = pedido;
    ops.push(["fijar", "clientes", cid, c]);
    ops.push(["fijar", "pedidos", pid, pd]);
  });
  ops.push(["fijar", "config", "app", { semillaCargada: true }]);
  await store.lote(ops);
  return true;
}
