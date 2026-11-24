// Prueba de humo del servidor (bloque 4, plan v2). Uso: node scripts/smoke-servidor.mjs  (desde homegolflab/). Usa una API de Anthropic FALSA en el puerto 5198 y el servidor en el 5199; clave falsa, no gasta nada.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const APP = fileURLToPath(new URL('..', import.meta.url)).replace(/[\/]$/, '');
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK ' : 'FALLA'} ${name} ${extra}`); };
const baseEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ProgramFiles: process.env.ProgramFiles };

// 1. Arranques que deben fallar
const boot = (env) => spawnSync(process.execPath, ['server/index.ts'], { cwd: APP, env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 15000 });
let r = boot({ NODE_ENV: 'production', ENTITLEMENTS_DEV_CLAIM: '1', ENTITLEMENTS_DEV_SECRET: 'x'.repeat(20), DAILY_TOKEN_BUDGET: '1000', PORT: '5197' });
check('producción + dev-claim: no arranca', r.status === 1 && /DEV_CLAIM=1 no se permite/.test(r.stderr), `(código ${r.status})`);
r = boot({ NODE_ENV: 'production', ENTITLEMENTS_ENABLED: '1', DAILY_TOKEN_BUDGET: '1000', PORT: '5197' });
check('producción + cuota sin verificador de recibos: no arranca', r.status === 1 && /verificador de recibos/.test(r.stderr), `(código ${r.status})`);
r = boot({ NODE_ENV: 'production', PORT: '5197' });
check('producción sin DAILY_TOKEN_BUDGET: no arranca', r.status === 1 && /DAILY_TOKEN_BUDGET/.test(r.stderr), `(código ${r.status})`);

// 2. API falsa de Anthropic: devuelve un rechazo con uso real
let upstreamCalls = 0;
let mode = 'refusal';
const upstream = createServer((req, res) => {
  upstreamCalls++;
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null,
      stop_details: { type: 'refusal', category: null, explanation: null },
      content: [{ type: 'text', text: mode === 'refusal' ? '{}' : 'esto no es json' }],
      usage: { input_tokens: 3900, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }));
  });
});
await new Promise((ok) => upstream.listen(5198, '127.0.0.1', ok));

const secret = randomBytes(12).toString('hex'); // 24 caracteres, no se imprime
const dir = mkdtempSync(join(tmpdir(), 'hgl-smoke-'));
const srv = spawn(process.execPath, ['server/index.ts'], {
  cwd: APP,
  env: { ...baseEnv, PORT: '5199', ANTHROPIC_API_KEY: 'clave-falsa-no-es-real', ANTHROPIC_BASE_URL: 'http://127.0.0.1:5198', ENTITLEMENTS_ENABLED: '1', ENTITLEMENTS_DEV_CLAIM: '1', ENTITLEMENTS_DEV_SECRET: secret, ENTITLEMENTS_FILE: join(dir, 'e.json'), DAILY_TOKEN_BUDGET: '17000', TRUST_PROXY: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
await new Promise((ok) => setTimeout(ok, 2500));

const U = 'http://127.0.0.1:5199';
const post = (path, headers = {}, body = {}) => fetch(U + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const user = 'usuario-prueba-001';
const img = 'A'.repeat(200);
const coachBody = { images: [{ position: 'inicio', media_type: 'image/jpeg', data: img }], view: 'frente' };

try {
  // CORS (hallazgo 3)
  const o = await fetch(U + '/api/swing/coach', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-headers': 'content-type,x-hgl-user' } });
  check('CORS deja pasar x-hgl-user', /x-hgl-user/.test(o.headers.get('access-control-allow-headers') ?? ''), `(${o.headers.get('access-control-allow-headers')})`);

  // dev-claim (hallazgo 1)
  let s = await post('/api/entitlements/dev-claim', { 'x-hgl-user': user });
  check('dev-claim sin secreto: 403', s.status === 403, `(${s.status})`);
  s = await post('/api/entitlements/dev-claim', { 'x-hgl-user': user, 'x-hgl-dev-secret': 'secreto-equivocado-000000' });
  check('dev-claim con secreto equivocado: 403', s.status === 403, `(${s.status})`);
  s = await post('/api/entitlements/dev-claim', { 'x-hgl-user': user, 'x-hgl-dev-secret': secret });
  check('dev-claim con el secreto: 200', s.status === 200, `(${s.status})`);

  // dev-claim pasa por el límite por IP, y la IP viene del túnel (hallazgo 6)
  let codes = [];
  for (let i = 0; i < 12; i++) codes.push((await post('/api/entitlements/dev-claim', { 'x-hgl-user': 'u' + i + 'xxxxxxxx', 'cf-connecting-ip': '198.51.100.1' })).status);
  check('dev-claim limitado por IP: de 12 intentos desde la misma IP, los últimos dan 429', codes.slice(-2).every((c) => c === 429), JSON.stringify(codes.filter((c) => c === 429).length) + ' de 429');
  const other = await post('/api/entitlements/dev-claim', { 'x-hgl-user': 'otraipxxxxxxx', 'cf-connecting-ip': '198.51.100.2' });
  check('otra IP real detrás del túnel no queda bloqueada', other.status === 403, `(${other.status})`);

  // Estado inicial
  const st0 = await (await post('/api/entitlements/status', { 'x-hgl-user': user })).json();
  check('estado inicial: plan de por vida, uso 0', st0.plan === 'lifetime_early_adopter' && st0.used === 0, JSON.stringify({ plan: st0.plan, used: st0.used }));

  // Rechazo de la API con uso real (hallazgo 5): se cuenta lo real, no la reserva
  const c1 = await post('/api/swing/coach', { 'x-hgl-user': user, 'cf-connecting-ip': '198.51.100.9' }, coachBody);
  const c1b = await c1.json();
  const st1 = await (await post('/api/entitlements/status', { 'x-hgl-user': user })).json();
  check('rechazo de la API: responde 422 y cuenta los tokens reales (4.500)', c1.status === 422 && st1.used === 4500, `(estado ${c1.status}, uso ${st1.used}, mensaje: ${c1b.error ?? JSON.stringify(c1b).slice(0, 80)})`);

  mode = 'invalid';
  const c2 = await post('/api/swing/coach', { 'x-hgl-user': user, 'cf-connecting-ip': '198.51.100.8' }, coachBody);
  const st2 = await (await post('/api/entitlements/status', { 'x-hgl-user': user })).json();
  check('respuesta que no es JSON válido: 502 y también cuenta los tokens reales (total 9.000)', c2.status === 502 && st2.used === 9000, `(estado ${c2.status}, uso ${st2.used})`);

  // Tope diario con peticiones simultáneas (hallazgos 4 y 7): tope 17.000, uso real 9.000; cada reserva es de 7.500
  const before = upstreamCalls;
  const burst = await Promise.all([1, 2, 3].map((i) => post('/api/swing/coach', { 'x-hgl-user': user, 'cf-connecting-ip': '198.51.100.1' + i }, coachBody)));
  const bodies = await Promise.all(burst.map((b) => b.json()));
  const unavailable = bodies.filter((b) => b.code === 'unavailable_today').length;
  check('simultáneas: el tope diario deja pasar solo las que caben y las demás dan 503 «no disponible por hoy»', unavailable >= 1 && unavailable <= 2 && burst.filter((b) => b.status === 503).length === unavailable, `(503: ${unavailable}, llamadas a la API: ${upstreamCalls - before})`);
  check('las rechazadas por el tope no llaman a la API', upstreamCalls - before === 3 - unavailable);
} finally {
  console.log('--- registro del servidor ---');
  console.log(log.split(String.fromCharCode(10)).slice(-14).join(String.fromCharCode(10)));
  srv.kill();
  upstream.close();
}
console.log('\nResumen:', results.filter((x) => x.ok).length, 'de', results.length, 'comprobaciones correctas');
process.exit(results.every((x) => x.ok) ? 0 : 1);
