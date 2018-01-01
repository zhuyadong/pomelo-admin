import { MqttServer } from "../protocol/mqtt/mqttServer";

const logger = require("pomelo-logger").getLogger(
	"pomelo-admin",
	"MasterAgent"
);
import MqttCon = require("mqtt-connection");
import protocol = require("../util/protocol");
import utils = require("../util/utils");
import Util = require("util");
import { EventEmitter } from "events";
import { MasterSocket } from "./masterSocket";
import { ServerInfo, SlaveRecord } from "../../index";
import { MonitorAgent } from "../monitor/monitorAgent";
import { MqttClient } from "../protocol/mqtt/mqttClient";
import { ConsoleService } from '../consoleService';

let ST_INITED = 1;
let ST_STARTED = 2;
let ST_CLOSED = 3;

export interface MasterAgentOpts {
	id: string;
	type: string;
	whitelist?:any;
}

export class MasterAgent extends EventEmitter {
	readonly idMap: { [idx: string]: any } = {};
	readonly msgMap: { [idx: string]: any };
	readonly typeMap: { [idx: string]: any[] };
	readonly clients: { [idx: string]: any }; //TODO
	readonly sockets: { [idx: string]: MqttCon };
	readonly slaveMap: { [idx: string]: SlaveRecord[] };
	readonly callbacks: { [idx: string]: Function };
	readonly whitelist: any;
	private server: MqttServer;
	private state = ST_INITED;
	private reqId: number;
	/**
	 * MasterAgent Constructor
	 *
	 * @class MasterAgent
	 * @constructor
	 * @param {Object} opts construct parameter
	 *                 opts.consoleService {Object} consoleService
	 *                 opts.id             {String} server id
	 *                 opts.type           {String} server type, 'master', 'connector', etc.
	 *                 opts.socket         {Object} socket-io object
	 *                 opts.reqId          {Number} reqId add by 1
	 *                 opts.callbacks      {Object} callbacks
	 *                 opts.state          {Number} MasterAgent state
	 * @api public
	 */
	constructor(readonly consoleService: any, opts: MasterAgentOpts) {
		super();
		this.reqId = 1;
		this.idMap = {};
		this.msgMap = {};
		this.typeMap = {};
		this.clients = {};
		this.sockets = {};
		this.slaveMap = {};
		this.server = <any>null;
		this.callbacks = {};
		this.state = ST_INITED;
		this.whitelist = opts.whitelist;
	}

	/**
	 * master listen to a port and handle register and request
	 *
	 * @param {String} port
	 * @api public
	 */
	listen(port: number, cb: Function) {
		if (this.state > ST_INITED) {
			logger.error("master agent has started or closed.");
			return;
		}

		this.state = ST_STARTED;
		this.server = new MqttServer();
		this.server.listen(port);
		// this.server = sio.listen(port);
		// this.server.set('log level', 0);

		cb = cb || function() {};

		let self = this;
		this.server.on("error", function(err) {
			self.emit("error", err);
			cb(err);
		});

		this.server.once("listening", function() {
			setImmediate(function() {
				cb();
			});
		});

		this.server.on("connection", (socket: MqttCon) => {
			// let id, type, info, registered, username;
			let masterSocket = new MasterSocket();
			masterSocket["agent"] = self;
			masterSocket["socket"] = socket;

			self.sockets[socket.id] = socket;

			socket.on("register", function(msg) {
				// register a new connection
				masterSocket.onRegister(msg);
			}); // end of on 'register'

			// message from monitor
			socket.on("monitor", function(msg) {
				masterSocket.onMonitor(msg);
			}); // end of on 'monitor'

			// message from client
			socket.on("client", function(msg) {
				masterSocket.onClient(msg);
			}); // end of on 'client'

			socket.on("reconnect", function(msg) {
				masterSocket.onReconnect(msg);
			});

			socket.on("disconnect", function() {
				masterSocket.onDisconnect();
			});

			socket.on("close", function() {
				masterSocket.onDisconnect();
			});

			socket.on("error", function(err) {
				masterSocket.onError(err);
			});
		}); // end of on 'connection'
	} // end of listen

	/**
	 * close master agent
	 *
	 * @api public
	 */
	close() {
		if (this.state > ST_STARTED) {
			return;
		}
		this.state = ST_CLOSED;
		this.server.close();
	}

	/**
	 * set module
	 *
	 * @param {String} moduleId module id/name
	 * @param {Object} value module object
	 * @api public
	 */
	set(moduleId: string, value: any) {
		this.consoleService.set(moduleId, value);
	}

	/**
	 * get module
	 *
	 * @param {String} moduleId module id/name
	 * @api public
	 */
	get(moduleId: string) {
		return this.consoleService.get(moduleId);
	}

	/**
	 * getClientById
	 *
	 * @param {String} clientId
	 * @api public
	 */
	getClientById(clientId: string) {
		return this.clients[clientId];
	}

	/**
	 * request monitor{master node} data from monitor
	 *
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @param {Function} callback function
	 * @api public
	 */
	request(serverId: string, moduleId: string, msg: any, cb: Function) {
		if (this.state > ST_STARTED) {
			return false;
		}

		cb = cb || function() {};

		let curId = this.reqId++;
		this.callbacks[curId] = cb;

		if (!this.msgMap[serverId]) {
			this.msgMap[serverId] = {};
		}

		this.msgMap[serverId][curId] = {
			moduleId: moduleId,
			msg: msg
		};

		let record = this.idMap[serverId];
		if (!record) {
			cb(new Error("unknown server id:" + serverId));
			return false;
		}

		sendToMonitor(record.socket, curId, moduleId, msg);

		return true;
	}

	/**
	 * request server data from monitor by serverInfo{host:port}
	 *
	 * @param {String} serverId
	 * @param {Object} serverInfo
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @param {Function} callback function
	 * @api public
	 */
	requestServer(
		serverId: string,
		serverInfo: ServerInfo,
		moduleId: string,
		msg: any,
		cb: Function
	) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let record = this.idMap[serverId];
		if (!record) {
			utils.invokeCallback(
				cb,
				new Error("unknown server id:" + serverId)
			);
			return false;
		}

		let curId = this.reqId++;
		this.callbacks[curId] = cb;

		if (utils.compareServer(record, serverInfo)) {
			sendToMonitor(record.socket, curId, moduleId, msg);
		} else {
			let slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++) {
				if (utils.compareServer(slaves[i], serverInfo)) {
					sendToMonitor(slaves[i].socket, curId, moduleId, msg);
					break;
				}
			}
		}

		return true;
	}

	/**
	 * notify a monitor{master node} by id without callback
	 *
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifyById(serverId: string, moduleId: string, msg: any) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let record = this.idMap[serverId];
		if (!record) {
			logger.error(
				"fail to notifyById for unknown server id:" + serverId
			);
			return false;
		}

		sendToMonitor(record.socket, null!, moduleId, msg);

		return true;
	}

	/**
	 * notify a monitor by server{host:port} without callback
	 *
	 * @param {String} serverId
	 * @param {Object} serverInfo{host:port}
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifyByServer(
		serverId: string,
		serverInfo: ServerInfo,
		moduleId: string,
		msg: any
	) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let record = this.idMap[serverId];
		if (!record) {
			logger.error(
				"fail to notifyByServer for unknown server id:" + serverId
			);
			return false;
		}

		if (utils.compareServer(record, serverInfo)) {
			sendToMonitor(record.socket, null!, moduleId, msg);
		} else {
			let slaves = this.slaveMap[serverId];
			for (let i = 0, l = slaves.length; i < l; i++) {
				if (utils.compareServer(slaves[i], serverInfo)) {
					sendToMonitor(slaves[i].socket, null!, moduleId, msg);
					break;
				}
			}
		}
		return true;
	}

	/**
	 * notify slaves by id without callback
	 *
	 * @param {String} serverId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifySlavesById(serverId: string, moduleId: string, msg: any) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let slaves = this.slaveMap[serverId];
		if (!slaves || slaves.length === 0) {
			logger.error(
				"fail to notifySlavesById for unknown server id:" + serverId
			);
			return false;
		}

		broadcastMonitors(slaves, moduleId, msg);
		return true;
	}

	/**
	 * notify monitors by type without callback
	 *
	 * @param {String} type serverType
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifyByType(type: string, moduleId: string, msg: any) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let list = this.typeMap[type];
		if (!list || list.length === 0) {
			logger.error(
				"fail to notifyByType for unknown server type:" + type
			);
			return false;
		}
		broadcastMonitors(list, moduleId, msg);
		return true;
	}

	/**
	 * notify all the monitors without callback
	 *
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifyAll(moduleId: string, msg?: any) {
		if (this.state > ST_STARTED) {
			return false;
		}
		broadcastMonitors(this.idMap, moduleId, msg);
		return true;
	}

	/**
	 * notify a client by id without callback
	 *
	 * @param {String} clientId
	 * @param {String} moduleId module id/name
	 * @param {Object} msg
	 * @api public
	 */
	notifyClient(clientId: string, moduleId: string, msg: any) {
		if (this.state > ST_STARTED) {
			return false;
		}

		let record = this.clients[clientId];
		if (!record) {
			logger.error(
				"fail to notifyClient for unknown client id:" + clientId
			);
			return false;
		}
		sendToClient(record.socket, null!, moduleId, msg);
	}

	notifyCommand(command: string, moduleId: string, msg: any) {
		if (this.state > ST_STARTED) {
			return false;
		}
		broadcastCommand(this.idMap, command, moduleId, msg);
		return true;
	}

	doAuthUser(msg: any, socket: MqttCon, cb: Function) {
		if (!msg.id) {
			// client should has a client id
			return cb(new Error("client should has a client id"));
		}

		let username = msg.username;
		if (!username) {
			// client should auth with username
			doSend(socket, "register", {
				code: protocol.PRO_FAIL,
				msg: "client should auth with username"
			});
			return cb(new Error("client should auth with username"));
		}

		let authUser = this.consoleService.authUser;
		let env = this.consoleService.env;
		authUser(msg, env, (user: any) => {
			if (!user) {
				// client should auth with username
				doSend(socket, "register", {
					code: protocol.PRO_FAIL,
					msg: "client auth failed with username or password error"
				});
				return cb(
					new Error(
						"client auth failed with username or password error"
					)
				);
			}

			if (this.clients[msg.id]) {
				doSend(socket, "register", {
					code: protocol.PRO_FAIL,
					msg: "id has been registered. id:" + msg.id
				});
				return cb(new Error("id has been registered. id:" + msg.id));
			}

			logger.info("client user : " + username + " login to master");
			this.addConnection(msg.id, msg.type, null!, user, socket);
			this.doSend(socket, "register", {
				code: protocol.PRO_OK,
				msg: "ok"
			});

			cb();
		});
	}

	doAuthServer(msg: any, socket: MqttCon, cb: Function) {
		let self = this;
		let authServer = self.consoleService.authServer;
		let env = self.consoleService.env;
		authServer(msg, env, (status: any) => {
			if (status !== "ok") {
				doSend(socket, "register", {
					code: protocol.PRO_FAIL,
					msg: "server auth failed"
				});
				cb(new Error("server auth failed"));
				return;
			}

			let record = addConnection(
				self,
				msg.id,
				msg.serverType,
				msg.pid,
				msg.info,
				socket
			);

			doSend(socket, "register", {
				code: protocol.PRO_OK,
				msg: "ok"
			});
			msg.info = msg.info || {};
			msg.info.pid = msg.pid;
			self.emit("register", msg.info);
			cb(null);
		});
	}

	doSend(socket: MqttCon, topic: string, msg: any) {
		doSend(socket, topic, msg);
	}

	sendToMonitor(socket: MqttCon, reqId: number, moduleId: string, msg: any) {
		sendToMonitor(socket, reqId, moduleId, msg);
	}

	addConnection(
		id: string,
		type: string,
		pid: number,
		info: ServerInfo,
		socket: MqttCon
	) {
		addConnection(this, id, type, pid, info, socket);
	}

	removeConnection(id: string, type: string, info: ServerInfo) {
		removeConnection(this, id, type, info);
	}
}

/**
 * add monitor,client to connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @param {Object} socket socket-io object
 * @api private
 */
function addConnection(
	agent: MasterAgent,
	id: string,
	type: string,
	pid: number,
	info: ServerInfo,
	socket: MqttCon
) {
	let record = {
		id: id,
		type: type,
		pid: pid,
		info: info,
		socket: socket
	};
	if (type === "client") {
		agent.clients[id] = record;
	} else {
		if (!agent.idMap[id]) {
			agent.idMap[id] = record;
			let list = (agent.typeMap[type] = agent.typeMap[type] || []);
			list.push(record);
		} else {
			let slaves = (agent.slaveMap[id] = agent.slaveMap[id] || []);
			slaves.push(record);
		}
	}
	return record;
}

/**
 * remove monitor,client connection -- idMap
 *
 * @param {Object} agent agent object
 * @param {String} id
 * @param {String} type serverType
 * @api private
 */
function removeConnection(
	agent: MasterAgent,
	id: string,
	type: string,
	info: ServerInfo
) {
	if (type === "client") {
		delete (<any>agent).clients[id];
	} else {
		// remove master node in idMap and typeMap
		let record = agent.idMap[id];
		if (!record) {
			return;
		}
		let _info = record["info"]; // info {host, port}
		if (utils.compareServer(_info, info)) {
			delete agent.idMap[id];
			let list = agent.typeMap[type];
			if (list) {
				for (let i = 0, l = list.length; i < l; i++) {
					if (list[i].id === id) {
						list.splice(i, 1);
						break;
					}
				}
				if (list.length === 0) {
					delete agent.typeMap[type];
				}
			}
		} else {
			// remove slave node in slaveMap
			let slaves = agent.slaveMap[id];
			if (slaves) {
				for (let i = 0, l = slaves.length; i < l; i++) {
					if (utils.compareServer(slaves[i]["info"], info)) {
						slaves.splice(i, 1);
						break;
					}
				}
				if (slaves.length === 0) {
					delete agent.slaveMap[id];
				}
			}
		}
	}
}
/**
 * send msg to monitor
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToMonitor(
	socket: MqttCon,
	reqId: number,
	moduleId: string,
	msg: any
) {
	doSend(socket, "monitor", protocol.composeRequest(reqId, moduleId, msg));
}

/**
 * send msg to client
 *
 * @param {Object} socket socket-io object
 * @param {Number} reqId request id
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function sendToClient(
	socket: MqttCon,
	reqId: number,
	moduleId: string,
	msg: any
) {
	doSend(socket, "client", protocol.composeRequest(reqId, moduleId, msg));
}

function doSend(socket: MqttCon, topic: string, msg: any) {
	socket.send(topic, msg);
}

/**
 * broadcast msg to monitor
 *
 * @param {Object} record registered modules
 * @param {String} moduleId module id/name
 * @param {Object} msg message
 * @api private
 */
function broadcastMonitors(records: any, moduleId: string, msg: any) {
	msg = protocol.composeRequest(null!, moduleId, msg);

	if (records instanceof Array) {
		for (let i = 0, l = records.length; i < l; i++) {
			let socket = records[i].socket;
			doSend(socket, "monitor", msg);
		}
	} else {
		for (let id in records) {
			let socket: any = records[id].socket;
			doSend(socket, "monitor", msg);
		}
	}
}

function broadcastCommand(
	records: any,
	command: string,
	moduleId: string,
	msg: any
) {
	msg = protocol.composeCommand(null!, command, moduleId, msg);

	if (records instanceof Array) {
		for (let i = 0, l = records.length; i < l; i++) {
			let socket = records[i].socket;
			doSend(socket, "monitor", msg);
		}
	} else {
		for (let id in records) {
			let socket = records[id].socket;
			doSend(socket, "monitor", msg);
		}
	}
}
