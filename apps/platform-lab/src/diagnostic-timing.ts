import { diagnosticActions, diagnosticStages, outcomes, member, object, type DiagnosticStage } from './diagnostic-vocabulary';

/** Project only finite timing fields. Never copy source text, IDs, context or error messages. */
export function summarizeDiagnosticTiming(input: unknown) {
  const report = object(input);
  if (report.format !== 'MoFlight support diagnostics' || report.version !== 2 || !Array.isArray(report.entries) || report.entries.length > 600) {
    throw new Error('Unsupported diagnostic timing report');
  }
  const duration = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86_400_000) throw new Error('Invalid diagnostic timing');
    return value;
  };
  const operations = report.entries.map(value => {
    const entry = object(value);
    if (!member(diagnosticActions, entry.action) || !member(outcomes, entry.outcome) || !Array.isArray(entry.stages) || entry.stages.length > diagnosticStages.length) throw new Error('Invalid diagnostic operation');
    const seen = new Set<DiagnosticStage>();
    const stages = entry.stages.map(value => {
      const stage = object(value);
      if (!member(diagnosticStages, stage.name) || seen.has(stage.name)) throw new Error('Invalid diagnostic stage');
      seen.add(stage.name);
      const milliseconds = duration(stage.milliseconds), maximum = duration(stage.maximum);
      if (!Number.isSafeInteger(stage.calls) || (stage.calls as number) < 1 || !Number.isSafeInteger(stage.failures) || (stage.failures as number) < 0 || (stage.failures as number) > (stage.calls as number) || maximum > milliseconds) throw new Error('Invalid diagnostic counts');
      return { name: stage.name, calls: stage.calls as number, failures: stage.failures as number, milliseconds, maximum };
    });
    return { action: entry.action, outcome: entry.outcome, milliseconds: duration(entry.milliseconds), stages };
  });
  return { version: 1, units: 'milliseconds', scope: 'observed operations only; missing phases remain unmeasured',
    timing: 'operation elapsed and inclusive stages; overlapping stages must not be added or subtracted', operations };
}
