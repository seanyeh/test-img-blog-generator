#!/usr/bin/env node

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const BRANCH = process.env.BRANCH || 'main';
const MAX_POSTS = parseInt(process.env.MAX_POSTS || '50', 10);
const OUTPUT_DIR = 'dist';

// Get commits
async function getCommits() {
  try {
    const git = simpleGit();
    const log = await git.log({
      maxCount: MAX_POSTS,
      [BRANCH]: null,
    });

    console.log(`Raw commits found: ${log.all.length}`);
    log.all.forEach((commit, index) => {
      console.log(`\nCommit ${index + 1}:`);
      console.log(`  Hash: ${commit.hash.substring(0, 7)}`);
      console.log(`  Author: ${commit.author_name}`);
      console.log(`  Date: ${commit.date}`);
      console.log(`  Message: ${commit.message.substring(0, 60)}${commit.message.length > 60 ? '...' : ''}`);
    });

    // Filter out commits that start with [ignore]
    const filteredCommits = log.all.filter((commit) => {
      const title = commit.message.split('\n')[0];
      return !title.toLowerCase().startsWith('[ignore]');
    });

    console.log(`Commits after filtering [ignore]: ${filteredCommits.length}`);

    // Get images for each commit
    const commitsWithImages = await Promise.all(
      filteredCommits.map(async (commit) => {
        const images = await getCommitImages(git, commit.hash);
        return {
          hash: commit.hash.substring(0, 7),
          author: commit.author_name,
          email: commit.author_email,
          date: new Date(commit.date).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
          title: commit.message.split('\n')[0],
          content: commit.body || commit.message.split('\n')[0],
          images: images,
        };
      })
    );

    return commitsWithImages;
  } catch (error) {
    console.error('Error fetching commits:', error.message);
    process.exit(1);
  }
}

// Get image files from a commit
async function getCommitImages(git, commitHash) {
  try {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
    const diffSummary = await git.diffSummary([`${commitHash}^`, commitHash]);

    const images = diffSummary.files
      .filter((file) => {
        const ext = path.extname(file.file).toLowerCase();
        return imageExtensions.includes(ext);
      })
      .map((file) => file.file);

    return images;
  } catch (error) {
    // Handle case where commit has no parent (initial commit)
    console.log(`Could not get diff for ${commitHash.substring(0, 7)}: ${error.message}`);
    return [];
  }
}

// Generate HTML
function generateHTML(commits) {
  const postsHTML = commits
    .map(
      (commit) => `
    <article class="post">
      <header>
        <h2>${escapeHTML(commit.title)}</h2>
        <div class="meta">
          <span class="author">${escapeHTML(commit.author)}</span>
          <span class="date">${commit.date}</span>
          <span class="commit">#${commit.hash}</span>
        </div>
      </header>
      <div class="content">
        ${processContent(commit.content)}
      </div>
      ${commit.images && commit.images.length > 0 ? `
      <div class="image-grid">
        ${commit.images.map((image) => `
        <div class="image-item">
          <a href="${escapeHTML(image)}" target="_blank">
            <img src="${escapeHTML(image)}" alt="Image from commit" loading="lazy" />
          </a>
        </div>
        `).join('')}
      </div>
      ` : ''}
    </article>
  `
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commit Blog</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      border-radius: 8px;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      color: #2c3e50;
    }

    .subtitle {
      color: #7f8c8d;
      margin-bottom: 40px;
      font-size: 1.1rem;
    }

    .post {
      margin-bottom: 50px;
      padding-bottom: 40px;
      border-bottom: 1px solid #ecf0f1;
    }

    .post:last-child {
      border-bottom: none;
    }

    .post h2 {
      font-size: 1.8rem;
      margin-bottom: 15px;
      color: #34495e;
    }

    .meta {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      font-size: 0.9rem;
      color: #7f8c8d;
      flex-wrap: wrap;
    }

    .meta span {
      display: flex;
      align-items: center;
    }

    .author::before {
      content: '👤 ';
      margin-right: 5px;
    }

    .date::before {
      content: '📅 ';
      margin-right: 5px;
    }

    .commit {
      font-family: 'Courier New', monospace;
      background: #ecf0f1;
      padding: 2px 8px;
      border-radius: 3px;
    }

    .content {
      font-size: 1.05rem;
      color: #555;
    }

    .content p {
      margin-bottom: 15px;
    }

    .content p:empty {
      display: none;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      margin-top: 20px;
    }

    .image-item {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .image-item a {
      display: block;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }

    .image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }

    .image-item:hover img {
      transform: scale(1.05);
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 2px solid #ecf0f1;
      text-align: center;
      color: #95a5a6;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      body {
        padding: 10px;
      }

      .container {
        padding: 20px;
      }

      h1 {
        font-size: 2rem;
      }

      .post h2 {
        font-size: 1.5rem;
      }

      .image-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Commit Blog</h1>
      <p class="subtitle">A blog generated from git commits</p>
    </header>

    <main>
      ${postsHTML}
    </main>

    <footer>
      <p>Generated from ${commits.length} commit${commits.length !== 1 ? 's' : ''}</p>
    </footer>
  </div>
</body>
</html>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Process content text: single newlines are ignored, double+ newlines become paragraph breaks
function processContent(content) {
  if (!content) return '';

  // Split by double or more newlines to get paragraphs
  const paragraphs = content.split(/\n\n+/);

  return paragraphs
    .map((para) => {
      // Within each paragraph, replace single newlines with spaces
      const text = para.replace(/\n/g, ' ').trim();
      return text ? `<p>${escapeHTML(text)}</p>` : '';
    })
    .filter((p) => p !== '')
    .join('');
}

// Copy images to output directory
function copyImagesToOutput(commits) {
  let totalImagesCopied = 0;

  commits.forEach((commit) => {
    if (commit.images && commit.images.length > 0) {
      commit.images.forEach((imagePath) => {
        const sourcePath = path.resolve(imagePath);
        const destPath = path.join(OUTPUT_DIR, imagePath);

        // Create directory structure if needed
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy image file if it exists
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          totalImagesCopied++;
        } else {
          console.log(`Warning: Image not found: ${imagePath}`);
        }
      });
    }
  });

  return totalImagesCopied;
}

// Main
async function main() {
  console.log('Generating blog from commits...');

  const commits = await getCommits();
  console.log(`Found ${commits.length} commits`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy images to output directory
  const imagesCopied = copyImagesToOutput(commits);
  if (imagesCopied > 0) {
    console.log(`✓ Copied ${imagesCopied} image${imagesCopied !== 1 ? 's' : ''} to ${OUTPUT_DIR}`);
  }

  const html = generateHTML(commits);
  const outputPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✓ Blog generated at ${outputPath}`);
  console.log(`✓ Total posts: ${commits.length}`);
}

main();
