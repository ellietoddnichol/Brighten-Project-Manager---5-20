import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../src/app');

const PAGE_ALIASES = {
  'budget-tab': '@features/projects/pages/budget-tab',
  'co-tab': '@features/projects/pages/co-tab',
  'pos-tab': '@features/projects/pages/pos-tab',
  'billing-tab': '@features/projects/pages/billing-tab',
  'wip-tab': '@features/projects/pages/wip-tab',
  'ar-tab': '@features/projects/pages/ar-tab',
  'project-foreman-bonus-tab': '@features/projects/pages/project-foreman-bonus-tab',
  'schedule-tab': '@features/projects/pages/schedule-tab',
  'issues-tasks-tab': '@features/projects/pages/issues-tasks-tab',
  'certified-payroll-tab': '@features/projects/pages/certified-payroll-tab',
  'tasks-tab': '@features/projects/pages/tasks-tab',
  'changes-tab': '@features/projects/pages/changes-tab',
  'rfis-tab': '@features/projects/pages/rfis-tab',
  'submittals-tab': '@features/projects/pages/submittals-tab',
  'daily-logs-tab': '@features/projects/pages/daily-logs-tab',
  'field-issues-tab': '@features/projects/pages/field-issues-tab',
  'documents-tab': '@features/documents/pages/documents-tab',
  'drive-mapping-tab': '@features/documents/pages/drive-mapping-tab',
};

const REPLACEMENTS = [
  [/from ['"](?:\.\.\/)+pages\/([^'"]+)['"]/g, (_, file) => {
    const alias = PAGE_ALIASES[file.replace(/\.ts$/, '')];
    return alias ? `from '${alias}'` : `from '@app/pages/${file}'`;
  }],
  ["from './project-financial.service'", "from '@features/projects/services/project-financial.service'"],
  ["from './foreman-bonus.service'", "from '@features/labor/services/foreman-bonus.service'"],
  ["from './certified-payroll-data.service'", "from '@features/labor/services/certified-payroll-data.service'"],
  ["from './project-financial.compute'", "from '@features/projects/utils/project-financial.compute'"],
  ["from './foreman-bonus.compute'", "from '@features/labor/utils/foreman-bonus.compute'"],
  ["from './certified-payroll-week'", "from '@features/labor/utils/certified-payroll-week'"],
  ["from './certified-payroll-week.spec'", "from '@features/labor/utils/certified-payroll-week.spec'"],
];

function walkTs(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, fn);
    else if (ent.name.endsWith('.ts')) fn(p);
  }
}

let n = 0;
walkTs(APP, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const orig = content;
  for (const entry of REPLACEMENTS) {
    if (Array.isArray(entry) && entry[0] instanceof RegExp) {
      content = content.replace(entry[0], entry[1]);
    } else {
      content = content.split(entry[0]).join(entry[1]);
    }
  }
  if (content !== orig) {
    fs.writeFileSync(filePath, content);
    n++;
  }
});
console.log(`Cross-import fixes: ${n} files`);
