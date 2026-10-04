import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const result = await build({
  entryPoints: [new URL('../assets/ts/graph-query.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2020',
});
const bundledSource = `${result.outputFiles[0].text}\n//# sourceURL=graph-query.test-module.mjs`;
const { compileQuery } = await import(`data:text/javascript;base64,${Buffer.from(bundledSource).toString('base64')}`);
const note = {
  title: '公开笔记', file: 'Daily Plan.md', path: 'notes/Work notes/Daily Plan.md',
  tags: ['project/daybook', '工作/计划'],
  text: 'Alpha one\nBeta two\n共享 内容\nGamma three',
  lines: ['Alpha one', 'Beta two', '共享 内容', 'Gamma three'],
  sections: ['Alpha one\nBeta two', '共享 内容\nGamma three'],
  properties: { Status: 'Published', count: 3, featured: false, empty: null, authors: ['Ada', '李华'], 'due date': '2026-10-04' },
};
const matches = input => compileQuery(input).matches(note);

test('plain terms, Chinese, phrases and escaped quotes search only published text or names', () => {
  assert.equal(matches(''), true);
  assert.equal(matches('   '), true);
  for (const query of ['alpha', 'ALPHA', '公开', '共享 内容', '"Daily Plan"', '"alpha one"', 'plan.md']) assert.equal(matches(query), true, query);
  for (const query of ['"alpha beta"', 'Work notes', 'Published', '不存在']) assert.equal(matches(query), false, query);
  assert.equal(compileQuery('"say \\"hi\\""').matches({ text: 'Say "hi"' }), true);
  assert.equal(compileQuery('"/literal/"').matches({ text: '/literal/' }), true);
});

test('AND, OR, exclusion and grouping have deterministic precedence', () => {
  assert.equal(matches('alpha beta'), true);
  assert.equal(matches('alpha missing OR gamma'), true);
  assert.equal(matches('alpha (missing OR gamma)'), true);
  assert.equal(matches('(alpha missing) OR (gamma -missing)'), true);
  assert.equal(matches('alpha -(beta OR gamma)'), false);
  assert.equal(matches('-missing -unknown'), true);
  assert.equal(matches('--alpha'), true);
  assert.equal(matches('alpha OR missing gamma'), true);
  assert.equal(matches('missing OR gamma missing'), false);
});

test('path and filename fields support spaces, extensions, groups and metadata-only loading', () => {
  for (const query of ['path:"Work notes"', 'file:.md', 'file:(daily plan)', 'file:daily -path:private', 'path:notes OR tag:other']) {
    assert.equal(matches(query), true, query);
    assert.equal(compileQuery(query).needsIndex, false, query);
  }
  assert.equal(matches('file:work'), false);
  assert.equal(matches('path:"/home/"'), false);
  assert.equal(compileQuery('').needsIndex, false);
  for (const query of ['alpha', 'path:notes alpha', 'file:daily OR alpha', 'line:alpha', 'section:alpha', '[status]', 'file:(daily OR line:alpha)']) {
    assert.equal(compileQuery(query).needsIndex, true, query);
  }
});

test('tags include descendants, ignore a leading hash, and do not match partial segments', () => {
  for (const query of ['tag:project', 'tag:PROJECT/daybook', 'tag:#project', 'tag:工作', 'tag:(project OR missing)', 'tag:project -tag:private']) assert.equal(matches(query), true, query);
  for (const query of ['tag:proj', 'tag:daybook', 'tag:project/day', 'tag:projects']) assert.equal(matches(query), false, query);
});

test('line and section groups keep AND inside a single line or section', () => {
  assert.equal(matches('line:(alpha one)'), true);
  assert.equal(matches('line:(alpha beta)'), false);
  assert.equal(matches('line:(alpha OR beta)'), true);
  assert.equal(matches('line:(alpha -beta)'), true);
  assert.equal(matches('line:(共享 内容)'), true);
  assert.equal(matches('section:(alpha beta)'), true);
  assert.equal(matches('section:(alpha gamma)'), false);
  assert.equal(matches('section:(gamma 共享)'), true);
  assert.equal(compileQuery('line:alpha').matches({ title: 'alpha' }), false);
});

test('public properties match existence, scalar values, lists and quoted names', () => {
  for (const query of ['[status]', '[STATUS:published]', '[count:3]', '[featured:false]', '[empty]', '[authors:ada]', '[authors:李华]', '[due date:2026]', '["due date":"2026-10-04"]', '[status] -[secret]']) assert.equal(matches(query), true, query);
  for (const query of ['[secret]', '[empty:null]', '[authors:Bob]', '[status:draft]']) assert.equal(matches(query), false, query);
  assert.equal(compileQuery('[__proto__]').matches({ properties: {} }), false);
});

test('invalid and unsupported syntax fails explicitly instead of silently changing the filter', () => {
  for (const query of ['(', ')', '()', 'foo OR', 'OR foo', '-', 'file:', 'task:done', 'block:abc', 'unknown:foo', '"open', '[open', '[]', '[status:]', '[:value]', '[foo[bar]]', 'foo:', '/alpha/', '[count:>2]', '[count:<=3]', '>3', '""']) {
    assert.throws(() => compileQuery(query), Error, query);
  }
  assert.throws(() => compileQuery('('.repeat(100) + 'foo' + ')'.repeat(100)), /嵌套/);
  assert.throws(() => compileQuery('-'.repeat(100) + 'foo'), /嵌套/);
  assert.throws(() => compileQuery('x'.repeat(16_385)), /过长/);
});

test('missing optional fields and separately evaluated documents do not leak matches', () => {
  const query = compileQuery('alpha');
  assert.equal(query.matches(note), true);
  assert.equal(query.matches({}), false);
  assert.equal(query.matches({ lines: ['alpha'] }), true);
  assert.equal(compileQuery('file:reference').matches({ title: 'Reference' }), true);
  assert.equal(compileQuery('-tag:private').matches({}), true);
});
