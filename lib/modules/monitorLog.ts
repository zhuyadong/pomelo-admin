/*!
 * Pomelo -- consoleModule monitorLog
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);
const exec = require("child_process").exec;
import path = require("path");
import { MonitorAgent } from "../monitor/monitorAgent";
import { MasterAgent } from "../master/masterAgent";

const DEFAULT_INTERVAL = 5 * 60; // in second

export = (opts: any) => {
	return new MonitorLogModule(opts);
};

module.exports.moduleId = "monitorLog";

class MonitorLogModule {
	readonly root: string;
	readonly interval: number;
	/**
	 * Initialize a new 'Module' with the given 'opts'
	 *
	 * @class Module
	 * @constructor
	 * @param {object} opts
	 * @api public
	 */
	constructor(opts: any) {
		opts = opts || {};
		this.root = opts.path;
		this.interval = opts.interval || DEFAULT_INTERVAL;
	}

	/**
	 * collect monitor data from monitor
	 *
	 * @param {Object} agent monitorAgent object
	 * @param {Object} msg client message
	 * @param {Function} cb callback function
	 * @api public
	 */
	monitorHandler(agent: MonitorAgent, msg: any, cb: Function) {
		if (!msg.logfile) {
			cb(new Error("logfile should not be empty"));
			return;
		}

		let serverId = agent.id;
		fetchLogs(this.root, msg, (data: any) => {
			cb(null, { serverId: serverId, body: data });
		});
	}

	/**
	 * Handle client request
	 *
	 * @param {Object} agent masterAgent object
	 * @param {Object} msg client message
	 * @param {Function} cb callback function
	 * @api public
	 */
	clientHandler(agent: MasterAgent, msg: any, cb: Function) {
		agent.request(
			msg.serverId,
			module.exports.moduleId,
			msg,
			(err: any, res: any) => {
				if (err) {
					logger.error("fail to run log for " + err.stack);
					return;
				}
				cb(null, res);
			}
		);
	}
}
//get the latest logs
function fetchLogs(root: string, msg: any, callback: Function) {
	let number = msg.number;
	let logfile = msg.logfile;
	let serverId = msg.serverId;
	let filePath = path.join(root, getLogFileName(logfile, serverId));

	let endLogs: any = [];
	exec("tail -n " + number + " " + filePath, (error: any, output: any) => {
		let endOut = [];
		output = output.replace(/^\s+|\s+$/g, "").split(/\s+/);

		for (let i = 5; i < output.length; i += 6) {
			endOut.push(output[i]);
		}

		let endLength = endOut.length;
		for (let j = 0; j < endLength; j++) {
			let map: any = {};
			let json;
			try {
				json = JSON.parse(endOut[j]);
			} catch (e) {
				logger.error("the log cannot parsed to json, " + e);
				continue;
			}
			map.time = json.time;
			map.route = json.route || json.service;
			map.serverId = serverId;
			map.timeUsed = json.timeUsed;
			map.params = endOut[j];
			endLogs.push(map);
		}

		callback({ logfile: logfile, dataArray: endLogs });
	});
}

function getLogFileName(logfile: string, serverId: string) {
	return logfile + "-" + serverId + ".log";
}
