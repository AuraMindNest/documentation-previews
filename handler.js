const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Get event payload from environment or stdin
const eventPayload = process.env.GITHUB_EVENT_PAYLOAD 
  ? JSON.parse(process.env.GITHUB_EVENT_PAYLOAD)
  : JSON.parse(process.argv[2] || '{}');

const {
  action,
  repository,
  pull_request,
  organization
} = eventPayload;

// Validate required fields
if (!action || !repository || !pull_request) {
  console.error('Missing required event payload fields');
  process.exit(1);
}

const repoName = repository.name;
const prNumber = pull_request.number;
const commitSha = pull_request.head.sha;
const repoFullName = repository.full_name;
const repoOwner = repository.owner.login;
const previewRepoOwner = config.previewRepository.owner;
const previewRepoName = config.previewRepository.name;
const previewPath = `${repoName}/${prNumber}`;

// Check if repository is monitored
if (!config.monitoredRepositories.includes(repoName)) {
  console.log(`Repository ${repoName} is not in monitored list. Skipping.`);
  process.exit(0);
}

console.log(`Processing PR #${prNumber} from ${repoFullName} (action: ${action})`);

// Route by action
if (action === 'opened' || action === 'synchronize') {
  handlePreviewGeneration();
} else if (action === 'closed' || action === 'merged') {
  handleCleanup();
} else {
  console.log(`Action ${action} not handled. Skipping.`);
  process.exit(0);
}

async function handlePreviewGeneration() {
  try {
    const tempDir = path.join('/tmp', `preview-${Date.now()}`);
    const previewDir = path.join('/tmp', `preview-repo-${Date.now()}`);

    // Step 1: Clone source repository at commit
    console.log(`Cloning ${repoFullName} at commit ${commitSha}...`);
    execSync(`git clone https://github.com/${repoFullName}.git ${tempDir}`, { stdio: 'inherit' });
    process.chdir(tempDir);
    execSync(`git checkout ${commitSha}`, { stdio: 'inherit' });

    // Step 2: Run build script
    console.log('Looking for build script...');
    const buildScripts = [
      'build-docs.sh',
      'generate-docs.sh',
      'build.sh',
      'npm run build-docs',
      'npm run generate-docs',
      'python generate_docs.py',
      './generate.sh'
    ];

    let buildExecuted = false;
    for (const script of buildScripts) {
      if (script.includes('npm run') || script.includes('python')) {
        try {
          console.log(`Trying: ${script}`);
          execSync(script, { stdio: 'inherit' });
          buildExecuted = true;
          break;
        } catch (e) {
          continue;
        }
      } else if (fs.existsSync(script)) {
        console.log(`Executing: ${script}`);
        execSync(`chmod +x ${script} && ./${script}`, { stdio: 'inherit' });
        buildExecuted = true;
        break;
      }
    }

    if (!buildExecuted) {
      console.warn('No build script found. Looking for HTML files in common directories...');
    }

    // Step 3: Find generated HTML files
    const htmlDirs = ['dist', 'output', 'docs/html', 'build', 'html', '.'];
    let htmlFiles = [];
    
    for (const dir of htmlDirs) {
      if (fs.existsSync(dir)) {
        const files = findHtmlFiles(dir);
        if (files.length > 0) {
          htmlFiles = files;
          console.log(`Found ${files.length} HTML files in ${dir}`);
          break;
        }
      }
    }

    if (htmlFiles.length === 0) {
      console.error('No HTML files found. Build script may not have generated output.');
      process.exit(1);
    }

    // Step 4: Clone preview repository
    console.log(`Cloning preview repository ${previewRepoOwner}/${previewRepoName}...`);
    const previewToken = process.env.PREVIEW_REPO_TOKEN || process.env.GITHUB_TOKEN;
    execSync(`git clone https://${previewToken}@github.com/${previewRepoOwner}/${previewRepoName}.git ${previewDir}`, { stdio: 'inherit' });
    process.chdir(previewDir);

    // Step 5: Copy HTML files to preview path
    console.log(`Copying HTML files to ${previewPath}...`);
    const targetDir = path.join(previewDir, previewPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy files maintaining directory structure
    for (const file of htmlFiles) {
      const relativePath = path.relative(tempDir, file);
      const targetFile = path.join(targetDir, relativePath);
      const targetFileDir = path.dirname(targetFile);
      
      if (!fs.existsSync(targetFileDir)) {
        fs.mkdirSync(targetFileDir, { recursive: true });
      }
      
      fs.copyFileSync(file, targetFile);
      console.log(`Copied: ${relativePath}`);
    }

    // Step 6: Commit and push
    console.log('Committing changes...');
    execSync('git config user.name "GitHub Actions"', { stdio: 'inherit' });
    execSync('git config user.email "actions@github.com"', { stdio: 'inherit' });
    execSync(`git add ${previewPath}`, { stdio: 'inherit' });
    
    try {
      execSync(`git commit -m "Update preview for ${repoName}#${prNumber} (${commitSha.substring(0, 7)})"`, { stdio: 'inherit' });
      execSync('git push origin main', { stdio: 'inherit' });
      console.log('Preview updated successfully!');
    } catch (e) {
      if (e.message.includes('nothing to commit')) {
        console.log('No changes to commit.');
      } else {
        throw e;
      }
    }

    // Cleanup
    process.chdir('/');
    execSync(`rm -rf ${tempDir} ${previewDir}`, { stdio: 'inherit' });

  } catch (error) {
    console.error('Error generating preview:', error);
    process.exit(1);
  }
}

async function handleCleanup() {
  try {
    const previewDir = path.join('/tmp', `preview-repo-cleanup-${Date.now()}`);

    // Step 1: Clone preview repository
    console.log(`Cloning preview repository ${previewRepoOwner}/${previewRepoName}...`);
    const previewToken = process.env.PREVIEW_REPO_TOKEN || process.env.GITHUB_TOKEN;
    execSync(`git clone https://${previewToken}@github.com/${previewRepoOwner}/${previewRepoName}.git ${previewDir}`, { stdio: 'inherit' });
    process.chdir(previewDir);

    // Step 2: Delete PR folder
    const targetPath = path.join(previewDir, previewPath);
    if (fs.existsSync(targetPath)) {
      console.log(`Deleting ${previewPath}...`);
      execSync(`rm -rf ${targetPath}`, { stdio: 'inherit' });

      // Step 3: Commit and push
      console.log('Committing deletion...');
      execSync('git config user.name "GitHub Actions"', { stdio: 'inherit' });
      execSync('git config user.email "actions@github.com"', { stdio: 'inherit' });
      execSync(`git add -A`, { stdio: 'inherit' });
      
      try {
        execSync(`git commit -m "Remove preview for ${repoName}#${prNumber}"`, { stdio: 'inherit' });
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('Preview cleanup completed!');
      } catch (e) {
        if (e.message.includes('nothing to commit')) {
          console.log('No changes to commit.');
        } else {
          throw e;
        }
      }
    } else {
      console.log(`Preview folder ${previewPath} does not exist. Nothing to clean up.`);
    }

    // Cleanup
    process.chdir('/');
    execSync(`rm -rf ${previewDir}`, { stdio: 'inherit' });

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

function findHtmlFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findHtmlFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

