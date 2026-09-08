import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { resolveIdentity, editKey } from "../src/server";

function issue(secret: string, uid: string, pid: string | null, exp: number): string {
  const claims = { uid, pid, exp };
  const body = `${uid}|${pid ?? ""}|${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64");
  return `${Buffer.from(JSON.stringify(claims)).toString("base64")}.${sig}`;
}

const cleanEnv = () => {
  delete process.env.AGENT_TICKET_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
};

describe("Agent Runtime LOCAL — resolveIdentity", () => {
  it("sem secret e sem JWT → identidade nula (auth exigida)", async () => {
    cleanEnv();
    expect(await resolveIdentity(undefined)).toBeNull();
    expect(await resolveIdentity("Bearer abc")).toBeNull();
  });

  it("ticket HMAC continua válido quando AGENT_TICKET_SECRET está presente (Railway)", async () => {
    cleanEnv();
    process.env.AGENT_TICKET_SECRET = "s";
    const tk = issue("s", "u1", "p1", Date.now() + 60_000);
    const id = await resolveIdentity(`Bearer ${tk}`, "p1");
    expect(id).not.toBeNull();
    expect(id?.method).toBe("ticket");
    expect(id?.uid).toBe("u1");
    expect(id?.pid).toBe("p1");
  });

  it("ticket com secret errado → rejeitado", async () => {
    cleanEnv();
    process.env.AGENT_TICKET_SECRET = "s";
    const tk = issue("outro", "u1", "p1", Date.now() + 60_000);
    expect(await resolveIdentity(`Bearer ${tk}`)).toBeNull();
  });

  it("JWT (3 partes) SEM SUPABASE configurado → rejeitado (não usa body user_id)", async () => {
    cleanEnv();
    delete process.env.AGENT_TICKET_SECRET;
    const fakeJwt = "header.payload.sig";
    const id = await resolveIdentity(`Bearer ${fakeJwt}`, "p1");
    expect(id).toBeNull();
  });

  it("sessões locais continuam isoladas por uid+pid+conversationId", () => {
    expect(editKey("u1", "p1", "c1")).toBe("edit:u1:p1:c1");
    expect(editKey("u1", "p1", "c2")).not.toBe(editKey("u1", "p1", "c1"));
    expect(editKey("u2", "p1", "c1")).not.toBe(editKey("u1", "p1", "c1"));
  });
});
