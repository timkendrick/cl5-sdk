'use strict';

const assert = require('assert');
const minimist = require('minimist');

class Cli {
	constructor(options) {
		assert(options.name, 'Missing executable name');
		assert(options.version, 'Missing executable version');
		assert(options.commands, 'Missing commands');

		this.name = options.name;
		this.version = options.version;
		this.commands = options.commands;
		this.description = options.description || null;
		this.options = options.options || null;
	}

	process(argv) {
		const args = parseArgs(process.argv);
		const commandName = args.command;
		const inputArgs = args.input;
		const options = args.options;

		const isValidCommand = this.hasCommand(commandName);

		if ((options.help || !commandName) && !(commandName && !isValidCommand)) {
			if (commandName) {
				this.showCommandHelp(commandName);
			} else {
				this.showHelp();
			}
			return Promise.resolve();
		}

		if (options.version) {
			this.showVersion();
			return Promise.resolve();
		}

		try {
			assert(isValidCommand, 'Invalid command: ' + commandName);
		} catch (error) {
			stderr(error.message);
			this.showHelp();
			return Promise.reject(error);
		}

		const command = this.getCommand(commandName);
		const expandedOptions = expandOptionAliases(command, options);

		return this.runCommand(commandName, inputArgs, expandedOptions)
			.catch(error => {
				const isArgumentError = (error.name === 'AssertionError');
				if (isArgumentError) {
					stderr(error.message);
					this.showCommandHelp(commandName);
				} else {
					stderr(error.stack);
				}
				throw error;
			});


		function parseArgs(argv) {
			const args = minimist(process.argv.slice(2), { boolean: true });
			const commandName = args._[0];
			const inputArgs = args._.slice(1);
			const optionArgs = Object.keys(args).filter(
				key => (key !== '_')
			)
			.reduce((options, key) => {
				options[key] = args[key];
				return options;
			}, {});
			return {
				command: commandName,
				input: inputArgs,
				options: optionArgs
			};
		}

		function expandOptionAliases(command, options) {
			const aliasMappings = command.options.filter(option => {
				return Boolean(option.alias);
			}).reduce((hash, option) => {
				hash[option.alias] = option.name;
				return hash;
			}, {});
			return Object.keys(options).reduce((expandedOptions, key) => {
				var value = options[key];
				if (key in aliasMappings) {
					var optionName = aliasMappings[key];
					expandedOptions[optionName] = value;
				} else {
					expandedOptions[key] = value;
				}
				return expandedOptions;
			}, {});
		}
	}

	hasCommand(commandName) {
		return (commandName in this.commands);
	}

	getCommand(commandName) {
		return (this.commands[commandName] || null);
	}

	runCommand(commandName, inputArgs, options) {
		const command = this.getCommand(commandName);
		const globalOptions = this.options;
		const allowedOptions = (command.options || []).concat(globalOptions);
		try {
			if (command.input) {
				assert(inputArgs.length > 0, 'Missing input path');
			}
			validateOptions(options, allowedOptions);
		} catch (error) {
			return Promise.reject(error);
		}
		return Promise.all(inputArgs.map(function(inputArg) {
			return command.run(inputArg, options);
		}));


		function validateOptions(options, allowedOptions) {
			const requiredOptions = allowedOptions.filter(
				option => option.required
			);
			requiredOptions.forEach(option => {
				const optionValue = options[option.name];
				assert(optionValue, `Missing option "${option.name}"`);
			});
			allowedOptions.forEach(option => {
				const optionValue = options[option.name];
				if (optionValue) {
					assert(isValidType(optionValue, option), `Invalid value for option "${option.name}"`);
				}
			});
			const allowedOptionNames = allowedOptions.map(option => option.name);
			Object.keys(options).forEach(optionName => {
				const optionExists = (allowedOptionNames.indexOf(optionName) !== -1);
				assert(optionExists, `Invalid option: "${optionName}"`);
			});


			function isValidType(value, option) {
				const validTypes = (Array.isArray(option.type) ? option.type : [option.type]);
				return validTypes.some(type => valueIsType(value, type));


				function valueIsType(value, type) {
					switch (type) {
						case 'string':
						case 'path':
							return (typeof value === 'string');
						case 'boolean':
							return !value || (typeof value === 'boolean');
					}
				}
			}
		}
	}

	showHelp() {
		const executableName = this.name;
		const executableDescription = this.description;
		const commands = this.commands;
		const globalOptions = this.options;

		showHelpPage({
			usage: `${executableName} [command] [options]`,
			description: executableDescription,
			commands: Object.keys(commands).sort().map(commandName => {
				const command = commands[commandName];
				return {
					name: commandName,
					description: command.description
				};
			}),
			global: globalOptions
		});
	}

	showCommandHelp(commandName) {
		const executableName = this.name;
		const globalOptions = this.options;
		const command = this.getCommand(commandName);
		const requiredOptionsUsage = getRequiredOptionsUsage(command.options);

		showHelpPage({
			usage: `${executableName} ${commandName}` + (requiredOptionsUsage ? ' ' + requiredOptionsUsage : '') + ' [options]' + (command.input ? ' <input>' + (command.multiple ? ' [...input]' : '') : ''),
			description: command.description,
			options: command.options,
			global: globalOptions
		});


		function getRequiredOptionsUsage(options) {
			return options.filter(
				option => option.required
			)
			.map(option => {
				var exampleValue = getExampleValue(option);
				return '--' + option.name + (exampleValue ? '=' + exampleValue : '');
			})
			.join(' ');

			function getExampleValue(option) {
				switch (option.type) {
					case 'boolean':
						return null;
					case 'string':
						return '<value>';
					case 'path':
						return '<path>';
					default:
						throw new Error('Invalid option type: ' + option.type);
				}
			}
		}
	}

	showVersion() {
		stdout(this.version);
	}
}

module.exports = Cli;


function showHelpPage(help, isError) {
	stdout('');
	if (help.usage) {
		stdout('  Usage: ' + help.usage + '\n');
	}
	if (help.description) {
		stdout('  ' + help.description + '\n');
	}
	if (help.commands) {
		stdout('  Commands:' + '\n');
		stdout(getDescriptionTable(help.commands) + '\n');
	}
	if (help.options) {
		stdout('  Options:' + '\n');
		stdout(getDescriptionTable(help.options.map(function(option) {
			return { name: '--' + option.name + (option.alias ? ', -' + option.alias : ''), description: option.description };
		})) + '\n');
	}
	if (help.global) {
		stdout('  Global options:' + '\n');
		stdout(getDescriptionTable(help.global.map(function(option) {
			return { name: '--' + option.name + (option.alias ? ', -' + option.alias : ''), description: option.description };
		})) + '\n');
	}


	function getDescriptionTable(items) {
		var itemNames = items.map(item => item.name);
		var maxNameLength = getMaxLength(itemNames);
		return items.map(
			item => `    ${rightPad(item.name, maxNameLength)}    ${item.description}`
		).join('\n');
	}

	function getMaxLength(strings) {
		return strings.reduce((max, string) => {
			return Math.max(max, string.length);
		}, 0);
	}

	function rightPad(string, length) {
		while (string.length < length) { string += ' '; }
		return string;
	}
}

function stdout(message) {
	process.stdout.write(message + '\n');
}

function stderr(message) {
	process.stderr.write(formatErrorString(message) + '\n');

	function formatErrorString(string) {
		return '\u001b[31m' + string + '\u001b[39m';
	}
}
