#!/usr/bin/env node

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const exifParser = require('exif-parser');

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
          caption: getImageCaption(imagePath),
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

// Extract EXIF ImageDescription from an image file
function getImageCaption(imagePath) {
  try {
    const resolvedPath = path.resolve(imagePath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const buffer = fs.readFileSync(resolvedPath);
    const parser = exifParser.create(buffer);
    const result = parser.parse();

    return result.tags?.ImageDescription || null;
  } catch (error) {
    // EXIF parsing failed (not a JPEG, no EXIF data, etc.)
    return null;
  }
}

// Generate HTML
function generateHTML(images) {
  // Count unique commits
  const uniqueCommits = new Set(images.map(img => img.hash)).size;

  const gridHTML = images.length > 0 ? `
    <div class="image-grid">
      ${images.map((image) => `
      <div class="image-item">
        <a href="${escapeHTML(image.path)}" target="_blank">
          <img src="${escapeHTML(image.path)}" alt="${escapeHTML(image.title)}" loading="lazy" />
          <div class="image-overlay">
            <div class="overlay-content">
              ${image.caption ? `<span class="image-caption">${escapeHTML(image.caption)}</span>` : ''}
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
      color: #fafafa;
      background: #000;
      padding: 0;
    }

    .container {
      max-width: 935px;
      margin: 0 auto;
    }

    header {
      padding: 30px 20px;
      border-bottom: 1px solid #262626;
      margin-bottom: 28px;
    }

    .profile-header {
      display: flex;
      align-items: center;
      gap: 80px;
      max-width: 935px;
      margin: 0 auto;
    }

    .profile-pic {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: #262626;
      flex-shrink: 0;
    }

    .profile-info {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .profile-username {
      font-size: 28px;
      font-weight: 300;
      color: #fafafa;
    }

    .profile-stats {
      display: flex;
      gap: 40px;
      font-size: 16px;
    }

    .profile-stats span {
      color: #fafafa;
    }

    .profile-stats strong {
      font-weight: 600;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
    }

    .image-item {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      background: #000;
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
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .image-caption {
      display: block;
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .commit-hash {
      display: block;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      opacity: 0.9;
    }

    .commit-title {
      display: block;
      font-size: 0.95rem;
      font-weight: 500;
    }

    footer {
      margin-top: 60px;
      padding: 20px;
      border-top: 1px solid #262626;
      text-align: center;
      color: #737373;
      font-size: 0.85rem;
    }

    @media (max-width: 768px) {
      .profile-header {
        gap: 28px;
        padding: 0 16px;
      }

      .profile-pic {
        width: 77px;
        height: 77px;
      }

      .profile-username {
        font-size: 24px;
      }

      .profile-stats {
        gap: 20px;
        font-size: 14px;
      }

      header {
        padding: 16px 0;
        margin-bottom: 12px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="profile-header">
      <div class="profile-pic"></div>
      <div class="profile-info">
        <div class="profile-username">username</div>
        <div class="profile-stats">
          <span><strong>${uniqueCommits}</strong> posts</span>
        </div>
      </div>
    </div>
  </header>

  <div class="container">
    <main>
      ${gridHTML}
    </main>

    <footer>
      <p>${images.length} image${images.length !== 1 ? 's' : ''} from ${uniqueCommits} commit${uniqueCommits !== 1 ? 's' : ''}</p>
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
