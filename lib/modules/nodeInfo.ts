/*!
 * Pomelo -- consoleModule nodeInfo processInfo
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import { MonitorAgent } from "../monitor/monitorAgent";
import { MasterAgent } from "../master/masterAgent";

const monitor = require("pomelo-monitor");
const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);

let DEFAULT_INTERVAL = 5 * 60; // in second
let DEFAULT_DELAY = 10; // in second

export = (opts: any) => {
	return new NetInfoModule(opts);
};

module.exports.moduleId = "nodeInfo";

class NetInfoModule {
	private type: string;
	private interval: number;
	private delay: number;
	constructor(opts: any) {
		opts = opts || {};
		this.type = opts.type || "pull";
		this.interval = opts.interval || DEFAULT_INTERVAL;
		this.delay = opts.delay || DEFAULT_DELAY;
	}

	monitorHandler(agent: MonitorAgent, msg: any, cb: Function) {
		let serverId = agent.id;
		let pid = process.pid;
		let params = {
			serverId: serverId,
			pid: pid
		};
		monitor.psmonitor.getPsInfo(params, (err: any, data: any) => {
			agent.notify(module.exports.moduleId, {
				serverId: agent.id,
				body: data
			});
		});
	}

	masterHandler(agent: MasterAgent, msg: any, cb: Function) {
		if (!msg) {
			agent.notifyAll(module.exports.moduleId);
			return;
		}

		let body = msg.body;
		let data = agent.get(module.exports.moduleId);
		if (!data) {
			data = {};
			agent.set(module.exports.moduleId, data);
		}

		data[msg.serverId] = body;
	}

	clientHandler(agent: MasterAgent, msg: any, cb: Function) {
		cb(null, agent.get(module.exports.moduleId) || {});
	}
}
