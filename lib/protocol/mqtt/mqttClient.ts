const logger = require("pomelo-logger").getLogger("pomelo-admin", "MqttClient");
import constants = require("../../util/constants");
import MqttCon = require("mqtt-connection");
import Util = require("util");
import net = require("net");
import { EventEmitter } from "events";

export class MqttClient extends EventEmitter {
	private clientId: string;
	private id: string;
	private requests: any;
	private connectedTimes: number;
	private host: string;
	private port: number;
	private socket: MqttCon;
	private lastPing: number;
	private lastPong: number;
	private closed: boolean;
	private timeoutId: NodeJS.Timer;
	private connected: boolean;
	private reconnectId: NodeJS.Timer;
	private timeoutFlag: boolean;
	private keepaliveTimer: NodeJS.Timer;
	private reconnectDelay = 0;
	private reconnectDelayMax: number;
	private timeout: number;
	private keepalive: number;
	constructor(opts: any) {
		super();
		this.clientId = "MQTT_ADMIN_" + Date.now();
		this.id = opts.id;
		this.requests = {};
		this.connectedTimes = 1;
		this.host = <any>null;
		this.port = <any>null;
		this.socket = <any>null;
		this.lastPing = -1;
		this.lastPong = -1;
		this.closed = false;
		this.timeoutId = <any>null;
		this.connected = false;
		this.reconnectId = <any>null;
		this.timeoutFlag = false;
		this.keepaliveTimer = <any>null;
		this.reconnectDelay = 0;
		this.reconnectDelayMax =
			opts.reconnectDelayMax ||
			constants.DEFAULT_PARAM.RECONNECT_DELAY_MAX;
		this.timeout = opts.timeout || constants.DEFAULT_PARAM.TIMEOUT;
		this.keepalive = opts.keepalive || constants.DEFAULT_PARAM.KEEPALIVE;
	}

	connect(host?: string, port?: number, cb?: Function) {
		cb = cb || function() {};
		if (this.connected) {
			return cb(new Error("MqttClient has already connected."));
		}

		if (host) {
			this.host = host;
		} else {
			host = this.host;
		}

		if (port) {
			this.port = port;
		} else {
			port = this.port;
		}

		this.closed = false;

		let stream = net.createConnection(this.port, this.host);
		this.socket = new MqttCon(stream);

		// logger.info('try to connect %s %s', this.host, this.port);
		this.socket.connect({
			clientId: this.clientId
		});

		this.addTimeout();

		this.socket.on("connack", () => {
			if (this.connected) {
				return;
			}

			this.connected = true;

			this.setupKeepAlive();

			if (this.connectedTimes++ == 1) {
				this.emit("connect");
				cb!();
			} else {
				this.emit("reconnect");
			}
		});

		this.socket.on("publish", pkg => {
			let topic = pkg.topic;
			let msg = pkg.payload.toString();
			msg = JSON.parse(msg);

			// logger.debug('[MqttClient] publish %s %j', topic, msg);
			this.emit(topic, msg);
		});

		this.socket.on("close", () => {
			logger.error(
				"mqtt socket is close, remote server host: %s, port: %s",
				host,
				port
			);
			this.onSocketClose();
		});

		this.socket.on("error", err => {
			logger.error(
				"mqtt socket is error, remote server host: %s, port: %s",
				host,
				port
			);
			// this.emit('error', new Error('[MqttClient] socket is error, remote server ' + host + ':' + port));
			this.onSocketClose();
		});

		this.socket.on("pingresp", () => {
			this.lastPong = Date.now();
		});

		this.socket.on("disconnect", () => {
			logger.error(
				"mqtt socket is disconnect, remote server host: %s, port: %s",
				host,
				port
			);
			this.emit("disconnect", this.id);
			this.onSocketClose();
		});

		this.socket.on("timeout", reconnectFlag => {
			if (reconnectFlag) {
				this.reconnect();
			} else {
				this.exit();
			}
		});
	}

	send(topic: string, msg: any) {
		// console.log('MqttClient send %s %j ~~~', topic, msg);
		this.socket.publish({
			topic: topic,
			payload: JSON.stringify(msg)
		});
	}

	onSocketClose() {
		// console.log('onSocketClose ' + this.closed);
		if (this.closed) {
			return;
		}

		clearInterval(this.keepaliveTimer);
		clearTimeout(this.timeoutId);
		this.keepaliveTimer = <any>null;
		this.lastPing = -1;
		this.lastPong = -1;
		this.connected = false;
		this.closed = true;
		delete this.socket;
		this.socket = <any>null;

		if (this.connectedTimes > 1) {
			this.reconnect();
		} else {
			this.exit();
		}
	}

	addTimeout(reconnectFlag?: any) {
		if (this.timeoutFlag) {
			return;
		}

		this.timeoutFlag = true;

		this.timeoutId = setTimeout(() => {
			this.timeoutFlag = false;
			logger.error(
				"mqtt client connect %s:%d timeout %d s",
				this.host,
				this.port,
				this.timeout / 1000
			);
			this.socket.emit("timeout", reconnectFlag);
		}, this.timeout);
	}

	reconnect() {
		let delay =
			this.reconnectDelay * 2 || constants.DEFAULT_PARAM.RECONNECT_DELAY;
		if (delay > this.reconnectDelayMax) {
			delay = this.reconnectDelayMax;
		}

		this.reconnectDelay = delay;

		// logger.debug('[MqttClient] reconnect %d ...', delay);
		this.reconnectId = setTimeout(() => {
			logger.info("reconnect delay %d s", delay / 1000);
			this.addTimeout(true);
			this.connect();
		}, delay);
	}

	setupKeepAlive() {
		clearTimeout(this.reconnectId);
		clearTimeout(this.timeoutId);

		this.keepaliveTimer = setInterval(() => {
			this.checkKeepAlive();
		}, this.keepalive);
	}

	checkKeepAlive() {
		if (this.closed) {
			return;
		}

		let now = Date.now();
		let KEEP_ALIVE_TIMEOUT = this.keepalive * 2;
		if (this.lastPing > 0) {
			if (this.lastPong < this.lastPing) {
				if (now - this.lastPing > KEEP_ALIVE_TIMEOUT) {
					logger.error(
						"mqtt rpc client checkKeepAlive error timeout for %d",
						KEEP_ALIVE_TIMEOUT
					);
					this.close();
				}
			} else {
				this.socket.pingreq();
				this.lastPing = Date.now();
			}
		} else {
			this.socket.pingreq();
			this.lastPing = Date.now();
		}
	}

	disconnect() {
		this.close();
	}

	close() {
		this.connected = false;
		this.closed = true;
		this.socket.disconnect();
	}

	exit() {
		logger.info("exit ...");
		process.exit(0);
	}
}
