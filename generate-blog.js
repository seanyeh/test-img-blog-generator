#!/usr/bin/env node

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const exifParser = require('exif-parser');
const ejs = require('ejs');

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

// Generate HTML using EJS template
function generateHTML(images) {
  const uniqueCommits = new Set(images.map(img => img.hash)).size;
  const templatePath = path.join(__dirname, 'template.ejs');
  return ejs.render(fs.readFileSync(templatePath, 'utf-8'), {
    images,
    uniqueCommits
  });
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
