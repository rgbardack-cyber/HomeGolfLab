# Medición de los 55 clips (bloque C)

Compara lo que dice la app con lo que anotó una persona en cada clip. Los umbrales están fijados en `docs/protocolo-validacion.md` (23 nov 2026) y viven en `UMBRALES` de `medir.mjs`: **no se cambian para que algo pase**.

**Estado (23 nov 2026): no medido. Los clips no llegaron.** El script solo se probó con datos sintéticos (`medir.test.mjs`).

```powershell
node scripts/validacion/medir.mjs --referencias referencias.csv --marcas marcas.csv --salida salida-app.json --out resultados.md --json resultados.json
```

## Entradas

1. **`referencias.csv`** (del protocolo): `archivo, referencia, simulador_marca_modelo, simulador_direccion_grados, simulador_elevacion_grados, carry_yardas, notas`. Solo se usa `simulador_direccion_grados`, y solo se informa.
2. **`marcas.csv`** (procedimiento de la marca manual del protocolo): `archivo, aspecto, cuadro1, x1, y1, cuadro2, x2, y2, sin_marca, vista, inicio, tope, impacto`.
   - Tiros: `cuadro1,x1,y1` (bola quieta antes del impacto) y `cuadro2,x2,y2` (4 cuadros después). `x` e `y` son fracciones del cuadro, de 0 a 1. `aspecto` = ancho ÷ alto (0,5625 en vertical; si falta, se usa 0,5625).
   - `sin_marca` = `1` si la bola no se ve: el clip no se mide (se regraba). En un clip «difícil», si la app dibujó un trazo igual, cuenta como trazo falso.
   - Swings: `vista` (`frente` o `atras`) e `inicio`, `tope`, `impacto` como número de cuadro.
   - Se acepta coma o punto y coma como separador; con punto y coma, los decimales pueden llevar coma.
3. **`salida-app.json`**: un objeto `{ "clips": [ ... ] }`, un elemento por clip, con el nombre de archivo igual al de los CSV:

```json
{
  "clips": [
    { "archivo": "driver-01-atras-sim.mov",
      "ballTracking": { "detectado": true, "released": true, "launchAngleDeg": 12.3,
        "puntos": [ { "cuadro": 100, "x": 0.5, "y": 0.8, "source": "detected" } ] } },
    { "archivo": "swing-01-atras-hierro7-range.mov",
      "swing": { "vista": "atras", "inicio": 11, "tope": 52, "impacto": 70 } }
  ]
}
```

   `launchAngleDeg` es el que calcula la app (`src/lib/ballflight.ts`); `puntos` son los de `TrackResult`, con el número de cuadro (`cuadro`). **Falta** una herramienta que exporte este JSON desde la app: hoy hay que sacarlo a mano o con un gancho de desarrollo. Anotado como pendiente.

El tipo de clip sale del nombre: `driver-`, `hierro7-`, `wedge-` (tiros), `dificil-` y `swing-`.

## Qué calcula

| Función | Cómo se mide | Pasa si |
|---|---|---|
| Posición de la bola | punto de la app en el mismo cuadro que cada marca, a ≤ 1,5 % del cuadro (distancia con el aspecto) | ≥ 85 % de los puntos, Wilson ≥ 75 %, falsos positivos ≤ 10 %, continuidad ≥ 80 % |
| Dirección en la imagen (R5) | ángulo de la app − ángulo de la marca (misma fórmula), por palo | 8 de 10 con ≤ 2° |
| Condiciones difíciles | clips con trazo falso | ≤ 1 de 10 |
| Vista de swing | vista de la app = vista marcada | 14 de 15 |
| Eventos de swing | inicio, tope e impacto a ≤ 3 cuadros | 12 de 15 |

Definiciones que el protocolo no daba y que se fijaron aquí [PROPUESTA, Ryan debe confirmarlas antes de ver clips]: «falso positivo» = tiro con trazo cuyo punto queda a más del 5 % del cuadro de la marca; «continuidad» = promedio de cuadros con punto detectado entre `cuadro1` y `cuadro2`; la distancia de posición se mide en fracción del alto del cuadro, con la x corregida por el aspecto.

Veredicto: `pasa`, `experimental`, `incompleto (n de N)` (faltan clips: nunca da «pasa») o `no medido`. Cada fila lleva k/n y la cota inferior de Wilson al 95 %. La dirección contra el simulador va en «Solo se informa» y no cambia ningún veredicto.

## Pruebas

```powershell
npx vitest run scripts/validacion
```
