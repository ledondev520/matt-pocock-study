import { validDate } from './common.mjs';

const metric = { type: 'integer', minimum: 0 };
const postMetrics = Object.fromEntries(['likes', 'reposts', 'replies', 'quotes', 'bookmarks', 'impressions'].map((key) => [key, metric]));
const metricsFor = (properties) => ({ type: 'object', properties, additionalProperties: false });

export const INDEX_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Public study corpus index (metadata and original summaries only)',
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    required: ['id', 'type', 'url', 'date', 'tags', 'metrics', 'summary'],
    properties: {
      id: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['post', 'article', 'repo', 'web'] },
      url: { type: 'string', format: 'uri', pattern: '^https?://' },
      date: { type: 'string', format: 'date-time' },
      tags: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
      metrics: metricsFor({ ...postMetrics, stars: metric }),
      summary: {
        type: 'object', additionalProperties: false, required: ['zh', 'en'],
        properties: {
          zh: { type: 'string', maxLength: 40, pattern: '^[^\\r\\n"“”„‟«»「」『』]*$' },
          en: { type: 'string', allOf: [
            { pattern: '^[^\\r\\n"“”„‟«»「」『』]*$' },
            { pattern: '^\\s*(?:\\S+(?:\\s+\\S+){0,24})?\\s*$' },
          ] },
        },
      },
    },
    allOf: [
      { if: { properties: { type: { enum: ['post', 'article'] } } }, then: { properties: { metrics: metricsFor(postMetrics) } } },
      { if: { properties: { type: { const: 'repo' } } }, then: { properties: { metrics: metricsFor({ stars: metric }) } } },
      { if: { properties: { type: { const: 'web' } } }, then: { properties: { metrics: metricsFor({}) } } },
    ],
  },
};

// Deliberately implements only the keywords used by INDEX_SCHEMA. Unknown
// keywords fail instead of silently weakening a future schema change.
const KEYWORDS = new Set(['$schema', 'title', 'type', 'items', 'required', 'properties', 'additionalProperties',
  'enum', 'const', 'format', 'pattern', 'minLength', 'maxLength', 'uniqueItems', 'minimum', 'allOf', 'if', 'then']);

export function validateSchema(value, schema = INDEX_SCHEMA, path = '$') {
  const errors = [];
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
  const fail = (message) => errors.push(`${path}: ${message}`);
  if (schema.type) {
    const matches = schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : schema.type === 'integer' ? Number.isSafeInteger(value) : typeof value === schema.type;
    if (!matches) { fail(`expected ${schema.type}`); return errors; }
  }
  if (schema.enum && !schema.enum.includes(value)) fail('value is not in enum');
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail('value differs from const');
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail('string is too short');
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail('string is too long');
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail('string does not match pattern');
    if (schema.format === 'date-time' && (!validDate(value) || !value.includes('T'))) fail('invalid ISO date-time');
    if (schema.format === 'uri') {
      try { const url = new URL(value); if (!/^https?:$/.test(url.protocol) || url.username || url.password) fail('expected a public HTTP(S) URL'); }
      catch { fail('invalid URL'); }
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) fail('number is below minimum');
  if (Array.isArray(value)) {
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) fail('duplicate array items');
    if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)));
  } else if (value && typeof value === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties, key)) errors.push(...validateSchema(child, schema.properties[key], `${path}.${key}`));
      else if (schema.additionalProperties === false) fail(`unexpected property ${key}`);
    }
  }
  for (const child of schema.allOf || []) errors.push(...validateSchema(value, child, path));
  if (schema.if && validateSchema(value, schema.if, path).length === 0 && schema.then) errors.push(...validateSchema(value, schema.then, path));
  return errors;
}

export function validateIndex(index, schema = INDEX_SCHEMA) {
  const errors = validateSchema(index, schema);
  if (Array.isArray(index)) {
    const ids = new Set();
    for (const record of index) {
      if (record && ids.has(record.id)) errors.push('duplicate record id');
      if (record) ids.add(record.id);
    }
  }
  if (errors.length) throw new Error(`Invalid corpus index:\n${errors.join('\n')}`);
  return index;
}
