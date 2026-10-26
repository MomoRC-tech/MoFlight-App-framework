import { diagnosticActions, diagnosticStages, outcomes, member, object, DIAGNOSTIC_CHECKPOINT_LIMIT, type DiagnosticStage } from './diagnostic-vocabulary';

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
    const checkpoints = entry.checkpoints === undefined ? undefined : (() => {
      if (!Array.isArray(entry.checkpoints) || entry.checkpoints.length > DIAGNOSTIC_CHECKPOINT_LIMIT) throw new Error('Invalid diagnostic checkpoints');
      return entry.checkpoints.map(value => {
        const point = object(value);
        if (!member(diagnosticStages, point.name) || !member(['start','success','failed'], point.state)) throw new Error('Invalid diagnostic checkpoint');
        const result: { name: DiagnosticStage; state: string; offset: number; spanId?: number; parentSpanId?: number } = { name: point.name, state: point.state, offset: duration(point.offset) };
        if (point.spanId !== undefined) {
          if (typeof point.spanId !== 'number' || !Number.isSafeInteger(point.spanId) || point.spanId < 1 || point.spanId > 1_000_000) throw new Error('Invalid diagnostic span');
          result.spanId = point.spanId;
        }
        if (point.parentSpanId !== undefined) {
          if (typeof point.parentSpanId !== 'number' || !Number.isSafeInteger(point.parentSpanId) || point.parentSpanId < 1 || result.spanId === undefined || point.parentSpanId >= result.spanId) throw new Error('Invalid diagnostic parent span');
          result.parentSpanId = point.parentSpanId;
        }
        return result;
      });
    })();
    return { action: entry.action, outcome: entry.outcome, milliseconds: duration(entry.milliseconds), stages, ...(checkpoints === undefined ? {} : { checkpoints }) };
  });
  return { version: 1, units: 'milliseconds', scope: 'observed operations only; missing phases remain unmeasured',
    timing: 'operation elapsed and inclusive stages; overlapping stages must not be added or subtracted', operations };
}
