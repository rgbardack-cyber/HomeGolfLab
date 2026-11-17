#!/usr/bin/env node
// Pasa los puntos de postura de cada swing del maniquí por analyzeSwing() de la app, sin cámara ni modelo.
//   node probar-swing.mjs [variante ...]      (por defecto, todas)
// Requiere Node 24+ (importa swing.ts directamente).
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const rig = await import(pathToFileURL(path.join(HERE, '../ejemplos/golfista/golfer-rig.js')));
const { analyzeSwing } = await import(pathToFileURL(path.join(REPO, 'homegolflab/src/lib/swing.ts')));

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(rig.VARIANTS);
for (const v of names) {
  const r = analyzeSwing(rig.frames(v, 20), { aspect: rig.ASPECT });
  console.log(`\n=== ${v} — ${rig.VARIANTS[v].label}`);
  if (typeof r === 'string') { console.log('  error:', r); continue; }
  const m = r.metrics;
  console.log(`  nota ${r.score}/100 · vista ${r.view ?? 'frente'} · ${r.summary}`);
  console.log('  métricas:', JSON.stringify(m));
  for (const f of r.feedback) console.log(`   [${f.severity.padEnd(7)}] ${f.title}`);
}
