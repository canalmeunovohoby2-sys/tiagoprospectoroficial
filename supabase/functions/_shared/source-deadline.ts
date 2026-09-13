// Utilitário de deadline para fontes externas.
//
// MOTIVO: as Edge Functions são encerradas no wall-clock (150s no plano Free /
// 400s no pago). Se uma fonte externa (scraper) demora mais que isso, o worker
// é MORTO no meio do job e, como kill não é exceção, nenhum catch roda: o job
// nunca grava status/leads e a busca fica "PROCESSING" para sempre.
//
// Este helper espera as promises ATÉ `deadlineMs` e devolve as que resolveram a
// tempo + quantas ficaram pendentes. Assim o job sempre finaliza dentro do
// orçamento, sem descartar o que as fontes entregaram a tempo.
export function settleWithin<T>(
  promises: Promise<T>[],
  deadlineMs: number,
  timerImpl: (cb: () => void, ms: number) => unknown = setTimeout,
): Promise<{ settled: T[]; pending: number }> {
  const settled: T[] = [];
  const tracked = promises.map((p) =>
    Promise.resolve(p).then(
      (value) => { settled.push(value); },
      () => { /* rejeição vira "não resolvida"; o chamador trata erro por fonte */ },
    ),
  );
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve({ settled, pending: promises.length - settled.length });
    };
    Promise.all(tracked).then(finish);
    timerImpl(finish, deadlineMs);
  });
}
