// Bloque C: compara la salida de la app con las referencias de los 55 clips.
// Umbrales fijados el 23 nov 2026 en docs/protocolo-validacion.md. NO se mueven aquí.
// Uso: node scripts/validacion/medir.mjs --referencias referencias.csv --marcas marcas.csv --salida salida-app.json [--out resultados.md] [--json resultados.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const UMBRALES = Object.freeze({
  fecha: '2026-11-23',
  posicionToleranciaFrac: 0.015, // 1,5 % del cuadro
  posicionPuntosMin: 0.85,
  posicionWilsonMin: 0.75,
  falsosPositivosMax: 0.1,
  continuidadMin: 0.8,
  falsoPosicionFrac: 0.05, // [PROPUESTA] un punto a más de 5 % del cuadro de la marca es un punto falso
  direccionGrados: 2,
  direccionPorPalo: 8, // de 10
  dificilesFalsosMax: 1, // de 10
  vistaMin: 14, // de 15
  eventosToleranciaCuadros: 3,
  eventosMin: 12, // de 15
});
export const ESPERADOS = Object.freeze({ tirosPorPalo: 10, dificiles: 10, swings: 15 });
export const PALOS = ['driver', 'hierro7', 'wedge'];

/** Cota inferior de Wilson (95 %). */
export function wilsonLower(k, n, z = 1.959964) {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** CSV simple: separador ',' o ';' (se detecta en el encabezado), comillas dobles, decimales con coma si el separador es ';'. */
export function parseCsv(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lineas.length) return [];
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const partir = (l) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const cab = partir(lineas[0]);
  return lineas.slice(1).map((l) => {
    const v = partir(l);
    const o = {};
    cab.forEach((c, i) => { o[c] = v[i] ?? ''; });
    Object.defineProperty(o, '__decimalComa', { value: sep === ';', enumerable: false });
    return o;
  });
}

const num = (v, coma = false) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(coma ? String(v).replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
};
const verdadero = (v) => ['1', 'si', 'sí', 'true', 'x'].includes(String(v ?? '').trim().toLowerCase());

/** Ángulo de la marca manual, con la fórmula de launchAngleDeg (src/lib/ballflight.ts). Null si se movió menos de 0,02. */
export function anguloDeMarca(m, aspecto) {
  const dx = (m.x2 - m.x1) * aspecto;
  const dy = m.y2 - m.y1;
  if (Math.hypot(dx, dy) < 0.02) return null;
  return Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI) * 10) / 10;
}

export const paloDe = (archivo) => PALOS.find((p) => archivo.toLowerCase().startsWith(p + '-')) ?? null;
export const tipoDeClip = (archivo) => {
  const a = archivo.toLowerCase();
  if (a.startsWith('swing-')) return 'swing';
  if (a.startsWith('dificil-')) return 'dificil';
  return paloDe(a) ? 'tiro' : 'desconocido';
};

function leerMarca(fila) {
  const c = fila.__decimalComa;
  const m = {
    archivo: fila.archivo, aspecto: num(fila.aspecto, c), cuadro1: num(fila.cuadro1, c), x1: num(fila.x1, c), y1: num(fila.y1, c),
    cuadro2: num(fila.cuadro2, c), x2: num(fila.x2, c), y2: num(fila.y2, c), sinMarca: verdadero(fila.sin_marca),
    vista: (fila.vista || '').toLowerCase() || null, inicio: num(fila.inicio, c), tope: num(fila.tope, c), impacto: num(fila.impacto, c),
  };
  m.completa = [m.cuadro1, m.x1, m.y1, m.cuadro2, m.x2, m.y2].every((v) => v !== null);
  return m;
}

/** Un tiro (ball tracking o difícil). Devuelve la fila de la tabla. */
function medirTiro(archivo, marca, app, ref) {
  const bt = app?.ballTracking ?? null;
  const detectado = !!(bt && bt.detectado && bt.released !== false);
  const fila = {
    archivo, palo: paloDe(archivo), estado: 'medido', detectado, anguloApp: null, anguloMarca: null, errorGrados: null,
    pasaDireccion: false, puntosMarcados: 0, puntosAcertados: 0, errorPosicionFrac: null, trazoFalso: false,
    continuidad: null, simDireccion: num(ref?.simulador_direccion_grados, !!ref?.__decimalComa), notas: [],
  };
  const dificil = tipoDeClip(archivo) === 'dificil';
  if (!marca) { fila.estado = 'sin_marca'; fila.trazoFalso = detectado && dificil; fila.notas.push('no hay fila en marcas.csv'); return fila; }
  if (marca.sinMarca || !marca.completa) {
    // Sin bola visible: no se mide (se vuelve a grabar), salvo en difíciles, donde dibujar un trazo es falso.
    fila.estado = 'sin_marca';
    fila.trazoFalso = detectado && dificil;
    fila.notas.push(marca.sinMarca ? 'marcado sin_marca' : 'marca incompleta');
    return fila;
  }
  const aspecto = marca.aspecto ?? 0.5625;
  fila.anguloMarca = anguloDeMarca(marca, aspecto);
  if (fila.anguloMarca === null) { fila.estado = 'sin_marca'; fila.notas.push('la marca se movió menos de 0,02'); return fila; }
  fila.anguloApp = detectado && typeof bt.launchAngleDeg === 'number' ? bt.launchAngleDeg : null;
  if (fila.anguloApp !== null) {
    fila.errorGrados = Math.round((fila.anguloApp - fila.anguloMarca) * 10) / 10;
    fila.pasaDireccion = Math.abs(fila.errorGrados) <= UMBRALES.direccionGrados;
  } else fila.notas.push(detectado ? 'sin ángulo (menos de 3 puntos o casi quieto)' : 'la app no detectó la bola');
  // Posición: se compara el punto de la app en el mismo cuadro que cada marca.
  const puntos = detectado ? (bt.puntos ?? []).filter((p) => p.source === 'detected' || p.source === undefined) : [];
  const errores = [];
  for (const [cu, x, y] of [[marca.cuadro1, marca.x1, marca.y1], [marca.cuadro2, marca.x2, marca.y2]]) {
    fila.puntosMarcados++;
    const p = puntos.find((q) => q.cuadro === cu);
    if (!p) continue;
    const e = Math.hypot((p.x - x) * aspecto, p.y - y);
    errores.push(e);
    if (e <= UMBRALES.posicionToleranciaFrac) fila.puntosAcertados++;
  }
  fila.errorPosicionFrac = errores.length ? Math.max(...errores) : null;
  fila.trazoFalso = detectado && errores.some((e) => e > UMBRALES.falsoPosicionFrac);
  if (detectado) {
    const span = Math.max(1, marca.cuadro2 - marca.cuadro1 + 1);
    const vistos = new Set(puntos.filter((p) => p.cuadro >= marca.cuadro1 && p.cuadro <= marca.cuadro2).map((p) => p.cuadro));
    fila.continuidad = vistos.size / span;
  }
  return fila;
}

function medirSwing(archivo, marca, app) {
  const sw = app?.swing ?? null;
  const fila = {
    archivo, estado: 'medido', vistaApp: sw?.vista ?? null, vistaMarca: marca?.vista ?? null, vistaOk: false,
    errores: { inicio: null, tope: null, impacto: null }, eventosOk: false, notas: [],
  };
  if (!marca || !marca.vista) { fila.estado = 'sin_marca'; fila.notas.push('falta la marca del swing'); return fila; }
  fila.vistaOk = fila.vistaApp === marca.vista;
  let todos = true;
  for (const k of ['inicio', 'tope', 'impacto']) {
    if (typeof sw?.[k] === 'number' && marca[k] !== null) fila.errores[k] = sw[k] - marca[k]; else todos = false;
  }
  fila.eventosOk = todos && Object.values(fila.errores).every((e) => Math.abs(e) <= UMBRALES.eventosToleranciaCuadros);
  if (!sw) fila.notas.push('la app no dio resultado');
  return fila;
}

const cuenta = (arr, f) => arr.filter(f).length;
const r3 = (x) => Math.round(x * 1000) / 1000;

function veredicto(k, n, minK, esperado, extra = {}) {
  const w = wilsonLower(k, n);
  let v;
  if (n === 0) v = 'no medido';
  else if (n < esperado) v = `incompleto (${n} de ${esperado})`;
  else v = k >= minK && (extra.ok ?? true) ? 'pasa' : 'experimental';
  return { veredicto: v, k, n, wilson95: w === null ? null : r3(w), ...extra };
}

/** Todo el cálculo. `referencias` y `marcas` son filas de parseCsv; `salida` es el JSON de la app. */
export function evaluar({ referencias, marcas, salida }) {
  const refPor = new Map(referencias.map((r) => [r.archivo, r]));
  const marcaPor = new Map(marcas.map((r) => [r.archivo, leerMarca(r)]));
  const appPor = new Map((salida?.clips ?? []).map((c) => [c.archivo, c]));
  const archivos = [...new Set([...refPor.keys(), ...marcaPor.keys(), ...appPor.keys()])].sort();
  const tiros = [];
  const dificiles = [];
  const swings = [];
  for (const a of archivos) {
    const t = tipoDeClip(a);
    if (t === 'tiro') tiros.push(medirTiro(a, marcaPor.get(a), appPor.get(a), refPor.get(a)));
    else if (t === 'dificil') dificiles.push(medirTiro(a, marcaPor.get(a), appPor.get(a), refPor.get(a)));
    else if (t === 'swing') swings.push(medirSwing(a, marcaPor.get(a), appPor.get(a)));
  }
  const medidos = tiros.filter((t) => t.estado === 'medido');
  const v = {};
  // Posición de la bola: dos puntos marcados por tiro.
  const puntosEsperados = ESPERADOS.tirosPorPalo * PALOS.length * 2;
  const pm = medidos.reduce((s, t) => s + t.puntosMarcados, 0);
  const pa = medidos.reduce((s, t) => s + t.puntosAcertados, 0);
  const fp = cuenta(medidos, (t) => t.trazoFalso);
  const fpFrac = medidos.length ? fp / medidos.length : 0;
  const cont = medidos.filter((t) => t.continuidad !== null);
  const contFrac = cont.length ? cont.reduce((s, t) => s + t.continuidad, 0) / cont.length : 0;
  const posOk = pm > 0 && pa / pm >= UMBRALES.posicionPuntosMin && (wilsonLower(pa, pm) ?? 0) >= UMBRALES.posicionWilsonMin
    && fpFrac <= UMBRALES.falsosPositivosMax && contFrac >= UMBRALES.continuidadMin;
  v.posicion = veredicto(pa, pm, 0, puntosEsperados, { ok: posOk, falsosPositivos: fp, falsosPositivosFrac: r3(fpFrac), continuidad: r3(contFrac) });
  // Dirección en la imagen, por palo.
  v.direccion = {};
  for (const p of PALOS) {
    const ts = medidos.filter((t) => t.palo === p);
    v.direccion[p] = veredicto(cuenta(ts, (t) => t.pasaDireccion), ts.length, UMBRALES.direccionPorPalo, ESPERADOS.tirosPorPalo);
  }
  // Condiciones difíciles: un clip sin marca (sin bola visible) sigue contando para los trazos falsos.
  const dFalsos = cuenta(dificiles, (t) => t.trazoFalso);
  v.dificiles = { ...veredicto(dificiles.length - dFalsos, dificiles.length, dificiles.length - UMBRALES.dificilesFalsosMax, ESPERADOS.dificiles), trazosFalsos: dFalsos };
  // Swing.
  const sw = swings.filter((s) => s.estado === 'medido');
  v.vista = veredicto(cuenta(sw, (s) => s.vistaOk), sw.length, UMBRALES.vistaMin, ESPERADOS.swings);
  v.eventos = veredicto(cuenta(sw, (s) => s.eventosOk), sw.length, UMBRALES.eventosMin, ESPERADOS.swings);
  // Solo se informa: dirección contra el simulador.
  const conSim = medidos.filter((t) => t.simDireccion !== null && t.anguloApp !== null);
  const mismoLado = cuenta(conSim, (t) => Math.sign(t.simDireccion) === Math.sign(t.anguloApp));
  const dif = conSim.map((t) => Math.abs(t.anguloApp - t.simDireccion)).sort((a, b) => a - b);
  const mediana = dif.length ? (dif.length % 2 ? dif[(dif.length - 1) / 2] : (dif[dif.length / 2 - 1] + dif[dif.length / 2]) / 2) : null;
  const informe = { simulador: { n: conSim.length, mismoLado, errorMedianoGrados: mediana, nota: 'Solo se informa: el ángulo de la app es en la imagen, no el real.' } };
  return { umbrales: UMBRALES, tiros, dificiles, swings, veredictos: v, informe };
}

const pct = (x) => (x === null || x === undefined ? 'n/d' : (x * 100).toFixed(1) + ' %');
export function aMarkdown(r) {
  const L = [];
  const v = r.veredictos;
  L.push('# Resultados de validación', '', `Umbrales fijados el ${UMBRALES.fecha} (docs/protocolo-validacion.md). "Pasa" significa que cumplió el umbral, no que esté demostrado. Cota: Wilson 95 %.`, '');
  L.push('## Veredictos', '', '| Función | Veredicto | k/n | Wilson 95 % | Detalle |', '|---|---|---|---|---|');
  L.push(`| Posición de la bola | ${v.posicion.veredicto} | ${v.posicion.k}/${v.posicion.n} puntos | ${pct(v.posicion.wilson95)} | falsos positivos ${v.posicion.falsosPositivos} tiros (${pct(v.posicion.falsosPositivosFrac)}); continuidad ${pct(v.posicion.continuidad)} |`);
  for (const p of PALOS) {
    const d = v.direccion[p];
    L.push(`| Dirección en la imagen, ${p} | ${d.veredicto} | ${d.k}/${d.n} | ${pct(d.wilson95)} | ±${UMBRALES.direccionGrados}° contra la marca manual |`);
  }
  L.push(`| Condiciones difíciles | ${v.dificiles.veredicto} | ${v.dificiles.k}/${v.dificiles.n} sin trazo falso | ${pct(v.dificiles.wilson95)} | ${v.dificiles.trazosFalsos} trazos falsos |`);
  L.push(`| Vista de swing | ${v.vista.veredicto} | ${v.vista.k}/${v.vista.n} | ${pct(v.vista.wilson95)} | |`);
  L.push(`| Eventos de swing | ${v.eventos.veredicto} | ${v.eventos.k}/${v.eventos.n} | ${pct(v.eventos.wilson95)} | inicio, tope e impacto a ≤ ${UMBRALES.eventosToleranciaCuadros} cuadros |`);
  L.push('', '## Por tiro', '', '| Clip | Estado | Detectada | Ángulo app | Ángulo marca | Error | Dirección ok | Puntos ok | Trazo falso | Notas |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const t of [...r.tiros, ...r.dificiles]) {
    L.push(`| ${t.archivo} | ${t.estado} | ${t.detectado ? 'sí' : 'no'} | ${t.anguloApp ?? 'n/d'} | ${t.anguloMarca ?? 'n/d'} | ${t.errorGrados ?? 'n/d'} | ${t.estado === 'medido' ? (t.pasaDireccion ? 'sí' : 'no') : 'n/d'} | ${t.puntosAcertados}/${t.puntosMarcados} | ${t.trazoFalso ? 'sí' : 'no'} | ${t.notas.join('; ')} |`);
  }
  L.push('', '## Por swing', '', '| Clip | Estado | Vista app | Vista marca | Error inicio | Error tope | Error impacto | Eventos ok | Notas |', '|---|---|---|---|---|---|---|---|---|');
  for (const s of r.swings) {
    L.push(`| ${s.archivo} | ${s.estado} | ${s.vistaApp ?? 'n/d'} | ${s.vistaMarca ?? 'n/d'} | ${s.errores.inicio ?? 'n/d'} | ${s.errores.tope ?? 'n/d'} | ${s.errores.impacto ?? 'n/d'} | ${s.eventosOk ? 'sí' : 'no'} | ${s.notas.join('; ')} |`);
  }
  const i = r.informe.simulador;
  L.push('', '## Solo se informa', '', `Dirección contra el simulador (${i.n} tiros): mismo lado ${i.mismoLado}/${i.n}; error mediano ${i.errorMedianoGrados ?? 'n/d'}°. ${i.nota}`, '');
  return L.join('\n');
}

function argumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = argumentos(process.argv.slice(2));
  if (!a.referencias || !a.marcas || !a.salida) {
    console.error('Uso: node scripts/validacion/medir.mjs --referencias referencias.csv --marcas marcas.csv --salida salida-app.json [--out resultados.md] [--json resultados.json]');
    process.exit(2);
  }
  const r = evaluar({
    referencias: parseCsv(readFileSync(a.referencias, 'utf8')),
    marcas: parseCsv(readFileSync(a.marcas, 'utf8')),
    salida: JSON.parse(readFileSync(a.salida, 'utf8')),
  });
  const md = aMarkdown(r);
  if (a.out) writeFileSync(a.out, md); else console.log(md);
  if (a.json) writeFileSync(a.json, JSON.stringify(r, null, 2));
}
