// # create-prs.js
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import simpleGit from 'simple-git';
import core from '@actions/core';
import { Octokit } from '@octokit/rest';
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const baseDir = process.cwd();
const git = simpleGit({ baseDir });
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

// # handleResult(result)
// Handles the result of a single package being added to the channel.
async function handleResult(result) {

	// If a PR already exists for this branch, it's probably a fix deployed by 
	// the creator of the package. This means we have to fetch the branch from 
	// the server.
	let { pr } = result;
	if (pr) {
		let spinner = ora(`Checking out origin/${result.branch}`);
		await git.fetch();
		await git.checkoutBranch(result.branch, `origin/${result.branch}`);
		spinner.succeed();
	} else {
		let spinner = ora(`Creating new branch ${result.branch}`);
		await git.checkoutLocalBranch(result.branch);
		spinner.succeed();
	}

	// Re-apply the changes from this package.
	for (let file of result.files) {
		let dirname = path.dirname(file.path);
		await fs.promises.mkdir(dirname, { recursive: true });
		await fs.promises.writeFile(file.path, file.contents);
	}

	// Add all the modified files & then commit.
	let spinner = ora('Committing files').start();
	for (let file of result.files) {
		await git.add(file.name);
	}
	await git.commit(result.title, { '--allow-empty': true });
	let sha = await git.revparse(['HEAD']);
	spinner.succeed();
	spinner = ora(`Pushing ${result.branch} to origin`).start();
	await git.push('origin', result.branch);
	spinner.succeed();

	// If no PR existed yet, then we have to push the branch. Otherwise it will 
	// be handled for us.
	if (!pr) {
		let spinner = ora('Creating new PR on GitHub').start();
		({ data: pr } = await octokit.pulls.create({
			owner,
			repo,
			base: 'main',
			title: result.title,
			head: result.branch,
			body: result.body,
		}));
		spinner.succeed();

		spinner = ora('Adding labels').start();
		octokit.issues.addLabels({
			owner,
			repo,
			issue_number: pr.number,
			labels: ['package'],
		});
		spinner.succeed();
	}

	// Cool, now delete the branch again.
	await git.checkout('main');
	await git.deleteLocalBranch(result.branch, true);
	ora(`Handled ${result.title}`).succeed();

	// Return the pr info so that our action can set it as output.
	return {
		ref: `refs/pull/${pr.number}/merge`,
		number: pr.number,
		sha,
	};

}

// # create(results)
// Creates or updates PRs for all the packages that have been created.
export default async function create(results) {

	// At this point, we assume that the repository is on the main branch, but 
	// not in a clean state, meaning the added files are in the src/yaml file. 
	// However, we will need to fetch the branch of existing repos one by one, 
	// so we will read in all files in memory and then reapply them manually 
	// later on. Might be a way to do this natively with Git, but it has proven 
	// to be extremely hard, lol.
	await git.add('.');
	for (let result of results) {
		let files = [];
		for (let name of result.files) {
			let fullPath = path.join(process.env.GITHUB_WORKSPACE, name);
			let contents = await fs.promises.readFile(fullPath);
			files.push({
				name,
				path: fullPath,
				contents,
			});
		}
		result.files = files;
	}

	// Reset the repository to a clean state again.
	await git.reset({ '--hard': true });

	// Fetch all open PRs from GitHub so that can figure out which files are 
	// updates of existing, open PR's.
	let spinner = ora('Fetching open pull requests from GitHub').start();
	const { data: prs } = await octokit.pulls.list({
		owner,
		repo,
		state: 'open',
	});
	spinner.succeed();

	// Create PR's and update branches for every result.
	let output = [];
	for (let result of results) {
		let pr = await handleResult({
			pr: prs.find(pr => pr.head.ref === result.branch),
			...result,
		});
		output.push(pr);
	}
	core.setOutput('prs', JSON.stringify(output));

}
