# Documentation Previews

This repository automatically stores HTML previews of documentation from pull requests across the organization.

## Overview

When a pull request is opened or updated in monitored repositories, the documentation is automatically converted to HTML and published here for preview. When a PR is closed or merged, its preview files are automatically removed.

## Structure

Preview files are organized by repository and PR number:

```
{repository-name}/{PR-number}/{generated-html-files}
```

For example:
- `my-repo/42/docs/guide.html`
- `another-repo/123/README.html`

Files in the same PR are updated in place when new commits are pushed.

## Accessing Previews

Previews are served via GitHub Pages at:

**https://{your-username}.github.io/documentation-previews/{repository-name}/{PR-number}/**

## Supported Formats

- Markdown (`.md`, `.markdown`)
- Asciidoc (`.adoc`, `.asciidoc`)
- Quickbook (`.qb`, `.qbk`)

## Automatic Management

This repository is automatically managed by the GitHub Documentation Preview System. Please do not manually edit files in this repository, as changes will be overwritten by the automated system.

## How It Works

1. **PR Opened/Synchronized**: Source repository is cloned, build script runs, HTML files are generated and pushed here
2. **PR Closed/Merged**: Preview folder for that PR is automatically deleted

---

*This repository is part of the GitHub Documentation Preview System.*

# documentation-previews
