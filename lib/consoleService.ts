const logger = require("pomelo-logger").getLogger(
	"pomelo-admin",
	"ConsoleService"
);
const schedule = require("pomelo-scheduler");
import protocol = require("./util/protocol");
import utils = require("./util/utils");
import util = require("util");
import { EventEmitter } from "events";
import { MonitorAgent, MonitorAgentOpts } from './monitor/monitorAgent';
import { MasterAgent, MasterAgentOpts } from "./master/masterAgent";
import { ModuleRecord, ServerInfo } from '../index';

const MS_OF_SECOND = 1000;

export interface ConsoleServiceOpts {
	id?:string;
	type?:string;
	env?:string;
    master?:boolean;
    host?:string;
    port:number;
	info?:ServerInfo;
	authServer?:(msg: any, env: string, cb: Function)=>void;
	authUser?:(msg: any, env: string, cb: Function)=>void;
}

export class ConsoleService extends EventEmitter {
	private port: number;
	private env?: string;
	private values: { [idx: string]: any };
	readonly master?: boolean;
	readonly modules: { [idx: string]: ModuleRecord };
	private commands = {
		list: listCommand,
		enable: enableCommand,
		disable: disableCommand
	};
	private authServer: (msg: any, env: string, cb: Function) => void;
	private authUser? = utils.defaultAuthUser;
	readonly agent: MasterAgent & MonitorAgent;

	private type?: string;
	private id?: string;
	private host?: string;
	/**
	 * ConsoleService Constructor
	 *
	 * @class ConsoleService
	 * @constructor
	 * @param {Object} opts construct parameter
	 *                 opts.type 	{String} server type, 'master', 'connector', etc.
	 *                 opts.id 		{String} server id
	 *                 opts.host 	{String} (monitor only) master server host
	 *                 opts.port 	{String | Number} listen port for master or master port for monitor
	 *                 opts.master  {Boolean} current service is master or monitor
	 *                 opts.info 	{Object} more server info for current server, {id, serverType, host, port}
	 * @api public
	 */
	constructor(opts: ConsoleServiceOpts) {
		super();
		this.port = opts.port;
		this.env = opts.env;
		this.values = {};
		this.master = opts.master;

		this.modules = {};

		if (this.master) {
			this.authUser = opts.authUser || utils.defaultAuthUser;
			this.authServer = opts.authServer || utils.defaultAuthServerMaster;
			this.agent = <any>new MasterAgent(this, opts as MasterAgentOpts);
		} else {
			this.type = opts.type;
			this.id = opts.id;
			this.host = opts.host;
			this.authServer = opts.authServer || utils.defaultAuthServerMonitor;
			this.agent = <any>new MonitorAgent({
				consoleService: this,
				id: this.id as string,
				type: this.type as string,
				info: opts.info as ServerInfo,
			});
		}
	}

	/**
	 * start master or monitor
	 *
	 * @param {Function} cb callback function
	 * @api public
	 */
	start(cb: Function) {
		if (this.master) {
			this.agent.listen(this.port, (err: any) => {
				if (!!err) {
					utils.invokeCallback(cb, err);
					return;
				}

				exportEvent(this, this.agent, "register");
				exportEvent(this, this.agent, "disconnect");
				exportEvent(this, this.agent, "reconnect");
				process.nextTick(function() {
					utils.invokeCallback(cb);
				});
			});
		} else {
			logger.info(
				"try to connect master: %j, %j, %j",
				this.type,
				this.host,
				this.port
			);
			this.agent.connect(this.port, this.host!, cb);
			exportEvent(this, this.agent, "close");
		}

		exportEvent(this, this.agent, "error");

		for (let mid in this.modules) {
			this.enable(mid);
		}
	}

	/**
	 * stop console modules and stop master server
	 *
	 * @api public
	 */
	stop() {
		for (let mid in this.modules) {
			this.disable(mid);
		}
		this.agent.close();
	}

	/**
	 * register a new adminConsole module
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @param {Object} module module object
	 * @api public
	 */
	register(moduleId: string, module: any) {
		this.modules[moduleId] = registerRecord(this, moduleId, module);
	}

	/**
	 * enable adminConsole module
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @api public
	 */
	enable(moduleId: string) {
		let record = this.modules[moduleId];
		if (record && !record.enable) {
			record.enable = true;
			addToSchedule(this, record);
			return true;
		}
		return false;
	}

	/**
	 * disable adminConsole module
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @api public
	 */
	disable(moduleId: string) {
		let record = this.modules[moduleId];
		if (record && record.enable) {
			record.enable = false;
			if (record.schedule && record.jobId) {
				schedule.cancelJob(record.jobId);
				schedule.jobId = null;
			}
			return true;
		}
		return false;
	}

	/**
	 * call concrete module and handler(monitorHandler,masterHandler,clientHandler)
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @param {String} method handler
	 * @param {Object} msg message
	 * @param {Function} cb callback function
	 * @api public
	 */
	execute(moduleId: string, method: string, msg: any, cb: Function) {
		let m = this.modules[moduleId];
		if (!m) {
			logger.error("unknown module: %j.", moduleId);
			cb("unknown moduleId:" + moduleId);
			return;
		}

		if (!m.enable) {
			logger.error("module %j is disable.", moduleId);
			cb("module " + moduleId + " is disable");
			return;
		}

		let module = m.module;
		if (!module || typeof module[method] !== "function") {
			logger.error(
				"module %j dose not have a method called %j.",
				moduleId,
				method
			);
			cb(
				"module " +
					moduleId +
					" dose not have a method called " +
					method
			);
			return;
		}

		let log = {
			action: "execute",
			moduleId: moduleId,
			method: method,
			msg: msg,
			error: null as any
		};

		let aclMsg = aclControl(this.agent, "execute", method, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1) {
			log["error"] = aclMsg;
			this.emit("admin-log", log, aclMsg);
			cb(new Error(aclMsg as string), null);
			return;
		}

		if (method === "clientHandler") {
			this.emit("admin-log", log);
		}

		module[method](this.agent, msg, cb);
	}

	command(command: string, moduleId: string, msg: any, cb: Function) {
		let fun: Function = (<any>this.commands)[command];
		if (!fun || typeof fun !== "function") {
			cb("unknown command:" + command);
			return;
		}

		let log = {
			action: "command",
			moduleId: moduleId,
			msg: msg,
			error: null as any
		};

		let aclMsg = aclControl(this.agent, "command", null!, moduleId, msg);
		if (aclMsg !== 0 && aclMsg !== 1) {
			log["error"] = aclMsg;
			this.emit("admin-log", log, aclMsg);
			cb(new Error(aclMsg as string), null);
			return;
		}

		this.emit("admin-log", log);
		fun(this, moduleId, msg, cb);
	}

	/**
	 * set module data to a map
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @param {Object} value module data
	 * @api public
	 */

	set(moduleId: string, value: any) {
		this.values[moduleId] = value;
	}

	/**
	 * get module data from map
	 *
	 * @param {String} moduleId adminConsole id/name
	 * @api public
	 */
	get(moduleId: string) {
		return this.values[moduleId];
	}
}
/**
 * register a module service
 *
 * @param {Object} service consoleService object
 * @param {String} moduleId adminConsole id/name
 * @param {Object} module module object
 * @api private
 */
function registerRecord(
	service: ConsoleService,
	moduleId: string,
	module: any
) {
	let record: ModuleRecord = {
		moduleId: moduleId,
		module: module,
		enable: false
	};

	if (module.type && module.interval) {
		if (
			(!service.master && record.module.type === "push") ||
			(service.master && record.module.type !== "push")
		) {
			// push for monitor or pull for master(default)
			record.delay = module.delay || 0;
			record.interval = module.interval || 1;
			// normalize the arguments
			if (record.delay! < 0) {
				record.delay = 0;
			}
			if (record.interval! < 0) {
				record.interval = 1;
			}
			record.interval = Math.ceil(record.interval!);
			record.delay! *= MS_OF_SECOND;
			record.interval *= MS_OF_SECOND;
			record.schedule = true;
		}
	}

	return record;
}

/**
 * schedule console module
 *
 * @param {Object} service consoleService object
 * @param {Object} record  module object
 * @api private
 */
function addToSchedule(service: ConsoleService, record: ModuleRecord) {
	if (record && record.schedule) {
		record.jobId = schedule.scheduleJob(
			{
				start: Date.now() + record.delay!,
				period: record.interval
			},
			doScheduleJob,
			{
				service: service,
				record: record
			}
		);
	}
}

/**
 * run schedule job
 *
 * @param {Object} args argments
 * @api private
 */
function doScheduleJob(args: any) {
	let service = args.service;
	let record = args.record;
	if (!service || !record || !record.module || !record.enable) {
		return;
	}

	if (service.master) {
		record.module.masterHandler(service.agent, null, (err: any) => {
			logger.error("interval push should not have a callback.");
		});
	} else {
		record.module.monitorHandler(service.agent, null, (err: any) => {
			logger.error("interval push should not have a callback.");
		});
	}
}

/**
 * export closure function out
 *
 * @param {Function} outer outer function
 * @param {Function} inner inner function
 * @param {object} event
 * @api private
 */
function exportEvent(
	outer: ConsoleService,
	inner: MasterAgent & MonitorAgent,
	event: string
) {
	inner.on(event, function() {
		let args = Array.prototype.slice.call(arguments, 0);
		args.unshift(event);
		outer.emit.apply(outer, args);
	});
}

/**
 * List current modules
 */
function listCommand(
	consoleService: ConsoleService,
	moduleId: string,
	msg: any,
	cb: Function
) {
	let modules = consoleService.modules;

	let result = [];
	for (let moduleId in modules) {
		if (/^__\w+__$/.test(moduleId)) {
			continue;
		}

		result.push(moduleId);
	}

	cb(null, {
		modules: result
	});
}

/**
 * enable module in current server
 */
function enableCommand(
	consoleService: ConsoleService,
	moduleId: string,
	msg: any,
	cb: Function
) {
	if (!moduleId) {
		logger.error("fail to enable admin module for " + moduleId);
		cb("empty moduleId");
		return;
	}

	let modules = consoleService.modules;
	if (!modules[moduleId]) {
		cb(null, protocol.PRO_FAIL);
		return;
	}

	if (consoleService.master) {
		consoleService.enable(moduleId);
		consoleService.agent.notifyCommand("enable", moduleId, msg);
		cb(null, protocol.PRO_OK);
	} else {
		consoleService.enable(moduleId);
		cb(null, protocol.PRO_OK);
	}
}

/**
 * disable module in current server
 */
function disableCommand(
	consoleService: ConsoleService,
	moduleId: string,
	msg: any,
	cb: Function
) {
	if (!moduleId) {
		logger.error("fail to enable admin module for " + moduleId);
		cb("empty moduleId");
		return;
	}

	let modules = consoleService.modules;
	if (!modules[moduleId]) {
		cb(null, protocol.PRO_FAIL);
		return;
	}

	if (consoleService.master) {
		consoleService.disable(moduleId);
		consoleService.agent.notifyCommand("disable", moduleId, msg);
		cb(null, protocol.PRO_OK);
	} else {
		consoleService.disable(moduleId);
		cb(null, protocol.PRO_OK);
	}
}

function aclControl(
	agent: MasterAgent & MonitorAgent,
	action: string,
	method: string,
	moduleId: string,
	msg: any
) {
	if (action === "execute") {
		if (method !== "clientHandler" || moduleId !== "__console__") {
			return 0;
		}

		let signal = msg.signal;
		if (
			!signal ||
			!(signal === "stop" || signal === "add" || signal === "kill")
		) {
			return 0;
		}
	}

	let clientId = msg.clientId;
	if (!clientId) {
		return "Unknow clientId";
	}

	let _client = agent.getClientById(clientId);
	if (_client && _client.info && _client.info.level) {
		let level = _client.info.level;
		if (level > 1) {
			return "Command permission denied";
		}
	} else {
		return "Client info error";
	}
	return 1;
}

/**
 * Create master ConsoleService
 *
 * @param {Object} opts construct parameter
 *                      opts.port {String | Number} listen port for master console
 */
export function createMasterConsole(opts: any) {
	opts = opts || {};
	opts.master = true;
	return new ConsoleService(opts);
}

/**
 * Create monitor ConsoleService
 *
 * @param {Object} opts construct parameter
 *                      opts.type {String} server type, 'master', 'connector', etc.
 *                      opts.id {String} server id
 *                      opts.host {String} master server host
 *                      opts.port {String | Number} master port
 */
export function createMonitorConsole(opts: any) {
	return new ConsoleService(opts);
}
