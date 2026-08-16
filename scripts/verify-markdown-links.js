/**
 * Link Validator Script
 * Verifies all markdown links in docs/ and README.md resolve to existing files.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');

function getAllMdFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllMdFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.md')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const allMdFiles = getAllMdFiles(docsDir);
const readmePath = path.join(rootDir, 'README.md');
if (fs.existsSync(readmePath)) allMdFiles.push(readmePath);

let totalLinksChecked = 0;
let brokenLinks = [];

for (const filePath of allMdFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const dirOfFile = path.dirname(filePath);

  // Match Markdown links [text](path)
  const linkRegex = /\[([^\]]+)\]\(([^)#]+)(#[^)]+)?\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const linkTarget = match[2].trim();

    // Skip external http/https, mailto, or conversation/file custom schemes
    if (
      linkTarget.startsWith('http://') ||
      linkTarget.startsWith('https://') ||
      linkTarget.startsWith('mailto:') ||
      linkTarget.startsWith('file://') ||
      linkTarget.startsWith('conversation://')
    ) {
      continue;
    }

    totalLinksChecked++;
    const resolvedPath = path.resolve(dirOfFile, linkTarget);

    if (!fs.existsSync(resolvedPath)) {
      brokenLinks.push({
        sourceFile: path.relative(rootDir, filePath),
        linkText: match[1],
        target: linkTarget,
        resolved: path.relative(rootDir, resolvedPath),
      });
    }
  }
}

console.log(`Total local markdown links verified: ${totalLinksChecked}`);
if (brokenLinks.length > 0) {
  console.error(`Found ${brokenLinks.length} broken links:`);
  brokenLinks.forEach((b) => {
    console.error(`- In ${b.sourceFile}: [${b.linkText}](${b.target}) -> Resolved: ${b.resolved}`);
  });
  process.exit(1);
} else {
  console.log('All local markdown links are valid!');
}
