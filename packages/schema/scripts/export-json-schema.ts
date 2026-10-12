/**
 * Writes JSON Schema for the documents the Flutter app reads/writes, plus JSON
 * templates with all defaults applied, so Dart never duplicates default values.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CustomCode,
  Goals,
  ContactForm,
  PortfolioContent,
  ProjectDoc,
  UsageDoc,
  UserDoc,
} from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../generated');
mkdirSync(outDir, { recursive: true });

const roots = z.object({ projectDoc: ProjectDoc, userDoc: UserDoc, usageDoc: UsageDoc });
const schema = {
  title: 'PortfolioBuilderModels',
  ...z.toJSONSchema(roots, { io: 'output', unrepresentable: 'any', target: 'draft-7' }),
};
writeFileSync(resolve(outDir, 'models.schema.json'), JSON.stringify(schema, null, 2) + '\n');

const templates = {
  content: PortfolioContent.parse({}),
  goals: Goals.parse({}),
  custom: CustomCode.parse({}),
  contactForm: ContactForm.parse({}),
};
writeFileSync(resolve(outDir, 'templates.json'), JSON.stringify(templates, null, 2) + '\n');
console.log('wrote', outDir);
