import { S_IFBLK } from 'constants';
import MqttCon = require('mqtt-connection');
import fs = require('fs');
import { MonitorAgent } from "./lib/monitor/monitorAgent";
import { MasterAgent } from "./lib/master/masterAgent";
var consoleService = require("./lib/consoleService");

export interface ServerInfo {
	id: string;
	serverType: string;
	host: string;
	port: number;
	socket?: MqttCon;
}

export interface MqttPacket {
	cmd: string;
	retain: boolean;
	qos: number;
	dup: boolean;
	length: number;
	topic: string;
	payload: any;
}

export interface SlaveRecord {
	id: string;
	type: string;
	pid: number;
	host?: string;
	port?: number;
	info: ServerInfo;
	socket: MqttCon;
}

export interface ModuleRecord {
	moduleId: string;
	module: any;
	enable: boolean;
	delay?: number;
	schedule?: boolean;
	type?: string;
	interval?: number;
	jobId?: number;
}

export interface Module {
	monitorHandler: (agent: MonitorAgent, msg: any, cb: Function) => void;
	clientHandler: (agent: MasterAgent, msg: any, cb: Function) => void;
	masterHandler?: (agent: MasterAgent, msg: any, cb: Function) => void;
}

export const createMasterConsole = consoleService.createMasterConsole;
export const createMonitorConsole = consoleService.createMonitorConsole;
export const adminClient = require("./lib/client/client");

export interface Modules {
	monitorLog: Module;
	nodeInfo: Module;
	profiler: Module;
	scripts: Module;
	systemInfo: Module;
	watchServer: Module;
}

export const modules: Modules = <any>{};

fs.readdirSync(__dirname + "/lib/modules").forEach(filename => {
	if (/\.js$/.test(filename)) {
		var name = filename.substr(0, filename.lastIndexOf("."));
		var _module = require("./lib/modules/" + name);
		if (!_module.moduleError) {
			(<any>modules).__defineGetter__(name, () => {
				return _module;
			});
		}
	}
});
