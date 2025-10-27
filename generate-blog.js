#!/usr/bin/env node

const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const exifParser = require('exif-parser');
const ejs = require('ejs');
const esbuild = require('esbuild');
const sizeOf = require('image-size');

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

    // Collect commits with their images
    const commitsWithImages = [];
    for (const commit of filteredCommits) {
      const imagePaths = await getCommitImages(git, commit.hash);

      // Only include commits that have images
      if (imagePaths.length === 0) continue;

      const images = imagePaths.map((imagePath) => {
        const dimensions = getImageDimensions(imagePath);
        return {
          path: imagePath,
          caption: getImageCaption(imagePath),
          width: dimensions.width,
          height: dimensions.height,
        };
      });

      commitsWithImages.push({
        hash: commit.hash.substring(0, 7),
        title: commit.message.split('\n')[0],
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
        images: images,
      });
    }

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

// Get image dimensions
function getImageDimensions(imagePath) {
  try {
    const resolvedPath = path.resolve(imagePath);
    if (!fs.existsSync(resolvedPath)) {
      return { width: 800, height: 800 }; // default square
    }

    const dimensions = sizeOf(resolvedPath);
    return {
      width: dimensions.width,
      height: dimensions.height
    };
  } catch (error) {
    // If we can't read dimensions, return default square
    return { width: 800, height: 800 };
  }
}

// Load config.json if it exists
function loadConfig() {
  console.log("loadConfig");
  const configPath = path.join(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log('✓ Loaded config.json');
      return configData;
    } catch (error) {
      console.log(`Warning: Could not parse config.json: ${error.message}`);
      return null;
    }
  }
  return null;
}

// Generate HTML using EJS template
function generateHTML(commits, data) {
  const templatePath = path.join(__dirname, 'template.ejs');

  // Prepare template data
  const templateData = {
    commits,
    data: data || {}
  };

  // Validate avatar path if provided
  if (data && data.avatar) {
    const avatarPath = path.resolve(data.avatar);
    if (!fs.existsSync(avatarPath)) {
      console.log(`Warning: Avatar file not found: ${data.avatar}`);
      templateData.data.avatar = null;
    }
  }

  // Store prefixes if they exist and are an array
  if (data && Array.isArray(data.prefixes)) {
    templateData.prefixes = data.prefixes;
    console.log(`✓ Loaded ${data.prefixes.length} prefix(es) from config`);
  }

  return ejs.render(fs.readFileSync(templatePath, 'utf-8'), templateData);
}

// Copy images to output directory
function copyImagesToOutput(commits) {
  let totalImagesCopied = 0;

  commits.forEach((commit) => {
    commit.images.forEach((image) => {
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
  });

  return totalImagesCopied;
}

// Build gallery JS with esbuild
async function buildGalleryJS() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/gallery.js')],
      bundle: true,
      minify: true,
      outfile: path.join(OUTPUT_DIR, 'gallery.js'),
      format: 'iife',
      loader: { '.css': 'css' },
      logLevel: 'info'
    });
  } catch (error) {
    console.error('Error building gallery.js:', error);
    process.exit(1);
  }
}

// Main
async function main() {
  console.log('Generating image gallery from commits...');

  // Load config if it exists
  const data = loadConfig();

  const commits = await getCommits();
  const totalImages = commits.reduce((sum, commit) => sum + commit.images.length, 0);
  console.log(`Found ${commits.length} commit${commits.length !== 1 ? 's' : ''} with ${totalImages} image${totalImages !== 1 ? 's' : ''}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Build gallery JS with esbuild
  await buildGalleryJS();
  console.log('✓ Built gallery.js');

  // Copy images to output directory
  const imagesCopied = copyImagesToOutput(commits);
  if (imagesCopied > 0) {
    console.log(`✓ Copied ${imagesCopied} image${imagesCopied !== 1 ? 's' : ''} to ${OUTPUT_DIR}`);
  }

  // Copy avatar to output directory if it exists
  if (data && data.avatar) {
    const avatarPath = path.resolve(data.avatar);
    if (fs.existsSync(avatarPath)) {
      const destPath = path.join(OUTPUT_DIR, data.avatar);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(avatarPath, destPath);
      console.log(`✓ Copied avatar to ${OUTPUT_DIR}`);
    }
  }

  const html = generateHTML(commits, data);
  const outputPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`✓ Gallery generated at ${outputPath}`);
  console.log(`✓ Total: ${commits.length} commit${commits.length !== 1 ? 's' : ''}, ${totalImages} image${totalImages !== 1 ? 's' : ''}`);
}

main();
