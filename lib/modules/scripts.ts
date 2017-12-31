/*!
 * Pomelo -- consoleModule runScript
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
const monitor = require("pomelo-monitor");
const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);
import vm = require("vm");
import fs = require("fs");
import util = require("util");
import path = require("path");
import { MasterAgent } from "../master/masterAgent";
import { MonitorAgent } from "../monitor/monitorAgent";

export = (opts: any) => {
	return new ScriptsModule(opts);
};

module.exports.moduleId = "scripts";

class ScriptsModule {
	readonly app: any;
	readonly root: string;
	readonly commands = {
		list: list,
		get: get,
		save: save,
		run: run
	};
	constructor(opts: any) {
		this.app = opts.app;
		this.root = opts.path;
	}

	monitorHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		let context = {
			app: this.app,
			require: require,
			os: require("os"),
			fs: require("fs"),
			process: process,
			util: util
		};
		try {
			vm.runInNewContext(msg.script, context);

			let result = (<any>context).result;
			if (!result) {
				cb(
					null,
					"script result should be assigned to result value to script module context"
				);
			} else {
				cb(null, result);
			}
		} catch (e) {
			cb(null, e.toString());
		}

		//cb(null, vm.runInContext(msg.script, context));
	}

	clientHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		let fun = (<any>this).commands[msg.command];
		if (!fun || typeof fun !== "function") {
			cb("unknown command:" + msg.command);
			return;
		}

		fun(this, agent, msg, cb);
	}
}

/**
 * List server id and scripts file name
 */
function list(
	scriptModule: ScriptsModule,
	agent: MasterAgent & MonitorAgent,
	msg: any,
	cb: Function
) {
	let servers: any = [];
	let scripts: any = [];
	let idMap = agent.idMap;

	for (let sid in idMap) {
		servers.push(sid);
	}

	fs.readdir(scriptModule.root, function(err, filenames) {
		if (err) {
			filenames = [];
		}
		for (let i = 0, l = filenames.length; i < l; i++) {
			scripts.push(filenames[i]);
		}

		cb(null, {
			servers: servers,
			scripts: scripts
		});
	});
}

/**
 * Get the content of the script file
 */
function get(
	scriptModule: ScriptsModule,
	agent: MasterAgent & MonitorAgent,
	msg: any,
	cb: Function
) {
	let filename = msg.filename;
	if (!filename) {
		cb("empty filename");
		return;
	}

	fs.readFile(path.join(scriptModule.root, filename), "utf-8", function(
		err,
		data
	) {
		if (err) {
			logger.error(
				"fail to read script file:" + filename + ", " + err.stack
			);
			cb("fail to read script with name:" + filename);
		}

		cb(null, data);
	});
}

/**
 * Save a script file that posted from admin console
 */
function save(
	scriptModule: ScriptsModule,
	agent: MasterAgent & MonitorAgent,
	msg: any,
	cb: Function
) {
	let filepath = path.join(scriptModule.root, msg.filename);

	fs.writeFile(filepath, msg.body, function(err) {
		if (err) {
			logger.error(
				"fail to write script file:" + msg.filename + ", " + err.stack
			);
			cb("fail to write script file:" + msg.filename);
			return;
		}

		cb();
	});
}

/**
 * Run the script on the specified server
 */
function run(
	scriptModule: ScriptsModule,
	agent: MasterAgent & MonitorAgent,
	msg: any,
	cb: Function
) {
	agent.request(
		msg.serverId,
		module.exports.moduleId,
		msg,
		(err: any, res: any) => {
			if (err) {
				logger.error("fail to run script for " + err.stack);
				return;
			}
			cb(null, res);
		}
	);
}
