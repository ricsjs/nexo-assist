import { INTENT_LABEL, LOW_CONFIDENCE, type TurnTrace } from "@nexo/domain";

// Mostra no terminal o mesmo que a interface vai mostrar: as ações acima da resposta
// e, expandido, o que o agent entendeu, com que segurança e por quê.
export function printTrace(trace: TurnTrace, { chips = true } = {}): void {
  const line = trace.steps.map((s) => `${s.ok ? "✓" : "✗"} ${s.label}`).join("  ");
  if (chips && line) console.log(`  ${line}`);

  const d = trace.decision;
  if (d) {
    const pct = Math.round(d.confidence * 100);
    console.log(`  ┌ entendeu:  ${d.understood} (${INTENT_LABEL[d.intent]})`);
    console.log(`  │ ação:      ${d.action}`);
    console.log(`  │ segurança: ${pct}%${d.confidence < LOW_CONFIDENCE ? " · baixa, pede analista" : ""}`);
    console.log(`  │ por quê:   ${d.reason}`);
  } else {
    console.log("  ┌ (o agent não registrou a decisão nesta mensagem)");
  }
  for (const s of trace.steps) console.log(`  │ ${s.ok ? "✓" : "✗"} ${s.label}: ${s.summary}`);
  const tokens = trace.tokens ? ` · ${trace.tokens.input}+${trace.tokens.output} tokens` : "";
  console.log(`  └ ${trace.model} · ${(trace.durationMs / 1000).toFixed(1)}s${tokens}`);
}
