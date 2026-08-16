/**
 * Link Updater Script
 * Updates internal links to reflect new documentation hierarchy.
 */

const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.md')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const allMdFiles = getAllFiles(docsDir);
const readmePath = path.join(__dirname, '..', 'README.md');
if (fs.existsSync(readmePath)) allMdFiles.push(readmePath);

const linkReplacements = [
  // Old root paths to new paths
  { regex: /\[([^\]]+)\]\(\.\/PROJECT_CONTEXT\.md\)/g, replacement: '[$1](./architecture/PROJECT_CONTEXT.md)' },
  { regex: /\[([^\]]+)\]\(\.\.\/PROJECT_CONTEXT\.md\)/g, replacement: '[$1](../architecture/PROJECT_CONTEXT.md)' },
  { regex: /\[([^\]]+)\]\(\.\.\/ARCHITECTURE_AUDIT\.md\)/g, replacement: '[$1](../audits/ARCHITECTURE_AUDIT.md)' },
  { regex: /\[([^\]]+)\]\(\.\/ARCHITECTURE_AUDIT\.md\)/g, replacement: '[$1](./audits/ARCHITECTURE_AUDIT.md)' },
  { regex: /\[([^\]]+)\]\(\.\/AUTHENTICATION_DESIGN\.md\)/g, replacement: '[$1](./architecture/AUTHENTICATION_DESIGN.md)' },
  { regex: /\[([^\]]+)\]\(\.\/FILE_UPLOAD_DESIGN\.md\)/g, replacement: '[$1](./architecture/FILE_UPLOAD_DESIGN.md)' },
  { regex: /\[([^\]]+)\]\(\.\/RESUME_PARSER_DESIGN\.md\)/g, replacement: '[$1](./architecture/RESUME_PARSER_DESIGN.md)' },
  { regex: /\[([^\]]+)\]\(\.\/AUTHENTICATION_AUDIT_REPORT\.md\)/g, replacement: '[$1](./audits/AUTHENTICATION_AUDIT_REPORT.md)' },
  { regex: /\[([^\]]+)\]\(\.\/PARSER_CODE_AUDIT\.md\)/g, replacement: '[$1](./audits/PARSER_CODE_AUDIT.md)' },
  { regex: /\[([^\]]+)\]\(\.\/GETTING_STARTED\.md\)/g, replacement: '[$1](./deployment/GETTING_STARTED.md)' },
  { regex: /\[([^\]]+)\]\(\.\/AUTHENTICATION_TEST_PLAN\.md\)/g, replacement: '[$1](./testing/AUTHENTICATION_TEST_PLAN.md)' },
  { regex: /\[([^\]]+)\]\(\.\/RESUME_PARSER_TEST_PLAN\.md\)/g, replacement: '[$1](./testing/RESUME_PARSER_TEST_PLAN.md)' },
  { regex: /backend\/docs\//g, replacement: 'docs/' },
];

let updatedCount = 0;
for (const filePath of allMdFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (const { regex, replacement } of linkReplacements) {
    content = content.replace(regex, replacement);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated links in: ${path.relative(path.join(__dirname, '..'), filePath)}`);
    updatedCount++;
  }
}

console.log(`Finished link update. Modified ${updatedCount} files.`);
