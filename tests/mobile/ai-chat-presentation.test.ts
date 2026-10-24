import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element { type: any; props: Record<string, any>; children: any[] }

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label} to exist`);
  return value;
}

const source = ts.transpileModule(
  readFileSync(new URL('../../apps/platform-lab/src/mobile/AiChat.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false } },
).outputText;

function conversation(id: string, title: string, draft: string, messages: any[] = []): any {
  return {
    version: 1, id, ownerId: 'synthetic-owner', title, draft, context: null, messages,
    activitySequence: 0, updatedAt: '2026-10-24T12:00:00.000Z',
  };
}

function message(id: string, status: string, input: string, answer: any = null): any {
  return { id, input, context: null, status, answer, attempt: null, createdAt: '2026-10-24T12:00:00.000Z' };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const calls = { create: 0, select: [] as string[], remove: [] as string[], drafts: [] as string[], send: 0, cancel: 0, toggle: [] as boolean[], feature: [] as string[], evidence: [] as { message: any; ids: string[] }[] };
  const selected = conversation('chat-one', 'Saved chat', 'Durable draft');
  const props: any = {
    conversations: [selected], selectedId: selected.id, enabled: true, busy: false, loading: false,
    notice: null, usage: null, feature: 'question',
    onCreate: () => { calls.create++; },
    onSelect: (id: string) => { calls.select.push(id); },
    onDelete: (id: string) => { calls.remove.push(id); },
    onDraft: (text: string) => { calls.drafts.push(text); },
    onSend: () => { calls.send++; },
    onCancel: () => { calls.cancel++; },
    onToggle: (enabled: boolean) => { calls.toggle.push(enabled); },
    onFeature: (feature: string) => { calls.feature.push(feature); },
    onEvidence: (savedMessage: any, ids: string[]) => { calls.evidence.push({ message: savedMessage, ids }); },
    ...overrides,
  };

  const react: any = { Fragment: 'Fragment' };
  react.createElement = (type: any, propsValue: any, ...children: any[]): Element => ({
    type, props: propsValue ?? {}, children: children.flat(Infinity),
  });
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, any> = {
    react: { default: react, ...react },
    'react-native': {
      ...leaves(['Pressable', 'TextInput', 'View']),
      StyleSheet: { create: (value: unknown) => value },
    },
    './theme': {
      ...leaves(['Action', 'Card', 'Chip', 'Empty', 'Label', 'Section']),
      colors: { background: '#001b29', card: '#062331', border: '#183d50', text: '#f4f8fc', muted: '#a9bed3', blue: '#27d3d2', cyan: '#27d3d2' },
      ui: { pressed: { opacity: 0.72 } },
    },
  };
  const context: Record<string, any> = { exports: {}, require: (name: string) => {
    assert.ok(name in modules, `unexpected import: ${name}`);
    return modules[name];
  } };
  runInNewContext(source, context);

  const rendered: Element[] = [];
  const render = (node: any): any[] => {
    if (Array.isArray(node)) return node.flatMap(render);
    if (node === null || node === undefined || typeof node !== 'object' || !('type' in node)) return [node];
    if (node.type === react.Fragment) return node.children.flatMap(render);
    if (typeof node.type === 'function') return render(node.type({ ...node.props, children: node.children }));
    const result = { ...node, children: node.children.flatMap(render) };
    rendered.push(result);
    return [result];
  };
  const tree = render(context.exports.AiChat(props));
  const text = (node: any): string => Array.isArray(node)
    ? node.map(text).join('')
    : node?.children ? node.children.map(text).join('')
      : typeof node === 'string' ? node : '';
  const find = (type: string, predicate: (node: Element) => boolean = () => true) =>
    rendered.filter(node => node.type === type && predicate(node));
  const requireNode = (type: string, predicate: (node: Element) => boolean = () => true) =>
    required(rendered.find(node => node.type === type && predicate(node)), `node ${type}`);

  return { calls, props, selected, tree, nodes: rendered, text: (node: any = tree) => text(node), find, requireNode, context };
}

test('composer restores the selected conversation draft and declares its contract limit', () => {
  const f = fixture();
  const input = f.requireNode('TextInput');
  assert.equal(input.props.value, 'Durable draft');
  assert.equal(input.props.maxLength, 16_000);
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.accessibilityLabel, 'Frage oder Nachrichtenentwurf');
});

test('sending and cancellation are explicit actions with no automatic dispatch', () => {
  const f = fixture();
  const input = f.requireNode('TextInput');
  assert.equal(f.calls.send, 0);
  const send = f.requireNode('Action', node => node.props.label === 'Nachricht senden');
  assert.equal(send.props.disabled, false);
  input.props.onChangeText('A revised draft');
  assert.deepEqual(f.calls.drafts, ['A revised draft']);
  assert.equal(f.calls.send, 0);
  send.props.onPress();
  assert.equal(f.calls.send, 1);

  const busy = fixture({ busy: true });
  assert.equal(busy.requireNode('Action', node => node.props.label === 'Nachricht senden').props.disabled, true);
  busy.requireNode('Action', node => node.props.label === 'Laufende Antwort abbrechen').props.onPress();
  assert.equal(busy.calls.cancel, 1);
  assert.equal(busy.calls.send, 0);
});

test('conversation controls select, create and delete through their supplied callbacks', () => {
  const second = conversation('chat-two', 'Second chat', 'Second draft');
  const f = fixture({ conversations: [conversation('chat-one', 'Saved chat', ''), second] });
  const secondChoice = f.requireNode('Pressable', node => node.props.accessibilityLabel === 'Second chat, auswählen');
  secondChoice.props.onPress();
  assert.deepEqual(f.calls.select, ['chat-two']);
  f.requireNode('Action', node => node.props.label === 'Neue Unterhaltung erstellen').props.onPress();
  f.requireNode('Action', node => node.props.label === 'Ausgewählte Unterhaltung löschen').props.onPress();
  assert.equal(f.calls.create, 1);
  assert.deepEqual(f.calls.remove, ['chat-one']);
});

test('transcript shows German clarification, partial and interrupted states as plain text', () => {
  const unsafeText = '<script>globalThis.__chatHtmlRan = true</script><b>plain answer text</b>';
  const messages = [
    message('clarify', 'needs-clarification', 'Which aircraft?', { version: 1, text: 'Please clarify.', evidence: [], actions: [], metrics: [] }),
    message('partial', 'partial', 'Summarize the season.', { version: 1, text: 'Partial result.', evidence: [], actions: [], metrics: [] }),
    message('interrupted', 'interrupted', 'Another question.', { version: 1, text: unsafeText, evidence: [], actions: [], metrics: [] }),
  ];
  const f = fixture({ conversations: [conversation('chat-one', 'Saved chat', '', messages)] });
  const transcript = f.text();
  assert.ok(transcript.includes('Rückfrage erforderlich'));
  assert.ok(transcript.includes('Teilweise beantwortet'));
  assert.ok(transcript.includes('Unterbrochen'));
  assert.ok(transcript.includes(unsafeText));
  assert.equal(f.context.__chatHtmlRan, undefined);
  assert.equal(f.nodes.some(node => ['WebView', 'Html', 'HTML', 'Markdown', 'RichText'].includes(node.type)), false);
});

test('evidence and action buttons use only IDs supplied by the saved message', () => {
  const savedMessage = message('with-evidence', 'complete', 'Show that flight.', {
    version: 1,
    text: 'Saved evidence is available.',
    evidence: [{ id: 'saved-reference-7' }],
    actions: [
      { kind: 'open-flight', referenceIds: ['saved-reference-7'] },
      { kind: 'show-flights', referenceIds: ['guessed-reference'] },
    ],
    metrics: [],
  });
  const f = fixture({ conversations: [conversation('chat-one', 'Saved chat', '', [savedMessage])] });
  const evidence = f.requireNode('Action', node => node.props.label === 'Belege anzeigen (1)');
  const openFlight = f.requireNode('Action', node => node.props.label === 'Flug öffnen');
  assert.equal(f.find('Action', node => node.props.label === 'Flüge anzeigen').length, 0);
  evidence.props.onPress();
  openFlight.props.onPress();
  const firstEvidenceCall = required(f.calls.evidence[0], 'first evidence callback');
  assert.equal(firstEvidenceCall.message, savedMessage);
  assert.deepEqual(f.calls.evidence.map(call => call.ids), [['saved-reference-7'], ['saved-reference-7']]);
});

test('null usage shows no fabricated balance or cost fields', () => {
  const f = fixture({ usage: null });
  const transcript = f.text();
  assert.equal(f.nodes.some(node => node.type === 'Section' && node.props.title === 'KI-Nutzung'), false);
  assert.equal(transcript.includes('Abgerechnet'), false);
  assert.equal(transcript.includes('Kosten ungeklärt'), false);
  assert.equal(transcript.includes('Noch verfügbar'), false);
});

test('disclosure identifies recipients, monthly EUR limit, unencrypted backup and read-only boundary', () => {
  const f = fixture();
  const transcript = f.text();
  for (const expected of ['Supabase', 'OpenRouter', 'Azure', '1,00 EUR je Kalendermonat', 'KI-Chats und Entwürfe', 'Sicherungen sind unverschlüsselt', 'keine Schreibaktionen im Web, bei Vereinsflieger oder in deinem Flugbuch']) {
    assert.ok(transcript.includes(expected), `missing disclosure: ${expected}`);
  }
});

test('loading and service-unavailable notices do not disable an existing local draft', () => {
  const f = fixture({ loading: true, enabled: false, notice: 'Dienst vorübergehend nicht verfügbar.' });
  const input = f.requireNode('TextInput');
  const send = f.requireNode('Action', node => node.props.label === 'Nachricht senden');
  assert.equal(input.props.value, 'Durable draft');
  assert.equal(input.props.editable, true);
  assert.equal(send.props.disabled, false);
  assert.ok(f.text().includes('Dienst vorübergehend nicht verfügbar.'));
  assert.equal(f.calls.send, 0);
});
