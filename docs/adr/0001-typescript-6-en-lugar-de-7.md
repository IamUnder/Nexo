# ADR 0001 · TypeScript 6 en lugar de TypeScript 7

- **Estado:** aceptada (2026-10-03)
- **Contexto:** TECH_STACK proponía «últimas estables», lo que incluía TypeScript 7.0.2. Al montar el hito 0, `dependency-cruiser` (que vigila las fronteras entre módulos, regla de oro 2) emitió: _«no encuentro un compilador compatible (typescript >=2.0.0 <7.0.0)… es probable que haya omitido fuentes y dependencias»_. En efecto, con TS 7 analizaba **6 módulos y 5 dependencias** (solo JS/JSON); con TS 6 analiza **99 módulos y 137 dependencias**. Es decir: `check:boundaries` **pasaba en falso**.
- **Decisión:** fijar TypeScript `^6` (6.0.x) en todo el monorepo. Se añadió además `tools/boundaries-selftest.mjs`, que crea módulos de ejemplo que incumplen cada regla y comprueba que se detectan, para que un fallo así no vuelva a pasar desapercibido.
- **Alternativas descartadas:**
  - TS 7 en los paquetes y TS 6 solo para dependency-cruiser: dos versiones de `typescript` en el árbol, confusión y resolución frágil con pnpm.
  - Prescindir de dependency-cruiser: perdemos la verificación automática del aislamiento entre módulos, que es un requisito comercial.
- **Consecuencias:** se pierde la velocidad del compilador nativo (irrelevante a este tamaño). Reevaluar al migrar cuando dependency-cruiser publique soporte para TS ≥ 7; el selftest debe seguir pasando tras el cambio.
