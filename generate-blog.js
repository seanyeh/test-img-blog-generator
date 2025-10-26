#!/usr/bin/env node

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

const BRANCH = process.env.BRANCH || 'main';
const MAX_POSTS = parseInt(process.env.MAX_POSTS || '50', 10);
const OUTPUT_DIR = 'dist';

// Get all images from commits with metadata
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

    // Collect all images with their commit metadata
    const allImages = [];
    for (const commit of filteredCommits) {
      const images = await getCommitImages(git, commit.hash);
      images.forEach((imagePath) => {
        allImages.push({
          path: imagePath,
          hash: commit.hash.substring(0, 7),
          title: commit.message.split('\n')[0],
          // Unused for now, but kept for potential future use
          author: commit.author_name,
          date: new Date(commit.date).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
          content: commit.body || commit.message.split('\n')[0],
        });
      });
    }

    return allImages;
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
function generateHTML(images) {
  const gridHTML = images.length > 0 ? `
    <div class="image-grid">
      ${images.map((image) => `
      <div class="image-item">
        <a href="${escapeHTML(image.path)}" target="_blank">
          <img src="${escapeHTML(image.path)}" alt="${escapeHTML(image.title)}" loading="lazy" />
          <div class="image-overlay">
            <div class="overlay-content">
              <span class="commit-hash">#${image.hash}</span>
              <span class="commit-title">${escapeHTML(image.title)}</span>
            </div>
          </div>
        </a>
      </div>
      `).join('')}
    </div>
  ` : '<p>No images found in commits.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Gallery</title>
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
      background: #fafafa;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 40px;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      color: #262626;
      font-weight: 400;
    }

    .subtitle {
      color: #8e8e8e;
      font-size: 1rem;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 28px;
    }

    .image-item {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      background: #fff;
      border: 1px solid #dbdbdb;
      border-radius: 3px;
      cursor: pointer;
    }

    .image-item a {
      display: block;
      width: 100%;
      height: 100%;
      text-decoration: none;
    }

    .image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.2s ease;
    }

    .image-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .image-item:hover .image-overlay {
      opacity: 1;
    }

    .overlay-content {
      color: white;
      text-align: center;
      padding: 20px;
    }

    .commit-hash {
      display: block;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      margin-bottom: 8px;
      opacity: 0.9;
    }

    .commit-title {
      display: block;
      font-size: 0.95rem;
      font-weight: 500;
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #dbdbdb;
      text-align: center;
      color: #8e8e8e;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      body {
        padding: 10px;
      }

      h1 {
        font-size: 2rem;
      }

      .image-grid {
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 3px;
      }

      .image-item {
        border: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Image Gallery</h1>
      <p class="subtitle">Generated from git commits</p>
    </header>

    <main>
      ${gridHTML}
    </main>

    <footer>
      <p>${images.length} image${images.length !== 1 ? 's' : ''} from commit history</p>
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

// Copy images to output directory
function copyImagesToOutput(images) {
  let totalImagesCopied = 0;

  images.forEach((image) => {
    const sourcePath = path.resolve(image.path);
    const destPath = path.join(OUTPUT_DIR, image.path);

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
      console.log(`Warning: Image not found: ${image.path}`);
    }
  });

  return totalImagesCopied;
}

// Main
async function main() {
  console.log('Generating image gallery from commits...');

  const images = await getCommits();
  console.log(`Found ${images.length} image${images.length !== 1 ? 's' : ''}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Copy images to output directory
  const imagesCopied = copyImagesToOutput(images);
  if (imagesCopied > 0) {
    console.log(`✓ Copied ${imagesCopied} image${imagesCopied !== 1 ? 's' : ''} to ${OUTPUT_DIR}`);
  }

  const html = generateHTML(images);
  const outputPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✓ Gallery generated at ${outputPath}`);
  console.log(`✓ Total images: ${images.length}`);
}

main();
