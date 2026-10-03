import * as argon2 from "argon2";
import { decodeProtectedHeader, errors as joseErrors, jwtVerify, SignJWT } from "jose";
import type { SigningKeys } from "../../../platform/config/env";
import { TokenExpiredError, UnauthenticatedError } from "../../../platform/errors";
import type { AccessClaims } from "../../../platform/ports";
import type { AccessClaimsInput, PasswordHasher, TokenService } from "../application/ports";

/** Argon2id (ganador de PHC). Los parámetros por defecto son los recomendados por OWASP. */
export class Argon2Hasher implements PasswordHasher {
  constructor(private readonly options: { memoryCost?: number; timeCost?: number } = {}) {}
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, ...this.options });
  }
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false; // hash corrupto o de otro formato: no autentica, no revienta
    }
  }
}

const ISSUER = "nexo";
const AUDIENCE = "nexo-api";

/**
 * Tokens de acceso JWT firmados con HS256. La PRIMERA clave de `JWT_SIGNING_KEYS` firma; todas validan
 * (rotación sin cortes: añadir la nueva delante, retirar la vieja pasados 15 min). `kid` en la cabecera.
 */
export class JoseTokenService implements TokenService {
  readonly accessTtlSeconds: number;
  readonly refreshTtlMs: number;
  constructor(
    private readonly keys: SigningKeys,
    options: { accessTtlSeconds: number; refreshTtlDays: number },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.accessTtlSeconds = options.accessTtlSeconds;
    this.refreshTtlMs = options.refreshTtlDays * 24 * 60 * 60 * 1000;
  }

  private key(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }

  private sign(
    payload: Record<string, unknown>,
    subject: string,
    ttlSeconds: number,
  ): Promise<string> {
    const iat = Math.floor(this.now().getTime() / 1000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", kid: this.keys.current.kid })
      .setSubject(subject)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(iat + ttlSeconds)
      .sign(this.key(this.keys.current.secret));
  }

  signAccess(c: AccessClaimsInput): Promise<string> {
    return this.sign(
      {
        scope: c.scope,
        ...(c.tenantId ? { tid: c.tenantId } : {}),
        ...(c.membershipId ? { mid: c.membershipId } : {}),
        ...(c.role ? { role: c.role } : {}),
        ...(c.seat ? { seat: c.seat } : {}),
      },
      c.userId,
      this.accessTtlSeconds,
    );
  }

  /** Token corto (5 min) para elegir empresa tras un login con varias membresías. */
  signSelection(userId: string): Promise<string> {
    return this.sign({ scope: "selection" }, userId, 300);
  }

  private async verifyRaw(token: string) {
    try {
      const { kid } = decodeProtectedHeader(token);
      const secret = kid ? this.keys.all.get(kid) : undefined;
      if (!secret) throw new UnauthenticatedError("Clave de firma desconocida");
      const { payload } = await jwtVerify(token, this.key(secret), {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: this.now(),
      });
      return payload;
    } catch (err) {
      if (err instanceof UnauthenticatedError) throw err;
      if (err instanceof joseErrors.JWTExpired) {
        throw new TokenExpiredError();
      }
      throw new UnauthenticatedError("Token no válido");
    }
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const p = await this.verifyRaw(token);
    const scope = p.scope;
    if ((scope !== "tenant" && scope !== "platform") || typeof p.sub !== "string") {
      throw new UnauthenticatedError("Token no válido");
    }
    return {
      scope,
      userId: p.sub,
      ...(typeof p.tid === "string" ? { tenantId: p.tid } : {}),
      ...(typeof p.mid === "string" ? { membershipId: p.mid } : {}),
      ...(typeof p.role === "string" ? { role: p.role } : {}),
      ...(typeof p.seat === "string" ? { seat: p.seat } : {}),
    };
  }

  async verifySelection(token: string): Promise<{ userId: string }> {
    const p = await this.verifyRaw(token);
    if (p.scope !== "selection" || typeof p.sub !== "string")
      throw new UnauthenticatedError("Token no válido");
    return { userId: p.sub };
  }
}
