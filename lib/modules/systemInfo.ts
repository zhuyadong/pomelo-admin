/*!
 * Pomelo -- consoleModule systemInfo
 * Copyright(c) 2012 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import { MasterAgent } from "../master/masterAgent";
import { MonitorAgent } from "../monitor/monitorAgent";

const monitor = require("pomelo-monitor");
const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);

const DEFAULT_INTERVAL = 5 * 60; // in second
const DEFAULT_DELAY = 10; // in second

export = (opts: any) => {
	return new SystemInfoModule(opts);
};

module.exports.moduleId = "systemInfo";

class SystemInfoModule {
	readonly type: string;
	readonly interval: number;
	readonly delay: number;
	constructor(opts?: any) {
		opts = opts || {};
		this.type = opts.type || "pull";
		this.interval = opts.interval || DEFAULT_INTERVAL;
		this.delay = opts.delay || DEFAULT_DELAY;
	}

	monitorHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		//collect data
		monitor.sysmonitor.getSysInfo((err: any, data: any) => {
			agent.notify(module.exports.moduleId, {
				serverId: agent.id,
				body: data
			});
		});
	}

	masterHandler(agent: MasterAgent & MonitorAgent, msg: any) {
		if (!msg) {
			agent.notifyAll(module.exports.moduleId);
			return;
		}

		let body = msg.body;

		let oneData = {
			Time: body.iostat.date,
			hostname: body.hostname,
			serverId: msg.serverId,
			cpu_user: body.iostat.cpu.cpu_user,
			cpu_nice: body.iostat.cpu.cpu_nice,
			cpu_system: body.iostat.cpu.cpu_system,
			cpu_iowait: body.iostat.cpu.cpu_iowait,
			cpu_steal: body.iostat.cpu.cpu_steal,
			cpu_idle: body.iostat.cpu.cpu_idle,
			tps: body.iostat.disk.tps,
			kb_read: body.iostat.disk.kb_read,
			kb_wrtn: body.iostat.disk.kb_wrtn,
			kb_read_per: body.iostat.disk.kb_read_per,
			kb_wrtn_per: body.iostat.disk.kb_wrtn_per,
			totalmem: body.totalmem,
			freemem: body.freemem,
			"free/total": body.freemem / body.totalmem,
			m_1: body.loadavg[0],
			m_5: body.loadavg[1],
			m_15: body.loadavg[2]
		};

		let data = agent.get(module.exports.moduleId);
		if (!data) {
			data = {};
			agent.set(module.exports.moduleId, data);
		}

		data[msg.serverId] = oneData;
	}

	clientHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		cb(null, agent.get(module.exports.moduleId) || {});
	}
}
