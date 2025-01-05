// # create-prs.js
import './polyfill.js';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { Glob } from 'glob';
import ora from 'ora';
import core from '@actions/core';
import github from '@actions/github';
import { simpleGit } from 'simple-git';
import { parseAllDocuments } from 'yaml';

// Setup our git client & octokit.
const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();
const git = simpleGit(simpleGit);
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const { context } = github;

// Before we can generate our PRs, we need to make sure the repository is in a 
// clean state. That's because if we checkout an existing branch, it might 
// overwrite the changes made by the fetch action, so we first have to figure 
// out all files that have changed and undo those changes.
const packages = JSON.parse(core.getInput('packages'));
if (packages.length > 0) {
	for (let pkg of packages) {
		let additions = [];
		for (let name of pkg.additions) {
			let fullPath = path.join(cwd, name);
			let contents = await fs.promises.readFile(fullPath);
			additions.push({
				name,
				path: fullPath,
				contents,
			});
		}
		pkg.additions = additions;
	}

	// Reset the repository to a clean state again.
	await git.reset({ '--hard': true });
	await git.clean('f', { '-d': true });

	// Fetch all open PRs from GitHub so that we can figure out which files are 
	// updates of existing, open PRs.
	let spinner = ora('Fetching open pull requests from GitHub').start();
	const { data: prs } = await octokit.rest.pulls.list({
		...context.repo,
		state: 'open',
	});
	spinner.succeed();

	// Create the PRs and update the branches for each result.
	for (let pkg of packages) {
		await createPr(pkg, prs);
	}

}

// At last we will update the `LAST_RUN` file. It's crucial that this happens 
// *after* the PRs have been created so that if the workflow gets canceled 
// because someone else has uploaded a package, then we don't want `LAST_RUN` to 
// be upaded already without the PRs being created! PRs won't ever be created as 
// double PRs, they just get updated, so it's safe to "override" ourselves, as 
// long as we didn't update LAST_RUN yet.
const timestamp = core.getInput('timestamp');
if (timestamp) {
	const octokit = github.getOctokit(process.env.LAST_RUN_TOKEN);
	await octokit.request('PATCH /repos/{owner}/{repo}/actions/variables/{name}', {
		...context.repo,
		name: 'LAST_RUN',
		value: timestamp,
    });
}

// # createPr(pkg)
// Creates a new PR for the given package, or updates it if it already exists.
async function createPr(pkg, prs) {
	let branch = `package/${pkg.branchId}`;
	let pr = prs.find(pr => pr.head.ref === branch);

	// If a PR already exists for this branch, it's probably a fix dpeloyed by 
	// the creator of the package. This means we have to fetch the branch from 
	// the server.
	if (pr) {
		let spinner = ora(`Checking out origin/${branch}`);
		await git.fetch();
		await git.checkoutBranch(branch, `origin/${branch}`);

		// Compare the main branch with this branch.
		const { data } = await octokit.rest.repos.compareCommits({
			...context.repo,
			base: 'main',
			head: branch,
		});
		if (data.status === 'behind') {
			let result = await octokit.rest.repos.merge({
				...context.repo,
				base: branch,
				head: 'main',
			});
			if (result.status !== 200 && result.status !== 201) {
				core.error(`Failed to merge main into ${branch}`);
				return;
			}
		}
		spinner.succeed();
	} else {
		let spinner = ora(`Creating new branch ${branch}`);
		await git.checkoutLocalBranch(branch);
		spinner.succeed();
	}

	// It's possible that files are renamed within a PR, so we have to make sure 
	// to delete all older files with the same file id. There can only ever be 
	// *1* file with a certain file id, otherwise there'd be conflicts.
	let srcDir = path.join(process.env.GITHUB_WORKSPACE, 'src/yaml');
	let glob = new Glob(`*/${pkg.fileId}-*.yaml`, {
		cwd: srcDir,
	});
	for await (let file of glob) {
		let fullPath = path.join(srcDir, file);
		await fs.promises.unlink(fullPath);
		await git.add(file);
	}

	// Re-apply the changes from this package.
	let docs = [];
	for (let file of pkg.additions) {
		let dirname = path.dirname(file.path);
		await fs.promises.mkdir(dirname, { recursive: true });
		await fs.promises.writeFile(file.path, file.contents);
		docs.push(...parseAllDocuments(String(file.contents)));
	}
	let yaml = docs.map(doc => doc.toJSON());
	let main;
	let { packages = [], assets = [] } = Object.groupBy(yaml, json => {
		if (json.group) {
			if (`${json.group}:${json.name}` === pkg.id) {
				main = json;
			}
		}
		return json.group ? 'packages' : 'assets';
	});
	let title = `\`${pkg.id}@${main.version}\``;
	let body = generateBody({ packages, assets, main });

	// Add all the modified files & then commit.
	let spinner = ora('Committing files').start();
	for (let file of pkg.additions) {
		await git.add(file.name);
	}
	await git.commit(title, { '--allow-empty': true });
	let sha = await git.revparse(['HEAD']);
	spinner.succeed();
	spinner = ora(`Pushing ${branch} to origin`).start();
	await git.push('origin', branch);
	spinner.succeed();

	// If no PR existed yet, then we have to push the branch. Otherwise it will 
	// be handled for us.
	if (!pr) {
		let spinner = ora('Creating new PR on GitHub').start();
		({ data: pr } = await octokit.rest.pulls.create({
			...context.repo,
			base: 'main',
			title,
			head: branch,
			body,
		}));
		spinner.succeed();

		spinner = ora('Adding labels').start();
		octokit.rest.issues.addLabels({
			...context.repo,
			issue_number: pr.number,
			labels: ['package'],
		});
		spinner.succeed();
	} else {

		// If a PR already exists, then update it.
		if (pr.title !== title) {
			await octokit.rest.pulls.update({
				...context.repo,
				pull_number: pr.number,
				title,
			});
		}
		await octokit.rest.issues.createComment({
			...context.repo,
			issue_number: pr.number,
			body,
		});

	}

	// Before we start the linting, let's create a commit status of "pending".
	let target_url = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
	await octokit.rest.repos.createCommitStatus({
		...context.repo,
		sha,
		state: 'pending',
		description: 'Running lint...',
		target_url,
	});

	// Once the PR has been updated, we'll run the linting script.
	let result = cp.spawnSync('sc4pac-lint', ['src/yaml'], {
		cwd: process.env.GITHUB_WORKSPACE,
	});
	if (result.status === 0) {
		console.log(result.stdout+'');
		await octokit.rest.repos.createCommitStatus({
			...context.repo,
			sha,
			state: 'success',
			description: 'Metadata validated',
			target_url,
		});
		await octokit.rest.pulls.merge({
			...context.repo,
			pull_number: pr.number,
		});
	} else {
		core.error(result.stdout+'');
		await octokit.rest.repos.createCommitStatus({
			...context.repo,
			sha,
			state: 'failure',
			description: 'Invalid metadata',
			target_url,
		});

		// If we know the GitHub username of the user that created this package, 
		// tag them in the body.
		let message = String(result.stdout) || String(result.stderr);
		let body = '';
		if (pkg.githubUsername) {
			body = `@${pkg.githubUsername}\n\n`;
		}
		body += `⚠️ There is an issue with the metadata for this package:\n\n\`\`\`\n${message}\n\`\`\``;

		// Make a comment in the PR with the linting output.
		await octokit.rest.issues.createComment({
			...context.repo,
			issue_number: pr.number,
			body,
		});

	}

	// Cool, now delete the branch again.
	await git.checkout('main');
	await git.deleteLocalBranch(branch, true);

	// Return the pr info so that our action can set it as output.
	return {
		branch,
		ref: `refs/pull/${pr.number}/merge`,
		number: pr.number,
		sha,
	};

}

// # generateBody(opts)
// Generates the PR body based on the packages we've added.
function generateBody({ packages, assets, main }) {
	let body = [];
	let [image] = main.info?.images ?? [];
	body.push(`# ${main.info?.summary}\n`);
	if (image) {
		body.push(`![${main.info?.summary}](${image})\n`);
	}
	body.push(main.info?.description ?? '');
	body.push('## Packages\n');
	body.push(...packages.map(pkg => {
		let line = `${pkg.group}:${pkg.name}`;
		if (pkg?.info?.website) {
			line = `[${line}](${pkg.info.website})`;
		}
		return `- ${line}`;
	}));
	body.push('');
	body.push('## Assets\n');
	body.push(...assets.map(asset => {
		let { assetId, url } = asset;
		return `- [${assetId}](${url})`;
	}));
	return body.join('\n');
}
