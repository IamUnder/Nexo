# ADR 0002 · Tolerancia de 10 s ante la reutilización de un refresh token

- **Estado:** aceptada (2026-10-03)
- **Contexto:** los refresh tokens rotan en cada uso y, si se presenta uno ya rotado, se interpreta como robo y se revoca TODA la familia (ARCHITECTURE §7.3). Un E2E real (Playwright) reveló una carrera legítima: si el usuario recarga la página mientras la SPA renueva la sesión, la respuesta con el token nuevo se pierde, pero el servidor ya había rotado el viejo. El navegador vuelve a presentar el token viejo y el sistema cierra la sesión del usuario sin motivo. Es justo el fallo de «se pierde la sesión al recargar» de la v1.
- **Decisión:** si el token presentado fue rotado hace ≤ **10 segundos** (`REFRESH_REUSE_LEEWAY_MS`) se acepta y se emite un sucesor nuevo en la misma familia, sin revocar. Pasada la ventana, un token rotado sigue siendo señal de robo y revoca la familia. Aplica a usuarios y a superadmins.
- **Alternativas descartadas:**
  - Rotación sin detección de reutilización: pierde la protección ante robo de tokens.
  - Devolver el mismo sucesor ya emitido en la ventana: requeriría guardar el token en claro (hoy solo se guarda su hash).
  - Evitar el refresh en la carga con almacenamiento local del token: expone el token a XSS.
- **Consecuencias:** un atacante que robe un token y lo use dentro de los 10 s siguientes a una rotación legítima obtendría una sesión paralela; la ventana es corta, el token sigue siendo de un solo dispositivo y la familia se revoca al detectarse cualquier reutilización posterior. Tests: `platformCore.int.test.ts` (tolerancia y revocación fuera de ventana) y `domain.test.ts`.
