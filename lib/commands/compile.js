'use strict';

const fs = require('fs');
const path = require('path');
const pify = require('pify');
const mkdirp = require('mkdirp');

const loadAnimation = require('../services/loadAnimation');

const readFile = pify(fs.readFile);
const writeFile = pify(fs.writeFile);
const ensureDirectoryExists = pify(mkdirp);

const JSONP_CALLBACK_NAME = 'loadAnimation';

const LIBRARY_SCRIPT_PATH = path.resolve(__dirname, '../../client/render.js');
const SECRETS_SCRIPT_PATH = path.resolve(__dirname, '../../client/secrets.js');

module.exports = function(inputPath, options) {
	const outputPath = options.output;
	const scriptPaths = [LIBRARY_SCRIPT_PATH].concat(options.secrets ? [SECRETS_SCRIPT_PATH] : []);
	if (outputPath) { process.stdout.write('Building script bundle...' + '\n'); }
	return Promise.all([
		loadJson(inputPath),
		loadScripts(scriptPaths)
	])
		.then(results => {
			const animation = Object.assign(results[0]);
			const scripts = results[1];
			return loadAnimation(animation, inputPath)
				.then(function(animation) {
					return formatAnimationJson(animation);
				})
				.then(function(animationJson) {
					return createJsonp(animationJson, JSONP_CALLBACK_NAME);
				})
				.then(function(animationJsonp) {
					return concatSources(scripts.concat(animationJsonp));
				});
		})
		.then(js => {
			if (outputPath) {
				const outputDirPath = path.dirname(outputPath);
				return ensureDirectoryExists(outputDirPath)
					.then(() => {
						writeFile(outputPath, js);
					})
					.then(() => {
						process.stdout.write('Saved script bundle to ' + outputPath + '\n');
					});
			} else {
				process.stdout.write(js);
			}
		});
};


function loadJson(filePath) {
	return readFile(filePath, { encoding: 'utf8' }).then(
		json => JSON.parse(json)
	);
}

function loadScripts(scriptPaths) {
	return Promise.all(scriptPaths.map(
		scriptPath => readFile(scriptPath, { encoding: 'utf8' })
	));
}

function formatAnimationJson(value) {
	const json = JSON.stringify(value, null, '\t');
	return cleanup(json);


	function cleanup(json) {
		return cleanupTextFrames(cleanupPoints(json));

		function cleanupTextFrames(json) {
			return json.replace(/\{\n\t*"time": (.*),\n\t+"text": (.*),\n\t+"style": (.*),\n\t+"position": (.*)\n\t*\}/g, '{ "time": $1, "text": $2, "style": $3, "position": $4 }');
		}

		function cleanupPoints(json) {
			return json.replace(/\{\n\t*"point": \{\n\t+"x": (.*),\n\t+"y": (.*)\n\t+\},\n\t+"handleIn": \{\n\t+"x": (.*),\n\t+"y": (.*)\n\t+\},\n\t+"handleOut": \{\n\t+"x": (.*),\n\t+"y": (.*)\n\t+\}\n\t*\}/g, '{ "point": { "x": $1, "y": $2 }, "handleIn": { "x": $3, "y": $4 }, "handleOut": { "x": $5, "y": $6 } }');
		}
	}
}

function createJsonp(json, functionName) {
	return functionName + '(' + json + ');' + '\n';
}

function concatSources(sources) {
	return sources.join('\n');
}
