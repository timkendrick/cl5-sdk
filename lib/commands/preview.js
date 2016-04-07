'use strict';

const path = require('path');
const debounce = require('lodash.debounce');
const chokidar = require('chokidar');

const compile = require('./compile');

const generateTempPath = require('../utils/generateTempPath');
const serve = require('../utils/serve');

const OUTPUT_FILENAME = 'script.js';

const LIBRARY_TEMPLATE_PATH = path.resolve(__dirname, '../../client/render.js');
const VIEWER_TEMPLATE_PATH = path.resolve(__dirname, '../../template/viewer');

const SOURCE_WATCH_PATHS = [
	LIBRARY_TEMPLATE_PATH
];

const REBUILD_DEBOUNCE_DELAY = 500;

module.exports = function(inputPath, options) {
	options = options || {};
	const isWatching = Boolean(options.watch);
	const includeSecrets = Boolean(options.secrets);
	const viewerTemplatePath = VIEWER_TEMPLATE_PATH;
	const userWatchPaths = getUserWatchPaths(options.watch);
	const sourceWatchPaths = (isWatching ? SOURCE_WATCH_PATHS.concat([inputPath]).concat(userWatchPaths) : null);
	const outputDir = generateTempPath();
	const outputScriptPath = path.join(outputDir, OUTPUT_FILENAME);


	if (isWatching) {
		const rebuild = debounce(build, REBUILD_DEBOUNCE_DELAY);
		watchForChanges(sourceWatchPaths, path => {
			process.stdout.write(path + ' changed, rebuilding...' + '\n');
			rebuild();
		});
		process.stdout.write('Watching for filesystem changes...' + '\n');
	}

	return build()
		.then(() => {
			serve({
				root: [outputDir, viewerTemplatePath],
				watch: path.join(outputDir, '**/*')
			});
		});


	function build() {
		return compile(inputPath, {
			output: outputScriptPath,
			secrets: includeSecrets
		});
	}

	function getUserWatchPaths(arg) {
		if (typeof arg === 'string') { return arg.split(','); }
		if (Array.isArray(arg)) { return arg; }
		return [];
	}
}

function watchForChanges(paths, callback) {
	chokidar.watch(paths, { ignoreInitial: true }).on('all', (event, path) => {
		callback(path);
	});
}
