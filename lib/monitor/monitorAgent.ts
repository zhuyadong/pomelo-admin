const logger = require("pomelo-logger").getLogger(
	"pomelo-admin",
	"MonitorAgent"
);
import protocol = require("../util/protocol");
import utils = require("../util/utils");
import Util = require("util");
import { EventEmitter } from "events";
import { MqttClient } from "../protocol/mqtt/mqttClient";
import { ServerInfo } from "../../index";
import { ConsoleService } from "../consoleService";

const ST_INITED = 1;
const ST_CONNECTED = 2;
const ST_REGISTERED = 3;
const ST_CLOSED = 4;
const STATUS_INTERVAL = 5 * 1000; // 60 seconds

export interface MonitorAgentOpts {
	id?: string;
	type?: string;
	info: ServerInfo;
	consoleService: ConsoleService; //TODO
}

export class MonitorAgent extends EventEmitter {
	private reqId: number;
	readonly id: string;
	private socket: MqttClient;
	private callbacks: { [idx: string]: Function };
	readonly type: string;
	readonly info: ServerInfo;
	private state: number;
	readonly consoleService: any;

	/**
	 * MonitorAgent Constructor
	 *
	 * @class MasterAgent
	 * @constructor
	 * @param {Object} opts construct parameter
	 *                 opts.consoleService {Object} consoleService
	 *                 opts.id             {String} server id
	 *                 opts.type           {String} server type, 'master', 'connector', etc.
	 *                 opts.info           {Object} more server info for current server, {id, serverType, host, port}
	 * @api public
	 */
	constructor(private opts: MonitorAgentOpts) {
		super();
		this.reqId = 1;
		this.id = opts.id;
		this.socket = <any>null;
		this.callbacks = {};
		this.type = opts.type;
		this.info = opts.info;
		this.state = ST_INITED;
		this.consoleService = opts.consoleService;
	}

	/**
	 * register and connect to master server
	 *
	 * @param {String} port
	 * @param {String} host
	 * @param {Function} cb callback function
	 * @api public
	 */
	connect(port: number, host: string, cb: Function) {
		if (this.state > ST_INITED) {
			logger.error("monitor client has connected or closed.");
			return;
		}

		cb = cb || function() {};

		this.socket = new MqttClient(this.opts);
		this.socket.connect(host, port);

		// this.socket = sclient.connect(host + ':' + port, {
		//   'force new connection': true,
		//   'reconnect': true,
		//   'max reconnection attempts': 20
		// });
		this.socket.on("register", (msg: any) => {
			if (msg && msg.code === protocol.PRO_OK) {
				this.state = ST_REGISTERED;
				cb();
			} else {
				this.emit("close");
				logger.error(
					"server %j %j register master failed",
					this.id,
					this.type
				);
			}
		});

		this.socket.on("monitor", msg => {
			if (this.state !== ST_REGISTERED) {
				return;
			}

			msg = protocol.parse(msg);

			if (msg.command) {
				// a command from master
				this.consoleService.command(
					msg.command,
					msg.moduleId,
					msg.body,
					(err: any, res: any) => {
						//notify should not have a callback
					}
				);
			} else {
				let respId = msg.respId;
				if (respId) {
					// a response from monitor
					let respCb = this.callbacks[respId];
					if (!respCb) {
						logger.warn("unknown resp id:" + respId);
						return;
					}
					delete this.callbacks[respId];
					respCb(msg.error, msg.body);
					return;
				}

				// request from master
				this.consoleService.execute(
					msg.moduleId,
					"monitorHandler",
					msg.body,
					(err: any, res: any) => {
						if (protocol.isRequest(msg)) {
							let resp = protocol.composeResponse(msg, err, res);
							if (resp) {
								this.doSend("monitor", resp);
							}
						} else {
							//notify should not have a callback
							logger.error("notify should not have a callback.");
						}
					}
				);
			}
		});

		this.socket.on("connect", () => {
			if (this.state > ST_INITED) {
				//ignore reconnect
				return;
			}
			this.state = ST_CONNECTED;
			let req = {
				id: this.id,
				type: "monitor",
				serverType: this.type,
				pid: process.pid,
				info: this.info,
				token: null
			};
			let authServer = this.consoleService.authServer;
			let env = this.consoleService.env;
			authServer(req, env, (token: any) => {
				req["token"] = token;
				this.doSend("register", req);
			});
		});

		this.socket.on("error", (err: any) => {
			if (this.state < ST_CONNECTED) {
				// error occurs during connecting stage
				cb(err);
			} else {
				this.emit("error", err);
			}
		});

		this.socket.on("disconnect", (reason: any) => {
			this.state = ST_CLOSED;
			this.emit("close");
		});

		this.socket.on("reconnect", () => {
			this.state = ST_CONNECTED;
			let req = {
				id: this.id,
				type: "monitor",
				info: this.info,
				pid: process.pid,
				serverType: this.type
			};

			this.doSend("reconnect", req);
		});

		this.socket.on("reconnect_ok", (msg: any) => {
			if (msg && msg.code === protocol.PRO_OK) {
				this.state = ST_REGISTERED;
			}
		});
	}

	/**
	 * close monitor agent
	 *
	 * @api public
	 */
	close() {
		if (this.state >= ST_CLOSED) {
			return;
		}
		this.state = ST_CLOSED;
		this.socket.disconnect();
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
	 * notify master server without callback
	 *
	 * @param {String} moduleId module id/name
	 * @param {Object} msg message
	 * @api public
	 */
	notify(moduleId: string, msg: any) {
		if (this.state !== ST_REGISTERED) {
			logger.error("agent can not notify now, state:" + this.state);
			return;
		}
		this.doSend("monitor", protocol.composeRequest(null!, moduleId, msg));
		// this.socket.emit('monitor', protocol.composeRequest(null, moduleId, msg));
	}

	request(moduleId: string, msg: any, cb: Function) {
		if (this.state !== ST_REGISTERED) {
			logger.error("agent can not request now, state:" + this.state);
			return;
		}
		let reqId = this.reqId++;
		this.callbacks[reqId] = cb;
		this.doSend("monitor", protocol.composeRequest(reqId, moduleId, msg));
		// this.socket.emit('monitor', protocol.composeRequest(reqId, moduleId, msg));
	}

	doSend(topic: string, msg: any) {
		this.socket.send(topic, msg);
	}
}
