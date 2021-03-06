'use strict';

const browserSync = require('browser-sync');

module.exports = function(options) {
	const siteRoot = options.root;
	const watchPaths = options.watch;

	const server = browserSync.create();

	if (watchPaths) {
		server.watch(watchPaths).on('change', server.reload);
	}

	server.init({
		server: siteRoot,
		middleware: [preventCache]
	});
};


function preventCache(req, res, next) {
	res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
	res.setHeader('Pragma', 'no-cache');
	res.setHeader('Expires', '0');
	next();
}
