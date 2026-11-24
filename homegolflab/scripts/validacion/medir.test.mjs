import { describe, it, expect } from 'vitest';
import { wilsonLower, parseCsv, anguloDeMarca, evaluar, aMarkdown, PALOS } from './medir.mjs';

// Datos sintéticos: un video vertical (aspecto 0,5625). La marca va 4 cuadros después, recto hacia arriba y un poco a la derecha.
const ASP = 0.5625;
const marcaFila = (archivo, extra = {}) => ({ archivo, aspecto: String(ASP), cuadro1: '100', x1: '0.5', y1: '0.8', cuadro2: '104', x2: '0.52', y2: '0.7', sin_marca: '', vista: '', inicio: '', tope: '', impacto: '', ...extra });
const anguloMarca = anguloDeMarca({ x1: 0.5, y1: 0.8, x2: 0.52, y2: 0.7 }, ASP);
const puntosBuenos = [100, 101, 102, 103, 104].map((c, i) => ({ cuadro: c, x: 0.5 + 0.005 * i, y: 0.8 - 0.025 * i, source: 'detected' }));
const tiroApp = (archivo, over = {}) => ({ archivo, ballTracking: { detectado: true, released: true, launchAngleDeg: anguloMarca, puntos: puntosBuenos, ...over } });

describe('wilsonLower', () => {
  it('coincide con los valores del protocolo (8/10 → 49 %, 10/10 → 72 %, 12/15 → 55 %)', () => {
    expect(wilsonLower(8, 10)).toBeCloseTo(0.49, 2);
    expect(wilsonLower(10, 10)).toBeCloseTo(0.72, 2);
    expect(wilsonLower(12, 15)).toBeCloseTo(0.55, 2);
    expect(wilsonLower(0, 0)).toBeNull();
  });
});

describe('parseCsv', () => {
  it('lee comas y comillas', () => {
    expect(parseCsv('a,b\n"x,y",2\n')).toEqual([{ a: 'x,y', b: '2' }]);
  });
  it('lee punto y coma con decimales con coma (Excel en español)', () => {
    const [f] = parseCsv('archivo;x1\nd.mov;0,5\n');
    expect(f.__decimalComa).toBe(true);
    expect(f.x1).toBe('0,5');
  });
});

describe('anguloDeMarca', () => {
  it('usa la misma fórmula que launchAngleDeg: atan2(dx·aspecto, −dy)', () => {
    expect(anguloDeMarca({ x1: 0.5, y1: 0.8, x2: 0.5, y2: 0.7 }, 1)).toBe(0);
    expect(anguloDeMarca({ x1: 0.5, y1: 0.8, x2: 0.6, y2: 0.7 }, 1)).toBeCloseTo(45, 0);
    expect(anguloDeMarca({ x1: 0.5, y1: 0.8, x2: 0.4, y2: 0.7 }, 1)).toBeCloseTo(-45, 0);
    expect(anguloDeMarca({ x1: 0.5, y1: 0.8, x2: 0.505, y2: 0.795 }, 1)).toBeNull();
  });
});

describe('un clip que pasa, uno que no y uno sin bola detectada', () => {
  const marcas = ['driver-01-atras-sim.mov', 'driver-02-atras-sim.mov', 'driver-03-atras-sim.mov'].map((a) => marcaFila(a));
  const salida = { clips: [
    tiroApp('driver-01-atras-sim.mov'),
    tiroApp('driver-02-atras-sim.mov', { launchAngleDeg: anguloMarca + 5 }),
    { archivo: 'driver-03-atras-sim.mov', ballTracking: { detectado: false, released: false, launchAngleDeg: null, puntos: [] } },
  ] };
  const r = evaluar({ referencias: [], marcas, salida });
  const por = Object.fromEntries(r.tiros.map((t) => [t.archivo, t]));

  it('pasa dentro de ±2°', () => {
    expect(por['driver-01-atras-sim.mov'].pasaDireccion).toBe(true);
    expect(por['driver-01-atras-sim.mov'].errorGrados).toBe(0);
    expect(por['driver-01-atras-sim.mov'].puntosAcertados).toBe(2);
  });
  it('falla con 5° de error', () => {
    expect(por['driver-02-atras-sim.mov'].pasaDireccion).toBe(false);
    expect(por['driver-02-atras-sim.mov'].errorGrados).toBe(5);
  });
  it('un tiro que la app no detecta cuenta como fallo, no se excluye', () => {
    const t = por['driver-03-atras-sim.mov'];
    expect(t.estado).toBe('medido');
    expect(t.pasaDireccion).toBe(false);
    expect(t.puntosAcertados).toBe(0);
    expect(r.veredictos.direccion.driver).toMatchObject({ k: 1, n: 3 });
  });
  it('con menos de 10 tiros por palo el veredicto es incompleto, nunca «pasa»', () => {
    expect(r.veredictos.direccion.driver.veredicto).toBe('incompleto (3 de 10)');
    expect(r.veredictos.direccion.wedge.veredicto).toBe('no medido');
  });
});

describe('veredictos con el juego completo', () => {
  const nombres = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${String(i + 1).padStart(2, '0')}-atras-sim.mov`);
  const todosTiros = PALOS.flatMap((p) => nombres(p, 10));
  const marcasTiros = todosTiros.map((a) => marcaFila(a));
  const dif = Array.from({ length: 10 }, (_, i) => `dificil-${String(i + 1).padStart(2, '0')}-contraluz-range.mov`);
  const swings = Array.from({ length: 15 }, (_, i) => `swing-${String(i + 1).padStart(2, '0')}-${i < 8 ? 'atras' : 'frente'}-hierro7-range.mov`);
  const marcasSwing = swings.map((a, i) => marcaFila(a, { cuadro1: '', x1: '', y1: '', cuadro2: '', x2: '', y2: '', vista: i < 8 ? 'atras' : 'frente', inicio: '10', tope: '50', impacto: '70' }));
  const swingApp = (a, i, over = {}) => ({ archivo: a, swing: { vista: i < 8 ? 'atras' : 'frente', inicio: 11, tope: 52, impacto: 70, ...over } });

  it('todo bien: «pasa» en todo', () => {
    const salida = { clips: [
      ...todosTiros.map((a) => tiroApp(a)),
      ...dif.map((a) => ({ archivo: a, ballTracking: { detectado: false } })),
      ...swings.map((a, i) => swingApp(a, i)),
    ] };
    const r = evaluar({ referencias: [], marcas: [...marcasTiros, ...marcasSwing], salida });
    expect(r.veredictos.posicion.veredicto).toBe('pasa');
    for (const p of PALOS) expect(r.veredictos.direccion[p]).toMatchObject({ veredicto: 'pasa', k: 10, n: 10 });
    expect(r.veredictos.dificiles).toMatchObject({ veredicto: 'pasa', trazosFalsos: 0 });
    expect(r.veredictos.vista).toMatchObject({ veredicto: 'pasa', k: 15, n: 15 });
    expect(r.veredictos.eventos).toMatchObject({ veredicto: 'pasa', k: 15, n: 15 });
    expect(aMarkdown(r)).toContain('| Vista de swing | pasa | 15/15 |');
  });

  it('7 de 10 en un palo queda «experimental» y no se mueve el umbral', () => {
    const salida = { clips: todosTiros.map((a, i) => (a.startsWith('wedge') && i % 10 < 3 ? tiroApp(a, { launchAngleDeg: anguloMarca + 4 }) : tiroApp(a))) };
    const r = evaluar({ referencias: [], marcas: marcasTiros, salida });
    expect(r.veredictos.direccion.wedge).toMatchObject({ veredicto: 'experimental', k: 7, n: 10 });
    expect(r.veredictos.direccion.driver.veredicto).toBe('pasa');
  });

  it('dos trazos falsos en los difíciles → experimental; uno solo todavía pasa', () => {
    const falso = (a) => ({ archivo: a, ballTracking: { detectado: true, released: true, launchAngleDeg: 10, puntos: [{ cuadro: 100, x: 0.9, y: 0.2, source: 'detected' }] } });
    const marcasDif = dif.map((a) => marcaFila(a));
    const con = (nFalsos) => evaluar({ referencias: [], marcas: marcasDif, salida: { clips: dif.map((a, i) => (i < nFalsos ? falso(a) : { archivo: a, ballTracking: { detectado: false } })) } });
    expect(con(1).veredictos.dificiles.veredicto).toBe('pasa');
    expect(con(2).veredictos.dificiles).toMatchObject({ veredicto: 'experimental', trazosFalsos: 2 });
  });

  it('un evento a 4 cuadros de la marca hace fallar ese swing', () => {
    const salida = { clips: swings.map((a, i) => swingApp(a, i, i === 0 ? { tope: 55 } : {})) };
    const r = evaluar({ referencias: [], marcas: marcasSwing, salida });
    expect(r.swings[0].eventosOk).toBe(false);
    expect(r.veredictos.eventos).toMatchObject({ k: 14, n: 15, veredicto: 'pasa' });
  });

  it('sin salida de la app: nada se mide como acierto', () => {
    const r = evaluar({ referencias: [], marcas: [], salida: { clips: [] } });
    expect(r.veredictos.vista.veredicto).toBe('no medido');
    expect(r.veredictos.direccion.driver.veredicto).toBe('no medido');
  });

  it('el simulador solo se informa y no cambia ningún veredicto', () => {
    const refs = todosTiros.map((a) => ({ archivo: a, simulador_direccion_grados: '-3' }));
    const salida = { clips: todosTiros.map((a) => tiroApp(a)) };
    const r = evaluar({ referencias: refs, marcas: marcasTiros, salida });
    expect(r.informe.simulador.n).toBe(30);
    expect(r.informe.simulador.mismoLado).toBe(0);
    expect(r.veredictos.direccion.driver.veredicto).toBe('pasa');
  });
});
