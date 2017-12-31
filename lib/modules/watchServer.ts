import { MasterAgent } from "../master/masterAgent";
/*!
 * Pomelo -- consoleModule watchServer
 * Copyright(c) 2013 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */
import countDownLatch = require("../util/countDownLatch");
import utils = require("../util/utils");
import util = require("util");
import fs = require("fs");
import vm = require("vm");
import { MonitorAgent } from "../monitor/monitorAgent";

const logger = require("pomelo-logger").getLogger("pomelo-admin", __filename);
const monitor = require("pomelo-monitor");

export = (opts: any) => {
	return new WatchServerModule(opts);
};

module.exports.moduleId = "watchServer";

class WatchServerModule {
	private app: any; //TODO
	constructor(opts: any) {
		opts = opts || {};
		this.app = opts.app;
	}

	monitorHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		let comd = msg["comd"];
		let context = msg["context"];
		let param = msg["param"];
		let app = this.app;

		let handle = "monitor";

		switch (comd) {
			case "servers":
				showServers(handle, agent, comd, context, cb);
				break;
			case "connections":
				showConnections(handle, agent, app, comd, context, cb);
				break;
			case "logins":
				showLogins(handle, agent, app, comd, context, cb);
				break;
			case "modules":
				showModules(handle, agent, comd, context, cb);
				break;
			case "status":
				showStatus(handle, agent, comd, context, cb);
				break;
			case "config":
				showConfig(handle, agent, app, comd, context, param, cb);
				break;
			case "proxy":
				showProxy(handle, agent, app, comd, context, param, cb);
				break;
			case "handler":
				showHandler(handle, agent, app, comd, context, param, cb);
				break;
			case "components":
				showComponents(handle, agent, app, comd, context, param, cb);
				break;
			case "settings":
				showSettings(handle, agent, app, comd, context, param, cb);
				break;
			case "cpu":
				dumpCPU(handle, agent, comd, context, param, cb);
				break;
			case "memory":
				dumpMemory(handle, agent, comd, context, param, cb);
				break;
			case "get":
				getApp(handle, agent, app, comd, context, param, cb);
				break;
			case "set":
				setApp(handle, agent, app, comd, context, param, cb);
				break;
			case "enable":
				enableApp(handle, agent, app, comd, context, param, cb);
				break;
			case "disable":
				disableApp(handle, agent, app, comd, context, param, cb);
				break;
			case "run":
				runScript(handle, agent, app, comd, context, param, cb);
				break;
			default:
				showError(handle, agent, comd, context, cb);
		}
	}

	clientHandler(agent: MasterAgent & MonitorAgent, msg: any, cb: Function) {
		let comd = msg["comd"];
		let context = msg["context"];
		let param = msg["param"];
		let app = this.app; // master app

		if (!comd || !context) {
			cb("lack of comd or context param");
			return;
		}

		let handle = "client";
		switch (comd) {
			case "servers":
				showServers(handle, agent, comd, context, cb);
				break;
			case "connections":
				showConnections(handle, agent, app, comd, context, cb);
				break;
			case "logins":
				showLogins(handle, agent, app, comd, context, cb);
				break;
			case "modules":
				showModules(handle, agent, comd, context, cb);
				break;
			case "status":
				showStatus(handle, agent, comd, context, cb);
				break;
			case "config":
				showConfig(handle, agent, app, comd, context, param, cb);
				break;
			case "proxy":
				showProxy(handle, agent, app, comd, context, param, cb);
				break;
			case "handler":
				showHandler(handle, agent, app, comd, context, param, cb);
				break;
			case "components":
				showComponents(handle, agent, app, comd, context, param, cb);
				break;
			case "settings":
				showSettings(handle, agent, app, comd, context, param, cb);
				break;
			case "cpu":
				dumpCPU(handle, agent, comd, context, param, cb);
				break;
			case "memory":
				dumpMemory(handle, agent, comd, context, param, cb);
				break;
			case "get":
				getApp(handle, agent, app, comd, context, param, cb);
				break;
			case "set":
				setApp(handle, agent, app, comd, context, param, cb);
				break;
			case "enable":
				enableApp(handle, agent, app, comd, context, param, cb);
				break;
			case "disable":
				disableApp(handle, agent, app, comd, context, param, cb);
				break;
			case "run":
				runScript(handle, agent, app, comd, context, param, cb);
				break;
			default:
				showError(handle, agent, comd, context, cb);
		}
	}
}

function showServers(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	cb: Function
) {
	if (handle === "client") {
		let sid, record;
		let serverInfo: any = {};
		let count = utils.size(agent.idMap);
		let latch = countDownLatch.createCountDownLatch(count, function() {
			cb(null, {
				msg: serverInfo
			});
		});

		for (sid in agent.idMap) {
			record = agent.idMap[sid];
			agent.request(
				record.id,
				module.exports.moduleId,
				{
					comd: comd,
					context: context
				},
				(msg: any) => {
					serverInfo[msg.serverId] = msg.body;
					latch.done();
				}
			);
		}
	} else if (handle === "monitor") {
		let serverId = agent.id;
		let serverType = agent.type;
		let info = agent.info;
		let pid = process.pid;
		let heapUsed = (process.memoryUsage().heapUsed / (1000 * 1000)).toFixed(
			2
		);
		let uptime = (process.uptime() / 60).toFixed(2);
		cb({
			serverId: serverId,
			body: {
				serverId: serverId,
				serverType: serverType,
				host: info["host"],
				port: info["port"],
				pid: pid,
				heapUsed: heapUsed,
				uptime: uptime
			}
		});
	}
}

function showConnections(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			let sid, record;
			let serverInfo: any = {};
			let count = 0;
			for (let key in agent.idMap) {
				if (agent.idMap[key].info.frontend === "true") {
					count++;
				}
			}
			let latch = countDownLatch.createCountDownLatch(count, function() {
				cb(null, {
					msg: serverInfo
				});
			});

			for (sid in agent.idMap) {
				record = agent.idMap[sid];
				if (record.info.frontend === "true") {
					agent.request(
						record.id,
						module.exports.moduleId,
						{
							comd: comd,
							context: context
						},
						(msg: any) => {
							serverInfo[msg.serverId] = msg.body;
							latch.done();
						}
					);
				}
			}
		} else {
			let record = agent.idMap[context];
			if (!record) {
				cb("the server " + context + " not exist");
			}
			if (record.info.frontend === "true") {
				agent.request(
					record.id,
					module.exports.moduleId,
					{
						comd: comd,
						context: context
					},
					(msg: any) => {
						let serverInfo: any = {};
						serverInfo[msg.serverId] = msg.body;
						cb(null, {
							msg: serverInfo
						});
					}
				);
			} else {
				cb("\nthis command should be applied to frontend server\n");
			}
		}
	} else if (handle === "monitor") {
		let connection = app.components.__connection__;
		if (!connection) {
			cb({
				serverId: agent.id,
				body: "error"
			});
			return;
		}

		cb({
			serverId: agent.id,
			body: connection.getStatisticsInfo()
		});
	}
}

function showLogins(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	cb: Function
) {
	showConnections(handle, agent, app, comd, context, cb);
}

function showModules(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	cb: Function
) {
	let modules = agent.consoleService.modules;
	let result = [];
	for (let module in modules) {
		result.push(module);
	}
	cb(null, {
		msg: result
	});
}

function showStatus(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	cb: Function
) {
	if (handle === "client") {
		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, {
					msg: msg
				});
			}
		);
	} else if (handle === "monitor") {
		let serverId = agent.id;
		let pid = process.pid;
		let params = {
			serverId: serverId,
			pid: pid
		};
		monitor.psmonitor.getPsInfo(params, (err: any, data: any) => {
			cb(null, {
				serverId: agent.id,
				body: data
			});
		});
	}
}

function showConfig(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (param === "master") {
			cb(null, {
				masterConfig:
					app.get("masterConfig") || "no config to master in app.js",
				masterInfo: app.get("master")
			});
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let key = param + "Config";
		cb(null, clone(param, app.get(key)));
	}
}

function showProxy(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		proxyCb(app, context, cb);
	}
}

function showHandler(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		handlerCb(app, context, cb);
	}
}

function showComponents(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let _components = app.components;
		let res: any = {};
		for (let key in _components) {
			let name = getComponentName(key);
			res[name!] = clone(name, app.get(name + "Config"));
		}
		cb(null, res);
	}
}

function showSettings(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let _settings = app.settings;
		let res: any = {};
		for (let key in _settings) {
			if (key.match(/^__\w+__$/) || key.match(/\w+Config$/)) {
				continue;
			}
			if (!checkJSON(_settings[key])) {
				res[key] = "Object";
				continue;
			}
			res[key] = _settings[key];
		}
		cb(null, res);
	}
}

function dumpCPU(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(err, msg);
			}
		);
	} else if (handle === "monitor") {
		let times = param["times"];
		let filepath = param["filepath"];
		let force = param["force"];
		cb(null, "cpu dump is unused in 1.0 of pomelo");
		/**
		if (!/\.cpuprofile$/.test(filepath)) {
			filepath = filepath + '.cpuprofile';
		}
		if (!times || !/^[0-9]*[1-9][0-9]*$/.test(times)) {
			cb('no times or times invalid error');
			return;
		}
		checkFilePath(filepath, force, function(err) {
			if (err) {
				cb(err);
				return;
			}
			//ndump.cpu(filepath, times);
			cb(null, filepath + ' cpu dump ok');
		});
		*/
	}
}

function dumpMemory(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(err, msg);
			}
		);
	} else if (handle === "monitor") {
		let filepath = param["filepath"];
		let force = param["force"];
		if (!/\.heapsnapshot$/.test(filepath)) {
			filepath = filepath + ".heapsnapshot";
		}
		checkFilePath(filepath, force, (err: any) => {
			if (err) {
				cb(err);
				return;
			}
			let heapdump = null;
			try {
				heapdump = require("heapdump");
				heapdump.writeSnapshot(filepath);
				cb(null, filepath + " memory dump ok");
			} catch (e) {
				cb("pomelo-admin require heapdump");
			}
		});
	}
}

function getApp(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let res = app.get(param);
		if (!checkJSON(res)) {
			res = "object";
		}
		cb(null, res || null);
	}
}

function setApp(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let key = param["key"];
		let value = param["value"];
		app.set(key, value);
		cb(null, "set " + key + ":" + value + " ok");
	}
}

function enableApp(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		app.enable(param);
		cb(null, "enable " + param + " ok");
	}
}

function disableApp(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		app.disable(param);
		cb(null, "disable " + param + " ok");
	}
}

function runScript(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	app: any,
	comd: string,
	context: any,
	param: any,
	cb: Function
) {
	if (handle === "client") {
		if (context === "all") {
			cb("context error");
			return;
		}

		agent.request(
			context,
			module.exports.moduleId,
			{
				comd: comd,
				param: param,
				context: context
			},
			(err: any, msg: any) => {
				cb(null, msg);
			}
		);
	} else if (handle === "monitor") {
		let ctx = {
			app: app,
			result: null
		};
		try {
			vm.runInNewContext("result = " + param, ctx, <any>"myApp.vm");
			cb(null, util.inspect(ctx.result));
		} catch (e) {
			cb(null, e.stack);
		}
	}
}

function showError(
	handle: string,
	agent: MasterAgent & MonitorAgent,
	comd: string,
	context: any,
	cb: Function
) {}

function clone(param: any, obj: any) {
	let result: any = {};
	let flag = 1;
	for (let key in obj) {
		if (typeof obj[key] === "function" || typeof obj[key] === "object") {
			continue;
		}
		flag = 0;
		result[key] = obj[key];
	}
	if (flag) {
		// return 'no ' + param + 'Config info';
	}
	return result;
}

function checkFilePath(filepath: string, force: boolean, cb: Function) {
	if (!force && fs.existsSync(filepath)) {
		cb("filepath file exist");
		return;
	}
	fs.writeFile(filepath, "test", function(err) {
		if (err) {
			cb("filepath invalid error");
			return;
		}
		fs.unlinkSync(filepath);
		cb(null);
	});
}

function proxyCb(app: any, context: any, cb: Function) {
	let msg: any = {};
	let __proxy__ = app.components.__proxy__;
	if (__proxy__ && __proxy__.client && __proxy__.client.proxies.user) {
		let proxies = __proxy__.client.proxies.user;
		let server = app.getServerById(context);
		if (!server) {
			cb("no server with this id " + context);
		} else {
			let type = server["serverType"];
			let tmp = proxies[type];
			msg[type] = {};
			for (let _proxy in tmp) {
				let r = tmp[_proxy];
				msg[type][_proxy] = {};
				for (let _rpc in r) {
					if (typeof r[_rpc] === "function") {
						msg[type][_proxy][_rpc] = "function";
					}
				}
			}
			cb(null, msg);
		}
	} else {
		cb("no proxy loaded");
	}
}

function handlerCb(app: any, context: any, cb: Function) {
	let msg: any = {};
	let __server__ = app.components.__server__;
	if (
		__server__ &&
		__server__.server &&
		__server__.server.handlerService.handlers
	) {
		let handles = __server__.server.handlerService.handlers;
		let server = app.getServerById(context);
		if (!server) {
			cb("no server with this id " + context);
		} else {
			let type = server["serverType"];
			let tmp = handles;
			msg[type] = {};
			for (let _p in tmp) {
				let r = tmp[_p];
				msg[type][_p] = {};
				for (let _r in r) {
					if (typeof r[_r] === "function") {
						msg[type][_p][_r] = "function";
					}
				}
			}
			cb(null, msg);
		}
	} else {
		cb("no handler loaded");
	}
}

function getComponentName(c: string) {
	let t = c.match(/^__(\w+)__$/);
	let ret;
	if (t) {
		ret = t[1] as string;
	}
	return ret;
}

function checkJSON(obj: any) {
	if (!obj) {
		return true;
	}
	try {
		JSON.stringify(obj);
	} catch (e) {
		return false;
	}
	return true;
}
