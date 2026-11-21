# HomeGolfLab

Este repositorio contiene la app y todo lo necesario para promocionarla. Dueño: Ryan. Responder en español.

## Mapa

- `homegolflab/` — la app vigente (React + Vite + Capacitor). Sus reglas, decisiones y comandos están en `homegolflab/CLAUDE.md`; leerlo antes de tocar código.
- `swingiq/` — prototipo anterior y copia de la app de Base44. Solo referencia: no se edita. **Ya no está en este repo público**: vive en el repo privado `HomeGolfLab-backup` y en el disco local.
- `brand-kit/` — logos, capturas y guía de marca.
- `marketing/` — perfil de marca, guía de lanzamiento, contratos de trabajo y fuentes de plataforma. **Ya no está en este repo público**: vive en el repo privado `HomeGolfLab-backup` y en el disco local (`.gitignore`). Los cambios a `marketing/BRAND.md` se suben a ese respaldo.
- `.claude/skills/` — ocho skills `homegolflab-*` para promocionar la app.
- `.claude/agents/` — ocho agentes `hgl-*` que usan esas skills.

## Marketing y redes

Para cualquier pieza, campaña o cuenta de HomeGolfLab, lee primero `marketing/BRAND.md`: fija qué hace la app, qué se puede afirmar, la voz, la identidad visual y qué skill cargar. El estado de cada agente y lo que falta para el lanzamiento están en `marketing/LAUNCH.md`.

Los videos cortos de marketing (TikTok, Reels, Shorts) siguen la skill `homegolflab-video-playbook`; todo guion llena su `references/plantilla-guion.md`.

No se publica nada en redes, no se crean cuentas y no se cambian credenciales sin instrucción de Ryan para esa acción.

## Mantener código y marketing de acuerdo

Si un cambio en `homegolflab/` altera una función, una medida, un límite de la versión gratuita, un precio o el estado de publicación de la app, actualiza `marketing/BRAND.md` en el mismo commit. Los agentes afirman en público lo que ese archivo dice.
