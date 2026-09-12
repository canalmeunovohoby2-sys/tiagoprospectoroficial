// Cache em memória com TTL — evita repetir consultas Overpass idênticas,
// resolução de website/imagem e lookups Wikimedia dentro da vida da instância.
// Não é cache infinito: expira e tem teto de entradas (LRU-ish por inserção).
export class TtlCache<T> {
  private readonly map = new Map<string, { value: T; expires: number }>();

  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.map.size;
  }
}

/** Chave estável para cache (normaliza espaços/caixa). */
export function cacheKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => String(p ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}
