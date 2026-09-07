import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyTicket } from "../src/server";

function issue(secret: string, uid: string, pid: string | null, exp: number): string {
  const claims = { uid, pid, exp };
  const body = `${uid}|${pid ?? ""}|${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64");
  return `${Buffer.from(JSON.stringify(claims)).toString("base64")}.${sig}`;
}

describe("Runtime auth (ticket IDOR)", () => {
  const SECRET = "test-secret";
  process.env.AGENT_TICKET_SECRET = SECRET;
  const uidA = "user-a", uidB = "user-b";
  const pidA = "proj-a", pidB = "proj-b";
  const future = Date.now() + 120_000;

  it("sem Authorization → bloqueia (null)", () => {
    expect(verifyTicket(undefined)).toBeNull();
    expect(verifyTicket("")).toBeNull();
    expect(verifyTicket("Bearer lixo")).toBeNull();
  });

  it("ticket válido do usuário A para projeto A → libera", () => {
    const t = verifyTicket(`Bearer ${issue(SECRET, uidA, pidA, future)}`);
    expect(t?.uid).toBe(uidA);
    expect(t?.pid).toBe(pidA);
  });

  it("user_id falso no body NÃO muda a identidade (ticket manda)", () => {
    const t = verifyTicket(`Bearer ${issue(SECRET, uidA, null, future)}`);
    expect(t?.uid).toBe(uidA);
    expect(t?.pid).toBeNull();
  });

  it("assinatura errada → rejeitado", () => {
    const parts = issue(SECRET, uidA, pidA, future).split(".");
    const tampered = `${parts[0]}.${Buffer.from("x".repeat(20)).toString("base64")}`;
    expect(verifyTicket(`Bearer ${tampered}`)).toBeNull();
  });

  it("ticket expirado → rejeitado", () => {
    const t = verifyTicket(`Bearer ${issue(SECRET, uidA, pidA, Date.now() - 1000)}`);
    expect(t).toBeNull();
  });

  it("segregacao: ticket A(proj A) != B(proj B)", () => {
    const ta = verifyTicket(`Bearer ${issue(SECRET, uidA, pidA, future)}`);
    const tb = verifyTicket(`Bearer ${issue(SECRET, uidB, pidB, future)}`);
    expect(ta?.uid).not.toBe(tb?.uid);
    expect(ta?.pid).not.toBe(tb?.pid);
  });
});
