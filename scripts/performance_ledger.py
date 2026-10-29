"""Validate the timing ledger and reproduce its portable charts/tables (stdlib only)."""
from __future__ import annotations

import argparse
import csv
import html
import io
import json
import math
from pathlib import Path
import re
import statistics
import sys

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "docs/verification/performance"
KINDS = {"phone", "android-unspecified", "emulator-synthetic", "emulator-live", "host"}
OUTCOMES = {"success", "partial", "failed", "blocked", "cancelled", "interrupted", "running", "unknown"}
COLORS = {"phone": "#087e8b", "android-unspecified": "#7857a5", "emulator-synthetic": "#1967b5", "emulator-live": "#b36b00", "host": "#666666"}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def validate(data, root=ROOT):
    if set(data) != {"version", "coverage", "runs"} or data["version"] != 1:
        raise ValueError("Unsupported ledger envelope")
    seen = set()
    for run in data["runs"]:
        required = {"id", "recorded_date", "kind", "source_commit", "apk_sha256", "device", "input", "conditions", "method", "limits", "evidence", "comparison", "samples"}
        if set(run) != required or not re.fullmatch(r"[a-z0-9-]+", run["id"]):
            raise ValueError("Invalid run fields or ID")
        if run["id"] in seen:
            raise ValueError("Duplicate run ID")
        seen.add(run["id"])
        if run["kind"] not in KINDS or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", run["recorded_date"]):
            raise ValueError("Invalid environment/date")
        if run["source_commit"] is not None and not re.fullmatch(r"[a-f0-9]{7,40}", run["source_commit"]):
            raise ValueError("Invalid source commit")
        if run["apk_sha256"] is not None and not re.fullmatch(r"[a-f0-9]{64}", run["apk_sha256"]):
            raise ValueError("Invalid APK hash")
        if not run["limits"] or not run["evidence"] or not run["samples"]:
            raise ValueError("Missing evidence, limits or samples")
        for evidence in run["evidence"]:
            path = (root / evidence.split("#")[0]).resolve()
            if not path.is_relative_to(root.resolve()) or not path.is_file():
                raise ValueError("Missing or foreign evidence path")
        comparison = run["comparison"]
        if comparison is not None and (set(comparison) != {"group", "variant"} or comparison["variant"] not in {"baseline", "candidate"}):
            raise ValueError("Invalid comparison")
        sample_ids = set()
        for sample in run["samples"]:
            if set(sample) != {"id", "metric", "milliseconds", "outcome", "details"}:
                raise ValueError("Invalid sample fields; do not include raw context or source data")
            if sample["id"] in sample_ids or not finite(sample["milliseconds"]):
                raise ValueError("Duplicate sample or invalid duration")
            sample_ids.add(sample["id"])
            if sample["outcome"] not in OUTCOMES or not re.fullmatch(r"[a-z0-9-]+", sample["metric"]):
                raise ValueError("Invalid metric/outcome")
            # Details are numeric measurements keyed by semantic paths only, never arbitrary report objects.
            if not isinstance(sample["details"], dict):
                raise ValueError("Invalid details")
            for key, value in sample["details"].items():
                if not re.fullmatch(r"[A-Za-z0-9_.-]+", key) or not finite(value):
                    raise ValueError("Invalid measurement detail")
    groups = {}
    for run in data["runs"]:
        if run["comparison"]:
            key = run["comparison"]["group"]
            groups.setdefault(key, []).append(run)
    for runs in groups.values():
        if len(runs) != 2 or {r["comparison"]["variant"] for r in runs} != {"baseline", "candidate"}:
            raise ValueError("Comparison needs exactly one baseline and candidate")
        if len({(r["kind"], r["device"], r["input"], r["conditions"], r["method"]) for r in runs}) != 1:
            raise ValueError("Comparison inputs/environment differ")
        metrics = [{s["metric"] for s in r["samples"]} for r in runs]
        if metrics[0] != metrics[1] or any(s["outcome"] != "success" for r in runs for s in r["samples"]):
            raise ValueError("Comparison metrics/outcomes differ")
    return data


def number(value):
    return f"{value:,.3f}".rstrip("0").rstrip(".")


def evidence_link(run):
    path = run["evidence"][0]
    return f"[evidence](../../../{path})"


def flat_csv(data):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["run", "recorded_date", "kind", "source_commit", "sample", "metric", "outcome", "measurement", "value", "unit", "evidence"])
    for run in data["runs"]:
        for sample in run["samples"]:
            values = {"milliseconds": sample["milliseconds"], **sample["details"]}
            for key, value in values.items():
                lower = key.lower()
                unit = "ms" if lower.endswith(("milliseconds", "ms", "offset", "maximum")) or (lower.startswith("stages.") and lower.count(".") == 1) else "count"
                if "kib" in lower:
                    unit = "KiB"
                elif lower.endswith("percent"):
                    unit = "%"
                writer.writerow([run["id"], run["recorded_date"], run["kind"], run["source_commit"], sample["id"], sample["metric"], sample["outcome"], key, value, unit, run["evidence"][0]])
    return out.getvalue()


def text(x, y, value, size=14, color="#243447", anchor="start"):
    return f'<text x="{x:.2f}" y="{y:.2f}" font-size="{size}" fill="{color}" text-anchor="{anchor}">{html.escape(str(value))}</text>'


def svg_begin(title, subtitle, width, height):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">', f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(subtitle)}</desc>', '<rect width="100%" height="100%" fill="#ffffff"/>', '<g font-family="Arial, sans-serif">', text(24, 32, title, 21), text(24, 58, subtitle, 13)]


def observation_chart(data):
    rows = [(run, sample) for run in data["runs"] if run["kind"] in {"phone", "android-unspecified", "emulator-live"} for sample in run["samples"] if sample["metric"] == "update-flights" and sample["outcome"] == "success"]
    width, height = 1100, 155 + 43 * len(rows)
    parts = svg_begin("Android Sync history — individual successful observations", "Historical source/record order, not a matched trend. Unknown devices stay separate; elapsed includes recorded waits.", width, height)
    left, right, top, bottom = 295, 980, 100, height - 45
    maximum = max((sample["milliseconds"] / 1000 for _, sample in rows), default=1) * 1.12
    for i in range(6):
        x = left + (right-left)*i/5
        parts += [f'<path d="M{x} {top-20}V{bottom}" stroke="#dce3e8"/>', text(x, bottom+22, number(maximum*i/5), 12, anchor="middle")]
    for index, (run, sample) in enumerate(rows):
        y = top + index*43
        x = left + (right-left)*sample["milliseconds"]/1000/maximum
        label = f'{run["source_commit"] or "unknown"}'[:7] + " · " + run["kind"]
        parts += [text(left-12, y, label, 12, anchor="end"), text(left-12, y+15, run["recorded_date"]+" · "+sample["id"], 11, anchor="end"), f'<circle cx="{x}" cy="{y}" r="5" fill="{COLORS[run["kind"]]}"/>', text(x+10, y+5, number(sample["milliseconds"]/1000)+" s", 13)]
    parts += [text((left+right)/2, height-4, "Operation elapsed time (seconds); no connecting line or speedup claim", 12, anchor="middle"), "</g></svg>\n"]
    return "\n".join(parts)


def pairs(data, kind):
    groups = {}
    for run in data["runs"]:
        if run["comparison"] and run["kind"] == kind:
            groups.setdefault(run["comparison"]["group"], {})[run["comparison"]["variant"]] = run
    rows = []
    for group, variants in groups.items():
        baseline, candidate = variants["baseline"], variants["candidate"]
        for metric in dict.fromkeys(s["metric"] for s in baseline["samples"]):
            a = [s["milliseconds"] for s in baseline["samples"] if s["metric"] == metric]
            b = [s["milliseconds"] for s in candidate["samples"] if s["metric"] == metric]
            rows.append((group, metric, baseline, candidate, a, b))
    return rows


def comparison_chart(data):
    rows = pairs(data, "emulator-synthetic")
    height = 150+65*len(rows)
    parts = svg_begin("Controlled synthetic Android comparisons", "Each row is its own matched experiment. All samples shown; ticks span min–max and larger marks show medians.", 1100, height)
    left, right, top, bottom = 375, 940, 107, height-43
    maximum = max((max(a+b) for *_, a, b in rows), default=1)*1.07
    for i in range(6):
        x = left+(right-left)*i/5
        parts += [f'<path d="M{x} {top-25}V{bottom}" stroke="#dce3e8"/>', text(x, bottom+23, number(maximum*i/5000), 12, anchor="middle")]
    for index, (group, metric, base, cand, a, b) in enumerate(rows):
        y = top+65*index
        parts += [text(left-14, y+2, group, 12, anchor="end"), text(left-14, y+21, metric, 12, anchor="end")]
        for samples, delta, color in [(a, -5, "#7a8795"), (b, 13, "#087e8b")]:
            pos = lambda v: left+(right-left)*v/maximum
            parts.append(f'<path d="M{pos(min(samples))} {y+delta}H{pos(max(samples))}" stroke="{color}" stroke-width="2"/>')
            for j, v in enumerate(samples):
                parts.append(f'<circle cx="{pos(v)}" cy="{y+delta+(j%3-1)*2}" r="2" fill="{color}"/>')
            parts.append(f'<circle cx="{pos(statistics.median(samples))}" cy="{y+delta}" r="5" fill="{color}"/>')
        change = 100*(statistics.median(b)/statistics.median(a)-1)
        parts.append(text(right+12, y+8, f"{change:+.1f}%", 14))
    parts += [text(24, height-8, "Gray: baseline · Teal: candidate · Units: seconds · Synthetic local operations, not whole live Sync or phone taps", 13), "</g></svg>\n"]
    return "\n".join(parts)


def local_chart(data):
    rows = []
    for run in data["runs"]:
        metrics = ["read-flights", "start-screen", "start-presentation", "read-flight-detail"] if run["kind"] in {"phone", "android-unspecified", "emulator-live"} else []
        metrics += list(dict.fromkeys(s["metric"] for s in run["samples"] if s["metric"].startswith(("ui-observed-settings-", "ui-observed-backup-"))))
        for metric in metrics:
            samples = [s for s in run["samples"] if s["metric"] == metric and (s["outcome"] == "success" or metric.startswith("ui-observed-"))]
            if samples:
                rows.append((run, metric, samples))
    height = 155 + 38*len(rows)
    parts = svg_begin("Saved-local reads, startup and page-entry observations", "Individual successes; page observations also include preparation. Input, startup/warm state and observer delay may differ.", 1100, height)
    left, right, top, bottom = 375, 980, 100, height-43
    maximum = max((s["milliseconds"] for _, _, ss in rows for s in ss), default=1)*1.08
    for i in range(6):
        x = left+(right-left)*i/5
        parts += [f'<path d="M{x} {top-20}V{bottom}" stroke="#dce3e8"/>', text(x, bottom+22, number(maximum*i/5000), 12, anchor="middle")]
    for index, (run, metric, ss) in enumerate(rows):
        y = top + index*38
        parts += [text(left-12, y, f'{(run["source_commit"] or "unknown")[:7]} · {run["kind"]}', 12, anchor="end"), text(left-12, y+14, metric+f' (n={len(ss)})', 12, anchor="end")]
        for j, sample in enumerate(ss):
            x = left+(right-left)*sample["milliseconds"]/maximum
            tip = f'{run["id"]} / {sample["id"]}: {number(sample["milliseconds"])} ms'
            parts.append(f'<circle cx="{x}" cy="{y+(j%3-1)*4}" r="4" fill="{COLORS[run["kind"]]}"><title>{html.escape(tip)}</title></circle>')
    parts += [text(24, height-7, "Seconds · Operation completion / React proxies; first presented pixels remain unmeasured. Full values: history and CSV.", 13), "</g></svg>\n"]
    return "\n".join(parts)


def history(data):
    lines = ["# Complete runtime sample index", "", "Generated by `python scripts/performance_ledger.py`. Numeric stage/counter/checkpoint values are preserved in [ledger.json](ledger.json) and [measurements.csv](measurements.csv). Dates are evidence-record dates, not invented measurement timestamps. Repeated exports are deduplicated; distinct runs and failed/running observations remain separate.", ""]
    for run in data["runs"]:
        lines += [f'## {run["id"]}', "", f'{run["recorded_date"]} · **{run["kind"]}** · source `{run["source_commit"] or "unknown"}` · APK `{run["apk_sha256"] or "not established"}`.', "", f'**Device:** {run["device"]}. **Input:** {run["input"]}. **Conditions:** {run["conditions"]}.', "", f'**Method:** {run["method"]}', "", "**Limits:** " + " ".join(run["limits"]), "", evidence_link(run), "", "| Sample | Metric | Outcome | Elapsed ms | Additional numeric values |", "| --- | --- | --- | ---: | ---: |"]
        for sample in run["samples"]:
            lines.append(f'| {sample["id"]} | {sample["metric"]} | {sample["outcome"]} | {number(sample["milliseconds"])} | {len(sample["details"])} |')
        lines.append("")
    return "\n".join(lines)


def overview(data):
    runs = data["runs"]
    samples = sum(len(r["samples"]) for r in runs)
    numeric = sum(1+len(s["details"]) for r in runs for s in r["samples"])
    lines = ["# Runtime performance ledger", "", "Maintained under [#90](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/90), with #41 owning Sync investigation and #45 Start/tab/resume responsiveness. Manuel requested permanent tracking on 29 October 2026. This is the single index for recorded runtime timings; package reports retain their source-specific methods and acceptance evidence.", "", f"The ledger currently stores **{len(runs)} run groups, {samples} sample/observation records and {numeric:,} numeric values**, including elapsed durations, inclusive stages, counters, timing offsets and available render proxies. Records include supporting host runs and derived event/prediction observations; this count is not a number of independent device trials. [Complete sample history](history.md) · [Machine-readable ledger](ledger.json) · [All numeric values (CSV)](measurements.csv).", "", "## Phone and other supplied Android observations", "", "![Android Sync observations](sync-history.svg)", "", "Only the explicitly identified Pixel 6a session is labelled phone. Other supplied Android exports retain unknown device identity; Android API alone does not identify a phone or emulator. Each point is one successful operation; its x coordinate is elapsed time, not a calendar date. Rows follow historical source/record order. Different datasets, receipt history, waits, network and device conditions prevent a causal release-speed comparison. Failed, partial, blocked, interrupted and running operations remain in the complete history/CSV and are excluded from the successful-Sync chart.", "", "## Controlled emulator experiments", "", "![Controlled emulator comparisons](native-comparisons.svg)", "", "| Experiment / operation | Baseline source | Candidate source | Samples each | Baseline median (range), ms | Candidate median (range), ms | Change |", "| --- | --- | --- | ---: | ---: | ---: | ---: |"]
    for group, metric, base, cand, a, b in pairs(data, "emulator-synthetic"):
        delta = 100*(statistics.median(b)/statistics.median(a)-1)
        lines.append(f'| [{group}](history.md#{base["id"]}) / {metric} | `{(base["source_commit"] or "unknown")[:7]}` | `{(cand["source_commit"] or "unknown")[:7]}` | {len(a)} / {len(b)} | {number(statistics.median(a))} ({number(min(a))}–{number(max(a))}) | {number(statistics.median(b))} ({number(min(b))}–{number(max(b))}) | {delta:+.1f}% |')
    lines += ["", "These percentages belong to separate experiments; do not add them or treat all baselines as successive releases of one workload. The older constant-lease detail proof missed a production lifecycle regression and remains historical synthetic evidence. Its corrected registry proof is a separate experiment, not a speed regression. Layout effects and animation-frame callbacks are render proxies, not proof of presented pixels. Host results are separately indexed and never mixed with device charts.", "", "## Saved-local reads and startup", "", "![Local Android reads and startup observations](local-history.svg)", "", "No median or connecting trend is shown for these unmatched observations. The full history includes failed detail reads, obsolete reads, incomplete operations and individual stage values. Startup/commit markers retain their original timing boundary; a successful marker does not establish a first presented frame.", "", "## Coverage and remaining gaps", ""]
    lines += [f"- {item}" for item in data["coverage"]]
    lines += ["", "## Record every future measurement", "", "1. In the same work package, retain the original report in ignored private storage. Use `node --import tsx scripts/flight_loading_timing.ts INPUT.json NEW_OUTPUT.json` for the existing timing-only projection. Never publish a raw support report, account/flight content, credentials or arbitrary context.", "2. Append a run envelope matching `ledger.json` (or `run-template.json`). Record actual source/APK, device/API/ABI, network/session, input/history size, observer overhead, endpoints, outcomes and recorded date. Unknowns remain explicit. Keep individual sample values, inclusive stages/counters/checkpoint offsets and failures; numeric details use semantic keys. Preserve unavailable fields as limitations rather than zero. Prefer at least five fixed-input samples for a controlled comparison; an observation is still worth recording when only one exists.", "3. Use a distinct `comparison.group` only for the same fixture, environment, timing boundary and method, with baseline/candidate variants. Do not average cold/warm/startup/resume or interrupted runs together. Keep host, synthetic emulator, live emulator, phone and unidentified Android separate. Amend evidence for an existing operation instead of counting its duplicate export as a new trial.", "4. Run `python scripts/performance_ledger.py --add-run NEW_RUN.json` (new ID required), or edit the ledger for a reviewed paired batch. Then run `python scripts/performance_ledger.py --check` and the focused generator tests. Link the package evidence/result in #90 and commit/push the ledger and generated files with that package. The command is local and makes no device/provider/model/network calls.", "", "Future tracking happens whenever a measurement is supplied or a test runs; this does not schedule autonomous testing or authorize new execution/spending. Existing requirements for comparable populated Start preview/full-validation, tab/resume, foreground live Sync and physical-phone/iOS acceptance remain open. A missing measurement is never a passed gate.", "", "## Verification of this ledger package", "", "29 October 2026, Windows x64 / Python 3.12.10 / Node 24.18.0: all 10 focused ledger tests pass; generation/freshness and 775 local links/anchors pass. The phone operation/stage values and all 40 replay-comparison native samples match committed evidence; reported disjoint windows sum to their operation totals. All three SVG charts parse and were rendered/inspected for readable labels and values. Tests also cover invalid/private raw fields, nonfinite values, incompatible comparisons, stale outputs, safe appending and chart/CSV propagation. Historical report-only rounded values remain labelled. No application tests/builds, APK, device trial or provider/model call was performed for this documentation/tooling package; ledger commit/evidence is linked in #90.", ""]
    return "\n".join(lines)


def outputs(data):
    return {"README.md": overview(data), "history.md": history(data), "measurements.csv": flat_csv(data), "sync-history.svg": observation_chart(data), "native-comparisons.svg": comparison_chart(data), "local-history.svg": local_chart(data)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--add-run", type=Path)
    args = parser.parse_args()
    if args.check and args.add_run:
        parser.error("--check does not mutate the ledger")
    ledger = DIRECTORY / "ledger.json"
    data = json.loads(ledger.read_text(encoding="utf-8"))
    if args.add_run:
        data["runs"].append(json.loads(args.add_run.read_text(encoding="utf-8-sig")))
    validate(data)
    rendered = outputs(data)
    if args.add_run:
        temporary = ledger.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
        temporary.replace(ledger)
    stale = []
    for name, content in rendered.items():
        path = DIRECTORY / name
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(name)
        else:
            path.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        print("Stale performance outputs: " + ", ".join(stale), file=sys.stderr)
        return 1
    print(f'Performance ledger {"checked" if args.check else "generated"}: {len(data["runs"])} groups; {len(rendered)} portable outputs.')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
