
const vscode = require('vscode');
const simpleGit = require('simple-git');

const {
	alternateExtensions,
	baseDir,
	basicExtension,
	historyDepth,
	maxCommitFilesAmount,
	maxRelatedFiles,
} = vscode.workspace.getConfiguration('relatedfilesbygit')

const extensions = alternateExtensions
	.split(',')
	.map(str => `.${str.trim()}`);

const gitOptions = {
	baseDir,
	binary: 'git',
	maxConcurrentProcesses: 6,
};

const git = simpleGit(gitOptions);

const allRelatedFiles = {};

function activate(context) {

	const findRelative = vscode.commands
		.registerTextEditorCommand('relatedfilesbygit.find', function () {

			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
			return;
			}

			const documentPath = activeEditor.document.uri;

			const file = documentPath.path.slice(gitOptions.baseDir.length);

			if (allRelatedFiles[file]) {
				showRelatedFiles(allRelatedFiles[file]);
				return;
			}

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Search related files...",
				cancellable: true
			}, (progress, token) => {
				return new Promise((resolve, token) => {

					const relatedFilesStat = {};

					git.log({ file }).then(async function(data) {
						const promises = data.all.slice(0, historyDepth)
							.map(function(commit) {
								return readCommit(commit, file, relatedFilesStat);
							});
						await Promise.all(promises);
			
						const relatedFiles = getSortedFiles(relatedFilesStat);
			
						showRelatedFiles(relatedFiles, file);
						allRelatedFiles[file] = relatedFiles;

						resolve("Done!");
					});
				})
			});
		});

	context.subscriptions.push(findRelative);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}

function getSortedFiles(statsObj) {
	let res = [];
	let sortedAmounts = Object.values(statsObj)
		.sort((a, b) => a - b)
		.reverse();
	let prevAmount;
	sortedAmounts.forEach((amount) => {
		// only uniq amounts
		if (amount === prevAmount) {
			return;
		}
		Object.keys(statsObj).forEach((keyPath) => {
			if (statsObj[keyPath] === amount) {
				res.push(keyPath);
			}
		});
		prevAmount = amount;
	});
	return res.slice(0, maxRelatedFiles);
}

function showRelatedFiles(relatedFiles) {
	vscode.window.showQuickPick(relatedFiles).then(selection => {
		// the user canceled the selection
		if (!selection) {
		  return;
		};
		
		openFile(selection, -1);
	});
}

function openFile(selectedPath, extensionIndex) {
	const path = extensionIndex < 0 ?
		selectedPath
		:
		selectedPath.replace(`.${basicExtension}`, extensions[extensionIndex]);

	// A request file path
	const openPath = vscode.Uri.parse("file://" + gitOptions.baseDir + path);
	return vscode.workspace.openTextDocument(openPath).then(doc => {
		vscode.window.showTextDocument(doc);
	}).catch(err => {
		if (extensions[extensionIndex + 1]) {
			openFile(selectedPath, extensionIndex + 1);
		} else {
			vscode.window.showInformationMessage('File not found');
		};
		console.log(err);
	});
}

async function readCommit(commitObj, file, allRelatedFiles) {
	const fileListText = await git.show({
		[commitObj.hash]: true,
		'--pretty': '',
		'--name-only': true,
	});
	const fileList = fileListText.split('\n');

	if (fileList.length > maxCommitFilesAmount) {
		return [];
	};

	fileList.forEach((filePath) => {
		// ignore current file
		if (filePath.length === 0 || file === filePath) {
			return;
		}
		let prevValue = allRelatedFiles[filePath] || 0;
		allRelatedFiles[filePath] = ++prevValue;
	});
};

module.exports = {
	activate,
	deactivate
}
