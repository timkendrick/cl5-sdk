'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const del = require('del');
const uuid = require('uuid');
const shutdownHandler = require('shutdown-handler');

module.exports = function() {
	const tmpdir = os.tmpdir();
	const dirName = uuid.v4();
	const dirPath = path.join(tmpdir, dirName);
	fs.mkdirSync(dirPath);
	shutdownHandler.on('exit', event => {
		try {
			del.sync(dirPath, { force: true });
		} catch (error) {
			// Ignore errors
		}
	});
	return dirPath;
};
