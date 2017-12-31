const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);
import utils = require("../util/utils");

let profiler: any = null;

try {
	profiler = require("v8-profiler");
} catch (e) {}

import fs = require("fs");
import path = require("path");
import { ProfileProxy } from "../util/profileProxy";
import { MasterAgent } from "../master/masterAgent";
import { MonitorAgent } from "../monitor/monitorAgent";

export = (opts: any) => {
	if (!profiler) {
		return {};
	} else {
		return new ProfilerModule(opts);
	}
};

if (!profiler) {
	module.exports.moduleError = 1;
}

module.exports.moduleId = "profiler";

class ProfilerModule {
	private proxy: ProfileProxy;
	constructor(opts: any) {
		if (opts && opts.isMaster) {
			this.proxy = new ProfileProxy();
		}
	}

	monitorHandler(agent: MonitorAgent, msg: any, cb: Function) {
		let type = msg.type,
			action = msg.action,
			uid = msg.uid,
			result = null;
		if (type === "CPU") {
			if (action === "start") {
				profiler.startProfiling();
			} else {
				result = profiler.stopProfiling();
				let res: any = {};
				res.head = result.getTopDownRoot();
				res.bottomUpHead = result.getBottomUpRoot();
				res.msg = msg;
				agent.notify(module.exports.moduleId, {
					clientId: msg.clientId,
					type: type,
					body: res
				});
			}
		} else {
			let snapshot = profiler.takeSnapshot();
			let appBase = path.dirname((<any>require).main.filename);
			let name = appBase + "/logs/" + utils.format(new Date()) + ".log";
			let log = fs.createWriteStream(name, { flags: "a" });
			let data;
			snapshot.serialize({
				onData: (chunk: string, size: number) => {
					chunk = chunk + "";
					data = {
						method: "Profiler.addHeapSnapshotChunk",
						params: {
							uid: uid,
							chunk: chunk
						}
					};
					log.write(chunk);
					agent.notify(module.exports.moduleId, {
						clientId: msg.clientId,
						type: type,
						body: data
					});
				},
				onEnd: function() {
					agent.notify(module.exports.moduleId, {
						clientId: msg.clientId,
						type: type,
						body: { params: { uid: uid } }
					});
					profiler.deleteAllSnapshots();
				}
			});
		}
	}

	masterHandler(agent: MasterAgent, msg: any, cb: Function) {
		if (msg.type === "CPU") {
			this.proxy.stopCallBack(msg.body, msg.clientId, agent);
		} else {
			this.proxy.takeSnapCallBack(msg.body);
		}
	}

	clientHandler(agent: MasterAgent, msg: any, cb: Function) {
		if (msg.action === "list") {
			list(agent, msg, cb);
			return;
		}

		if (typeof msg === "string") {
			msg = JSON.parse(msg);
		}
		let id = msg.id;
		let command = msg.method.split(".");
		let method = command[1];
		let params = msg.params;
		let clientId = msg.clientId;

		if (
			!(<any>this.proxy)[method] ||
			typeof (<any>this.proxy)[method] !== "function"
		) {
			return;
		}

		(<any>this.proxy)[method](id, params, clientId, agent);
	}
}

function list(agent: MasterAgent, msg: any, cb: Function) {
	let servers = [];
	let idMap = agent.idMap;

	for (let sid in idMap) {
		servers.push(sid);
	}
	cb(null, servers);
}
